import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { placeBox } from '../src/canvas.ts';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('placement skips occupied rectangles without changing existing positions', () => {
  const occupied = [{ x: 360, y: 0, width: 300, height: 250 }, { x: 360, y: 290, width: 300, height: 400 }, { x: 0, y: 0, width: 288, height: 800 }];
  const before = structuredClone(occupied);
  assert.deepEqual(placeBox({ x: 360, y: 20 }, { width: 288, height: 200 }, occupied), { x: 360, y: 738 });
  assert.deepEqual(placeBox({ x: 800, y: -200 }, { width: 288, height: 200 }, occupied), { x: 800, y: -200 });
  assert.deepEqual(occupied, before);
});

test('positions migrate, save during streaming, reject invalid coordinates and survive restart with anchors intact', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-position-')), 'trees.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec('CREATE TABLE trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL)');
  legacy.close();
  let store = new Store(path);
  const root = store.create('Root');
  const text = '🌲 repeated and 🌲 repeated';
  const messageId = store.message(root.id, 'assistant', text, 'completed');
  const anchor = { messageId, start: text.lastIndexOf('🌲'), end: text.length, text: '🌲 repeated', question: 'Second occurrence' };
  const child = store.branch(root, anchor, 'Fixed context');
  assert.equal(store.tree(root.id).x, null);
  const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {} });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (id, body) => fetch(`${origin}/api/trees/${id}/position`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  try {
    app.active.set(child.id, new AbortController());
    for (const body of [{ x: null, y: 1 }, { x: '1', y: 2 }, { x: 2 }, { x: 1e7, y: 0 }]) assert.equal((await post(child.id, body)).status, 400);
    assert.equal((await post('missing', { x: 0, y: 0 })).status, 404);
    assert.equal((await post(child.id, { x: -125.5, y: 802.25 })).status, 200);
    assert.equal((await post(root.id, { x: 0, y: 20 })).status, 200);
    const { trees } = await (await fetch(`${origin}/api/state`)).json();
    assert.deepEqual(trees.filter(t => t.id === child.id).map(t => [t.x, t.y, t.messageId, t.start, t.end]), [[-125.5, 802.25, messageId, anchor.start, anchor.end]]);
    assert.deepEqual(store.tree(child.id).branch, child.branch);
    app.stop(); store.close();
    store = new Store(path);
    assert.deepEqual([store.tree(child.id).x, store.tree(child.id).y], [-125.5, 802.25]);
    assert.deepEqual(store.tree(child.id).branch, child.branch);
  } finally { if (app.server.listening) app.stop(); store.close(); }
});
