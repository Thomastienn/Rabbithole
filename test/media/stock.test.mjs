import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
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
