import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FLUENT, fluentIndex, keywordMatch, stockIndex } from '../../server/media/stock.mjs';

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
    { id: 'fluent-emoji:coin', title: 'Coin', type: 'emoji' },
  ]);
  assert.deepEqual(keywordMatch(index, 'server'), []);
});
