import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FLUENT,
  POLYFORK,
  fluentIndex,
  polyforkIndex,
  keywordMatch,
  stockCatalog,
  stockIndex,
} from '../../server/media/stock.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const listing = {
  truncated: false,
  tree: [
    { path: 'assets/Horse/Flat/horse_flat.svg' },
    { path: 'assets/Horse/Color/horse_color.svg' },
    { path: 'assets/Horse/metadata.json' },
    { path: 'assets/Horse face/Flat/horse_face_flat.svg' },
    { path: 'assets/Carousel horse/Flat/carousel_horse_flat.svg' },
    { path: 'assets/Horse racing/Default/Flat/horse_racing_flat_default.svg' },
    { path: 'assets/Horse racing/Dark/Flat/horse_racing_flat_dark.svg' },
    { path: 'assets/Coin/Flat/coin_flat.svg' },
  ],
};
const catalog = { ...FLUENT, hash: sha(JSON.stringify(fluentIndex(listing))) };

test('the stock index accepts a matching download, reuses a matching cache and refuses a mismatch or failed download', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-stock-')),
    urls = [];
  const fake = async (url) => (urls.push(url), structuredClone(listing));
  const index = await stockIndex(dir, fake, catalog);
  assert.deepEqual(urls, [
    `https://api.github.com/repos/${FLUENT.repo}/git/trees/${FLUENT.revision}?recursive=1`,
  ]);
  assert.deepEqual(
    index.map((e) => e.id),
    [
      'fluent-emoji:carousel_horse',
      'fluent-emoji:coin',
      'fluent-emoji:horse',
      'fluent-emoji:horse_face',
      'fluent-emoji:horse_racing',
    ],
    'flat files only, the default skin tone once, each ID carrying the catalog prefix',
  );
  assert.deepEqual(await stockIndex(dir, fake, catalog), index);
  assert.equal(urls.length, 1, 'a cached index with a matching hash is not downloaded again');

  const other = mkdtempSync(join(tmpdir(), 'tt-stock-'));
  const tampered = async () => ({
    tree: [...listing.tree, { path: 'assets/Evil/Flat/evil_flat.svg' }],
  });
  await assert.rejects(stockIndex(other, tampered, catalog), /does not match its recorded hash/);
  assert.ok(!existsSync(join(other, 'stock')), 'a mismatched index is not kept');
  await assert.rejects(
    stockIndex(other, async () => ({ ...listing, truncated: true }), catalog),
    /download failed.*incomplete/,
  );
  await assert.rejects(
    stockIndex(
      other,
      async () => {
        throw new Error('offline');
      },
      catalog,
    ),
    /download failed.*offline/,
  );
  writeFileSync(join(dir, 'stock', `fluent-emoji-${FLUENT.revision}.json`), '[]');
  await assert.rejects(
    stockIndex(dir, tampered, catalog),
    /does not match/,
    'a corrupt cache is checked again',
  );
});

test('keyword matching returns at most the top 3 pieces per name, closest title first', () => {
  const index = fluentIndex(listing);
  assert.deepEqual(
    keywordMatch(index, 'horses').map((p) => p.title),
    ['Horse', 'Carousel horse', 'Horse face'],
  );
  assert.deepEqual(keywordMatch(index, 'a coin'), [
    { id: 'fluent-emoji:coin', title: 'Coin', type: 'emoji', dimension: undefined },
  ]);
  assert.deepEqual(keywordMatch(index, 'server'), []);
});

test('a piece fetches once at the pinned revision, then comes from the cache; an unknown ID is null', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-stock-')),
    urls = [];
  const svg = '<svg viewBox="0 0 32 32"><path d="M0 0h32v32z" fill="#8B5E3C"/></svg>';
  const fetchPiece = async (url) => (urls.push(url), svg);
  const stock = stockCatalog(dir, async () => structuredClone(listing), fetchPiece, [catalog]);
  assert.equal(await stock.piece('fluent-emoji:horse_racing'), svg);
  assert.equal(await stock.piece('fluent-emoji:horse_racing'), svg);
  assert.deepEqual(urls, [
    `https://raw.githubusercontent.com/${FLUENT.repo}/${FLUENT.revision}/assets/Horse%20racing/Default/Flat/horse_racing_flat_default.svg`,
  ]);
  const again = stockCatalog(dir, async () => structuredClone(listing), fetchPiece, [catalog]);
  assert.equal(await again.piece('fluent-emoji:horse_racing'), svg);
  assert.equal(urls.length, 1, 'a new process reads the cached file');
  assert.equal(await stock.piece('fluent-emoji:unicorn'), null);
  assert.equal(urls.length, 1);
  const failing = stockCatalog(
    dir,
    async () => structuredClone(listing),
    async () => {
      throw new Error('offline');
    },
    [catalog],
  );
  await assert.rejects(failing.piece('fluent-emoji:coin'), /coin download failed: offline/);
  const html = stockCatalog(
    dir,
    async () => structuredClone(listing),
    async () => '<html>',
    [catalog],
  );
  await assert.rejects(html.piece('fluent-emoji:coin'), /not an SVG/);
  assert.ok(!existsSync(join(dir, 'stock', 'pieces', 'fluent-emoji%3Acoin.svg')));
});

const models = {
  assets: [
    {
      id: 'horse-3d-a1b2c3',
      title: 'Horse',
      type: 'animal',
      glb: 'https://polyfork.dev/cdn/horse-3d-a1b2c3.glb',
      module: 'https://polyfork.dev/cdn/horse-3d-a1b2c3.mjs',
    },
    { id: 'evil-000000', title: 'Evil', type: 'prop', glb: 'https://example.test/evil.glb' },
  ],
};
const polyfork = { ...POLYFORK, hash: sha(JSON.stringify(polyforkIndex(models))) };
const both = async (url) => structuredClone(url.endsWith('catalog.json') ? models : listing);

test('the Polyfork index downloads at its pinned revision, keeps only CDN GLB entries and refuses a hash mismatch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-stock-')),
    urls = [];
  const index = await stockIndex(dir, async (url) => (urls.push(url), both(url)), polyfork);
  assert.deepEqual(urls, [
    `https://raw.githubusercontent.com/${POLYFORK.repo}/${POLYFORK.revision}/catalog.json`,
  ]);
  assert.deepEqual(index, [{ id: 'horse-3d-a1b2c3', title: 'Horse', type: 'animal' }]);
  const other = mkdtempSync(join(tmpdir(), 'tt-stock-'));
  const tampered = async () => ({
    assets: [...models.assets, { id: 'x-1', title: 'X', glb: 'https://polyfork.dev/cdn/x-1.glb' }],
  });
  await assert.rejects(
    stockIndex(other, tampered, polyfork),
    /index \(Polyfork\) does not match its recorded hash/,
  );
  assert.ok(!existsSync(join(other, 'stock')));
});

test('matches mix both catalogs marked 2D or 3D; a 3D piece fetches its GLB once, never the module', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-stock-')),
    urls = [];
  const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(8)]);
  const stock = stockCatalog(dir, both, async (url) => (urls.push(url), glb), [catalog, polyfork]);
  const [{ pieces }] = await stock.match(['horse']);
  assert.deepEqual(
    pieces.map((p) => [p.id, p.dimension]),
    [
      ['fluent-emoji:horse', '2D'],
      ['horse-3d-a1b2c3', '3D'],
      ['fluent-emoji:carousel_horse', '2D'],
    ],
  );
  assert.deepEqual(await stock.piece('horse-3d-a1b2c3'), glb);
  assert.deepEqual(await stock.piece('horse-3d-a1b2c3'), glb);
  assert.deepEqual(urls, ['https://polyfork.dev/cdn/horse-3d-a1b2c3.glb']);
  assert.equal(await stock.piece('evil-000000'), null);
  const fresh = stockCatalog(
    mkdtempSync(join(tmpdir(), 'tt-stock-')),
    both,
    async () => '<svg></svg>',
    [catalog, polyfork],
  );
  await assert.rejects(fresh.piece('horse-3d-a1b2c3'), /not a GLB file/);
  const offline = stockCatalog(
    dir,
    async (url) => {
      if (url.endsWith('catalog.json')) throw new Error('offline');
      return both(url);
    },
    undefined,
    [catalog, polyfork],
  );
  assert.equal(
    (await offline.match(['horse']))[0].pieces[0].dimension,
    '2D',
    'a failed catalog leaves the other usable',
  );
});

const embeddings = {
  'Carousel horse emoji': [100, 100],
  'Coin emoji': [100, 0],
  'Horse emoji': [2, 1],
  'Horse face emoji': [1000, -10000],
  'Horse racing emoji': [-1, 0],
  'Horse animal': [20, 1],
  steed: [3, 0],
  rider: [-2, 0],
  horses: [3, 0],
};

test('stock matches each object by cosine, keeps the top 3 and reuses catalog embeddings across calls and restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-stock-')),
    texts = [];
  const embed = async (input) => {
    texts.push(...input);
    return input.map((text) => {
      assert.ok(embeddings[text], `unexpected embedding text: ${text}`);
      return embeddings[text];
    });
  };
  const stock = stockCatalog(dir, both, undefined, [catalog, polyfork], embed);
  assert.deepEqual(await stock.match([]), []);
  assert.equal(texts.length, 0, 'an empty request does not prepare embeddings');
  const [result, concurrent] = await Promise.all([
    stock.match(['steed', 'rider']),
    stock.match(['steed']),
  ]);
  assert.deepEqual(result, [
    {
      object: 'steed',
      pieces: [
        { id: 'fluent-emoji:coin', title: 'Coin', type: 'emoji', dimension: '2D' },
        { id: 'horse-3d-a1b2c3', title: 'Horse', type: 'animal', dimension: '3D' },
        { id: 'fluent-emoji:horse', title: 'Horse', type: 'emoji', dimension: '2D' },
      ],
    },
    {
      object: 'rider',
      pieces: [
        { id: 'fluent-emoji:horse_racing', title: 'Horse racing', type: 'emoji', dimension: '2D' },
        { id: 'fluent-emoji:horse_face', title: 'Horse face', type: 'emoji', dimension: '2D' },
        {
          id: 'fluent-emoji:carousel_horse',
          title: 'Carousel horse',
          type: 'emoji',
          dimension: '2D',
        },
      ],
    },
  ]);
  assert.deepEqual(concurrent, [result[0]]);
  assert.deepEqual(await stock.match(['steed', 'rider']), result);
  const fresh = stockCatalog(
    dir,
    async () => assert.fail('cached indexes need no network'),
    undefined,
    [catalog, polyfork],
    embed,
  );
  assert.deepEqual(await fresh.match(['steed', 'rider']), result);
  assert.deepEqual(
    (await fresh.match(['steed'], '2D'))[0].pieces.map((p) => p.title),
    ['Coin', 'Horse', 'Carousel horse'],
    'dimension filtering happens before picking the top 3',
  );
  for (const text of Object.keys(embeddings).filter((t) => t.includes(' ')))
    assert.equal(texts.filter((t) => t === text).length, 1, `${text} is embedded once`);
});

test('stock falls back to keywords without an embedder or on preparation/query failure, and recovers later', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-stock-'));
  const plain = stockCatalog(dir, both, undefined, [catalog, polyfork]);
  const keywords = await plain.match(['horses']);
  assert.equal(keywords[0].pieces.length, 3);
  assert.equal(keywords[0].pieces[0].id, 'fluent-emoji:horse');
  let available = false;
  const texts = [];
  const embed = async (input) => {
    if (!available) throw new Error('model unavailable');
    texts.push(...input);
    return input.map((text) => embeddings[text]);
  };
  const stock = stockCatalog(dir, both, undefined, [catalog, polyfork], embed);
  assert.deepEqual(await stock.match(['horses']), keywords, 'preparation failure');
  available = true;
  assert.equal((await stock.match(['steed']))[0].pieces[0].title, 'Coin');
  available = false;
  assert.deepEqual(await stock.match(['horses']), keywords, 'query failure with prepared entries');
  available = true;
  assert.equal((await stock.match(['steed']))[0].pieces[0].title, 'Coin');
  for (const text of Object.keys(embeddings).filter((t) => t.includes(' ')))
    assert.equal(texts.filter((t) => t === text).length, 1, `${text} is not prepared twice`);
});

test('a corrupt vector cache or changed catalog is prepared again instead of returning stale matches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-stock-')),
    path = join(dir, 'stock', `${catalog.file}-${catalog.revision}-embeddings.json`),
    texts = [];
  const embed = async (input) => {
    texts.push(...input);
    return input.map((text) => (text === 'Mare emoji' ? [0, 1] : embeddings[text]));
  };
  const fresh = (data = listing, spec = catalog) =>
    stockCatalog(dir, async () => data, undefined, [spec], embed);
  const result = await fresh().match(['steed']);
  for (const corrupt of [
    '{',
    JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), vectors: [[1, null]] }),
    JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), key: 'old-model' }),
  ]) {
    writeFileSync(path, corrupt);
    assert.deepEqual(await fresh().match(['steed']), result);
  }
  const changed = {
    tree: listing.tree.map(({ path }) => ({ path: path.replace('assets/Horse/', 'assets/Mare/') })),
  };
  assert.deepEqual(
    (
      await fresh(changed, { ...catalog, hash: sha(JSON.stringify(fluentIndex(changed))) }).match([
        'steed',
      ])
    )[0].pieces.map((p) => p.title),
    ['Coin', 'Carousel horse', 'Horse face'],
  );
  assert.equal(texts.filter((t) => t === 'Horse emoji').length, 4);
  assert.equal(texts.filter((t) => t === 'Mare emoji').length, 1);
});
