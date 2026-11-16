import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

test('the piece routes list the library with its saved videos and read one piece compiled for the player', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-pieces-http-')),
    store = new Store(join(dir, 'trees.sqlite')),
    app = createApp({
      store,
      provider: { models: async () => [], generate: async () => assert.fail('no provider call') },
      dir,
      auth: { status: () => ({ connected: true }) },
    });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    app.stop();
    store.close();
  });
  const get = async (p) => {
    const r = await fetch(`http://127.0.0.1:${app.server.address().port}${p}`);
    return [r.status, await r.json()];
  };
  assert.deepEqual(await get('/api/pieces'), [200, []], 'the library starts empty');
  store.db
    .prepare('INSERT INTO videos(id,title,description,duration,created) VALUES (?,?,?,?,?)')
    .run('v1', 'Elections', 'd', 3, 1);
  const source =
    "import { colors } from './kit';\nexport function Winner({ x, y }: { x: number; y: number }) { return <div style={{ left: x, top: y, color: colors.winner }} />; }";
  const id = store.savePiece(
    {
      name: 'Winner',
      look: 'A gold trophy',
      props: ['x', 'y'],
      source,
      roles: ['winner'],
      embedding: [1, 0],
    },
    'v1',
  );
  store.usePiece(id, 'unsaved-video');
  const [status, list] = await get('/api/pieces');
  assert.equal(status, 200);
  assert.deepEqual(
    list.map(({ improved, ...p }) => (assert.ok(improved > 0), p)),
    [{ id, name: 'Winner', look: 'A gold trophy', videos: [{ id: 'v1', title: 'Elections' }] }],
    'only saved library videos are listed as users',
  );
  const [, piece] = await get(`/api/pieces/${id}`);
  assert.equal(piece.source, source, 'the original source, unchanged');
  assert.deepEqual(piece.roles, ['winner']);
  assert.equal(piece.embedding, undefined, 'the embedding stays on the server');
  assert.match(piece.code, /exports\.Winner = Winner/);
  assert.match(piece.code, /require\("\.\/kit"\)/);
  assert.doesNotMatch(piece.code, /<div/, 'JSX is compiled away');
  assert.equal((await get('/api/pieces/missing'))[0], 404);
});
