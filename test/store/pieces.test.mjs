import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { FLUENT, fluentIndex, stockCatalog } from '../../server/media/stock.mjs';

const entry = (name, embedding) => ({
  name,
  look: `${name} look`,
  props: ['x', 'y', 'scale', 'highlight', 'state'],
  source: `export function ${name}() { return null; }`,
  roles: ['winner'],
  embedding,
});

test('the piece library saves pieces, reads embeddings back, ranks the top 5 by cosine and records videos', (t) => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite'));
  t.after(() => store.close());
  assert.deepEqual(store.nearestPieces([1, 0]), [], 'the library starts empty');
  const ids = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    store.savePiece(entry(`P${i}`, [Math.cos(i / 4), Math.sin(i / 4), 0]), 'video-a'),
  );
  const bare = store.savePiece(entry('Bare', null), 'video-a');
  const piece = store.piece(ids[2]);
  assert.equal(piece.name, 'P2');
  assert.deepEqual(piece.props, entry().props);
  assert.deepEqual(piece.roles, ['winner']);
  assert.equal(piece.embedding.length, 3);
  assert.ok(Math.abs(piece.embedding[0] - Math.cos(0.5)) < 1e-6, 'Float32 blob round-trips');
  assert.ok(piece.created > 0 && piece.improved === piece.created);
  assert.equal(store.piece(bare).embedding, null);
  const top = store.nearestPieces([Math.cos(1.5), Math.sin(1.5), 0]);
  assert.deepEqual(
    top.map((p) => p.name),
    ['P6', 'P5', 'P4', 'P3', 'P2'],
    'top 5 by cosine; unembedded pieces are skipped',
  );
  assert.ok(top[0].score > top[1].score);
  store.usePiece(ids[0], 'video-b');
  store.usePiece(ids[0], 'video-b');
  assert.deepEqual(store.piece(ids[0]).videos, ['video-a', 'video-b']);
});

test('preparing and matching stock entries leaves the piece library and its nearest pieces unchanged', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-pieces-')),
    store = new Store(join(dir, 'trees.sqlite'));
  t.after(() => store.close());
  const id = store.savePiece(entry('Drawn', [1, 0]), 'video-a'),
    before = store.pieceList(),
    listing = { tree: [{ path: 'assets/Horse/Flat/horse_flat.svg' }] };
  const catalog = {
    ...FLUENT,
    hash: createHash('sha256')
      .update(JSON.stringify(fluentIndex(listing)))
      .digest('hex'),
  };
  const stock = stockCatalog(
    dir,
    async () => listing,
    undefined,
    [catalog],
    async (texts) => texts.map(() => [1, 0]),
  );
  assert.equal((await stock.match(['horse']))[0].pieces[0].id, 'fluent-emoji:horse');
  assert.deepEqual(store.pieceList(), before);
  assert.deepEqual(store.unembeddedPieces(), []);
  assert.deepEqual(
    store.nearestPieces([1, 0]).map((p) => p.id),
    [id],
  );
});
