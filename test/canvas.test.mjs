import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseViewport, placeBox, offsetCoveredBoxes, vimAction } from '../src/canvas.ts';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { layoutSaver, LAYOUT_SAVE_MS } from '../src/layoutSave.ts';

test('saved viewport accepts exact coordinates and rejects corrupt or unsupported views', () => {
  assert.deepEqual(parseViewport('{"x":-12.125,"y":810.25,"zoom":0.725}'), {
    x: -12.125,
    y: 810.25,
    zoom: 0.725,
  });
  assert.deepEqual(
    parseViewport('{"x":0,"y":0,"zoom":0.001}'),
    { x: 0, y: 0, zoom: 0.001 },
    'large-tree Fit viewport can be restored',
  );
  for (const value of [
    null,
    '',
    'broken',
    'null',
    '{}',
    '{"x":"1","y":0,"zoom":1}',
    '{"x":1e999,"y":0,"zoom":1}',
    '{"x":0,"y":0,"zoom":0.0001}',
    '{"x":0,"y":0,"zoom":2}',
  ])
    assert.equal(parseViewport(value), undefined);
});

test('placement skips occupied rectangles without changing existing positions', () => {
  const occupied = [
    { x: 360, y: 0, width: 300, height: 250 },
    { x: 360, y: 290, width: 300, height: 400 },
    { x: 0, y: 0, width: 288, height: 800 },
  ];
  const before = structuredClone(occupied);
  assert.deepEqual(placeBox({ x: 360, y: 20 }, { width: 288, height: 200 }, occupied), {
    x: 360,
    y: 738,
  });
  assert.deepEqual(placeBox({ x: 800, y: -200 }, { width: 288, height: 200 }, occupied), {
    x: 800,
    y: -200,
  });
  assert.deepEqual(occupied, before);
});

test('message-row placement keeps the source height when free and clears branches already beside that row', () => {
  const parent = { x: -240, y: 60, width: 256, height: 900 };
  const preferred = { x: parent.x + parent.width + 72, y: parent.y + 230.5 };
  const size = { width: 256, height: 160 };
  const first = placeBox(preferred, size, [parent]);
  assert.deepEqual(first, preferred);
  const second = placeBox(preferred, size, [parent, { ...first, ...size }]);
  assert.deepEqual(second, { x: preferred.x, y: first.y + size.height + 48 });
  assert.deepEqual(
    placeBox({ ...preferred, y: 800 }, size, [
      parent,
      { ...first, ...size },
      { ...second, ...size },
    ]),
    { ...preferred, y: 800 },
  );
});

const box = (id, x, y, height = 100, parent = null, extra = {}) => ({
  id,
  parent,
  x,
  y,
  width: 256,
  height,
  ...extra,
});

test('growth shifts covered subtrees by the overlap and clearance, cascading only where covered', () => {
  const boxes = [
    box('growing', 0, 0, 220),
    box('below', 0, 200),
    box('child', 360, 240, 100, 'below'),
    box('hidden', 720, 280, 100, 'child', { hidden: true }),
    box('cascade', 360, 400),
    box('aside', 1080, 210),
    box('above', 0, -200),
  ];
  const before = structuredClone(boxes);
  const moved = offsetCoveredBoxes(boxes, ['growing']);
  assert.deepEqual(moved, {
    below: { x: 0, y: 268 },
    child: { x: 360, y: 308 },
    hidden: { x: 720, y: 348 },
    cascade: { x: 360, y: 456 },
  });
  assert.deepEqual(boxes, before, 'pure rule does not mutate input');
  assert.deepEqual(
    offsetCoveredBoxes(
      boxes.map((b) => ({ ...b, ...moved[b.id] })),
      ['growing'],
    ),
    {},
    'settled map is idle',
  );
  assert.deepEqual(offsetCoveredBoxes(boxes, []), {}, 'unrelated manual overlaps are left alone');
});

test('hidden boxes take no space; revealing reconciles overlaps with boxes above or below', () => {
  const boxes = [
    box('upper', 0, 0, 200),
    box('revealed', 0, 100),
    box('child', 360, 140, 100, 'revealed'),
    box('lower', 0, 330),
    box('hidden', 0, 250, 200, null, { hidden: true }),
  ];
  assert.deepEqual(offsetCoveredBoxes(boxes, [], ['revealed']), {
    revealed: { x: 0, y: 248 },
    child: { x: 360, y: 288 },
    lower: { x: 0, y: 396 },
  });
  assert.deepEqual(
    offsetCoveredBoxes(
      boxes.map((b) => (b.id === 'revealed' || b.id === 'child' ? { ...b, hidden: true } : b)),
      ['upper'],
    ),
    {},
    'folded descendants are not obstacles',
  );
  assert.deepEqual(offsetCoveredBoxes(boxes, ['hidden']), {}, 'hidden growth has no effect');
});

test('a descendant colliding after a shift carries its already-moving subtree with it', () => {
  const boxes = [
    box('growing', 0, 0, 220),
    box('below', 0, 200),
    box('child', 360, 240, 100, 'below'),
    box('blocker', 360, 280),
  ];
  assert.deepEqual(offsetCoveredBoxes(boxes, ['growing']), {
    below: { x: 0, y: 388 },
    child: { x: 360, y: 428 },
  });
});

test('interleaved moving subtrees settle in a stable order without chasing each other', () => {
  const boxes = [
    box('s1', 0, -200, 500),
    box('s2', 360, -200, 500),
    box('a', 0, 0, 1500),
    box('b', 360, 0, 1500),
    box('ac', 360, 1000, 1500, 'a'),
    box('bc', 0, 1000, 1500, 'b'),
  ];
  assert.deepEqual(offsetCoveredBoxes(boxes, ['s1', 's2']), {
    a: { x: 0, y: 348 },
    ac: { x: 360, y: 1348 },
    b: { x: 360, y: 2896 },
    bc: { x: 0, y: 3896 },
  });
});

test('growing boxes and dragged boxes never move, including inside a covered subtree', () => {
  const boxes = [
    box('growing', 0, 0, 220),
    box('below', 0, 200),
    box('dragged', 360, 240, 100, 'below', { dragging: true }),
  ];
  assert.deepEqual(
    offsetCoveredBoxes(boxes, ['growing']),
    {},
    'defer entire subtree to preserve its shape while a descendant is dragged',
  );
  assert.deepEqual(
    offsetCoveredBoxes(
      boxes.map((b) => ({ ...b, dragging: b.id === 'below' })),
      ['growing'],
    ),
    {},
  );
  assert.deepEqual(
    offsetCoveredBoxes(
      boxes.map((b) => ({ ...b, dragging: false })),
      ['growing'],
    ),
    { below: { x: 0, y: 268 }, dragged: { x: 360, y: 308 } },
    'retry after release',
  );
  assert.deepEqual(
    offsetCoveredBoxes(boxes, ['growing', 'below']),
    {},
    'concurrent growing nodes are pinned',
  );
});

test('clear neighbours keep their manual spacing and equal-height collisions keep the growing node pinned', () => {
  assert.deepEqual(
    offsetCoveredBoxes(
      [box('growing', 0, 0, 220), box('beside', 270, 50), box('below', 0, 230)],
      ['growing'],
    ),
    {},
  );
  assert.deepEqual(
    offsetCoveredBoxes([box('neighbour', 0, 0), box('growing', 0, 0, 220)], ['growing']),
    { neighbour: { x: 0, y: 268 } },
  );
});

test('growth positions use the coalesced layout route, persist across SQLite restart, and leave idle layout clean', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-growth-')), 'trees.sqlite');
  let store = new Store(path);
  const root = store.create('Growing root'),
    source = store.message(root.id, 'assistant', 'Source', 'completed');
  const child = store.branch(
    root,
    { messageId: source, start: 0, end: 6, text: 'Source', question: 'Lower branch' },
    'Fixed context',
  );
  store.position(root.id, 0, 0);
  store.position(child.id, 0, 200);
  const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {} });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(`${origin}/api/state`)).json();
  let tick,
    writes = 0;
  const saver = layoutSaver(
    async (id, batch) => {
      writes++;
      const res = await fetch(`${origin}/api/trees/${id}/layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify({ ...batch.layout, positions: batch.positions }),
      });
      assert.equal(res.status, 200);
    },
    () => {},
    {
      set: (fn, ms) => {
        assert.equal(ms, LAYOUT_SAVE_MS);
        tick = fn;
        return 1;
      },
      clear: () => {
        tick = undefined;
      },
    },
  );
  try {
    for (const height of [220, 260, 300])
      saver.mark(
        root.id,
        { folded: [], selected: root.id, panel: 'beside', viewport: { x: 0, y: 0, zoom: 0.001 } },
        offsetCoveredBoxes(
          [box(root.id, 0, 0, height), box(child.id, 0, 200, 100, root.id)],
          [root.id],
        ),
      );
    assert.equal(writes, 0);
    assert.equal(store.tree(child.id).y, 200, 'no early position writes');
    assert.ok(tick, 'one minute scheduled');
    await saver.flush();
    assert.equal(writes, 1);
    assert.equal(store.tree(child.id).y, 348);
    assert.equal(tick, undefined, 'idle timer removed');
    app.stop();
    store.close();
    store = new Store(path);
    assert.deepEqual(
      [
        store.tree(root.id).x,
        store.tree(root.id).y,
        store.tree(child.id).x,
        store.tree(child.id).y,
      ],
      [0, 0, 0, 348],
    );
    assert.equal(store.tree(child.id).branch.snapshot, 'Fixed context');
    assert.equal(store.list().find((t) => t.id === root.id).layout.viewport.zoom, 0.001);
  } finally {
    saver.dispose();
    if (app.server.listening) app.stop();
    store.close();
  }
});

test('positions migrate, save during streaming, reject invalid coordinates and survive restart with anchors intact', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-position-')), 'trees.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(
    'CREATE TABLE trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL)',
  );
  legacy.close();
  let store = new Store(path);
  const root = store.create('Root');
  const text = '🌲 repeated and 🌲 repeated';
  const messageId = store.message(root.id, 'assistant', text, 'completed');
  const anchor = {
    messageId,
    start: text.lastIndexOf('🌲'),
    end: text.length,
    text: '🌲 repeated',
    question: 'Second occurrence',
  };
  const child = store.branch(root, anchor, 'Fixed context');
  assert.equal(store.tree(root.id).x, null);
  const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {} });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (id, body) =>
    fetch(`${origin}/api/trees/${id}/position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify(body),
    });
  try {
    app.active.set(child.id, new AbortController());
    for (const body of [{ x: null, y: 1 }, { x: '1', y: 2 }, { x: 2 }, { x: 1e7, y: 0 }])
      assert.equal((await post(child.id, body)).status, 400);
    assert.equal((await post('missing', { x: 0, y: 0 })).status, 404);
    assert.equal((await post(child.id, { x: -125.5, y: 802.25 })).status, 200);
    assert.equal((await post(root.id, { x: 0, y: 20 })).status, 200);
    const { trees } = await (await fetch(`${origin}/api/state`)).json();
    assert.deepEqual(
      trees.filter((t) => t.id === child.id).map((t) => [t.x, t.y, t.messageId, t.start, t.end]),
      [[-125.5, 802.25, messageId, anchor.start, anchor.end]],
    );
    assert.deepEqual(store.tree(child.id).branch, child.branch);
    app.stop();
    store.close();
    store = new Store(path);
    assert.deepEqual([store.tree(child.id).x, store.tree(child.id).y], [-125.5, 802.25]);
    assert.deepEqual(store.tree(child.id).branch, child.branch);
  } finally {
    if (app.server.listening) app.stop();
    store.close();
  }
});

test('Vim aliases map only the agreed plain keys to existing canvas actions', () => {
  const key = (k, extra = {}) =>
    vimAction({
      key: k,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      defaultPrevented: false,
      ...extra,
    });
  assert.deepEqual(
    ['h', 'j', 'k', 'l', 'H', 'J', 'K', 'L', '=', '+', '-', 'f'].map((k) => key(k)),
    [
      'ArrowLeft',
      'ArrowDown',
      'ArrowUp',
      'ArrowRight',
      'ArrowLeft',
      'ArrowDown',
      'ArrowUp',
      'ArrowRight',
      'zoomIn',
      'zoomIn',
      'zoomOut',
      'fit',
    ],
  );
  for (const k of [
    'F',
    '_',
    'a',
    'g',
    'Escape',
    'Enter',
    ' ',
    'Tab',
    'ArrowLeft',
    'toString',
    'constructor',
  ])
    assert.equal(key(k), undefined, k);
  for (const extra of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { defaultPrevented: true },
    { isComposing: true },
    { keyCode: 229 },
  ])
    assert.equal(key('f', extra), undefined, JSON.stringify(extra));
});
