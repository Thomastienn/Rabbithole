import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

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

test('the piece list pages newest-improved first and searches by meaning or, without a vector, by name and look text', (t) => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-pieces-')), 'trees.sqlite'));
  t.after(() => store.close());
  assert.deepEqual(store.pieceList(), { total: 0, pieces: [] });
  const save = (name, look, embedding) => {
    const id = store.savePiece({ ...entry(name, embedding), look });
    store.db.prepare('UPDATE pieces SET improved=? WHERE id=?').run(store.pieceList().total, id);
    return id;
  };
  save('Rocket', 'A tall launch vehicle', [1, 0]);
  save('Tree', 'An OAK with green leaves', [0, 1]);
  save('Ship', 'A rusty cargo vessel', [0.8, 0.6]);
  save('Old', 'Saved before embeddings', null);
  const names = (list) => list.pieces.map((p) => p.name);
  assert.deepEqual(names(store.pieceList()), ['Old', 'Ship', 'Tree', 'Rocket']);
  const page = store.pieceList({ offset: 1, limit: 2 });
  assert.deepEqual([page.total, names(page)], [4, ['Ship', 'Tree']], 'one page, total of all');
  assert.deepEqual(names(store.pieceList({ query: 'oak' })), ['Tree'], 'case-insensitive look');
  assert.deepEqual(names(store.pieceList({ query: 'SHIP' })), ['Ship'], 'case-insensitive name');
  assert.deepEqual(store.pieceList({ query: 'zebra' }), { total: 0, pieces: [] });
  assert.deepEqual(
    names(store.pieceList({ query: 'spacecraft', vector: [1, 0] })),
    ['Rocket', 'Ship'],
    'ranked by cosine; distant and unembedded pieces drop out',
  );
  assert.deepEqual(
    names(store.pieceList({ query: 'old', vector: [1, 0] })),
    ['Old', 'Rocket', 'Ship'],
    'a text match still counts, and ranks first, under semantic search',
  );
});
