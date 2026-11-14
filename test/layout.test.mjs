import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('layout snapshots stay per tree, hold only IDs and survive restart; legacy trees still open', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-layout-')), 'trees.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(
    "CREATE TABLE trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL); INSERT INTO trees VALUES ('old','Old tree',NULL,1)",
  );
  legacy.close();
  let store = new Store(path);
  assert.equal(store.list().find((t) => t.id === 'old').layout, null);
  const first = store.create('First'),
    second = store.create('Second');
  const text = 'A long tutor reply that must never be copied into layout.';
  const messageId = store.message(first.id, 'assistant', text, 'completed');
  const child = store.branch(
    first,
    { messageId, start: 0, end: 6, text: 'A long', question: 'Why?' },
    'Fixed context',
  );
  const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {} });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (id, body) =>
    fetch(`${origin}/api/trees/${id}/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify(body),
    });
  try {
    for (const body of [
      {},
      { folded: 'x', selected: null, panel: 'beside' },
      { folded: [1], selected: null, panel: 'beside' },
      { folded: [], selected: 3, panel: 'beside' },
      { folded: [], selected: null, panel: 'wide' },
    ])
      assert.equal((await post(first.id, body)).status, 400);
    assert.equal(
      (await post(child.id, { folded: [], selected: null, panel: 'beside' })).status,
      400,
      'only roots own a snapshot',
    );
    assert.equal(
      (await post('missing', { folded: [], selected: null, panel: 'beside' })).status,
      404,
    );
    const firstLayout = { folded: [first.id], selected: child.id, panel: 'expanded' },
      secondLayout = { folded: [], selected: second.id, panel: 'collapsed' };
    assert.equal(
      (await post(first.id, { ...firstLayout, messages: [text], history: ['fold'] })).status,
      200,
    );
    assert.equal((await post(second.id, secondLayout)).status, 200);
    const { trees } = await (await fetch(`${origin}/api/state`)).json();
    assert.deepEqual(trees.find((t) => t.id === first.id).layout, firstLayout);
    assert.deepEqual(trees.find((t) => t.id === second.id).layout, secondLayout);
    assert.equal(trees.find((t) => t.id === 'old').layout, null);
    assert.equal((await fetch(`${origin}/api/trees/old`)).status, 200);
    const batch = {
      folded: [],
      selected: first.id,
      panel: 'collapsed',
      viewport: { x: 5, y: -6, zoom: 0.5 },
      positions: { [first.id]: { x: 10, y: 20 }, [child.id]: { x: 30, y: 40 } },
    };
    assert.equal(
      (await post(first.id, { ...batch, positions: { [second.id]: { x: 1, y: 1 } } })).status,
      400,
      'positions belong to the batch owner tree',
    );
    assert.equal((await post(first.id, batch)).status, 200);
    assert.deepEqual(store.list().find((t) => t.id === first.id).layout, {
      folded: [],
      selected: first.id,
      panel: 'collapsed',
      viewport: { x: 5, y: -6, zoom: 0.5 },
    });
    assert.deepEqual(
      [first.id, child.id, second.id].map((id) => {
        const t = store.list().find((t) => t.id === id);
        return [t.x, t.y];
      }),
      [
        [10, 20],
        [30, 40],
        [null, null],
      ],
    );
    assert.equal((await post(first.id, firstLayout)).status, 200);
    app.stop();
    store.close();
    store = new Store(path);
    const raw = store.db.prepare('SELECT id,layout FROM trees').all();
    assert.equal(
      raw.find((r) => r.id === first.id).layout,
      JSON.stringify(firstLayout),
      'persisted shape is IDs and panel mode only',
    );
    assert.ok(raw.every((r) => !r.layout?.includes(text)));
    assert.deepEqual(store.list().find((t) => t.id === second.id).layout, secondLayout);
    assert.equal(store.tree(first.id).messages[0].text, text);
    assert.deepEqual(store.tree(child.id).branch, child.branch);
  } finally {
    if (app.server.listening) app.stop();
    store.close();
  }
});
