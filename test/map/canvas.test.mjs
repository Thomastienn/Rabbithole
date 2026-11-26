import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
    parseViewport,
    placeBox,
    tidySlots,
    COLUMN,
    DOCK_COLUMN,
    offsetCoveredBoxes,
    clearParents,
    vimAction,
    zoomLabel,
} from '../../src/map/canvas.ts';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { layoutSaver, LAYOUT_SAVE_MS } from '../../src/map/layoutSave.ts';

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

test('tidy layout centres every card on its children, keeps sibling subtrees apart and new branches clear', () => {
    const card = (id, parent, height = 100) => ({ id, parent, height });
    // Mockup Map: 1.1 above, 1.2 beside and 1.3 below the trunk; 1.1 and 1.2 each have two children.
    const slots = tidySlots('1', [
        card('1', null, 300),
        card('1.1', '1'),
        card('1.2', '1', 200),
        card('1.3', '1'),
        card('1.1.1', '1.1'),
        card('1.1.2', '1.1'),
        card('1.2.1', '1.2'),
        card('1.2.2', '1.2'),
    ]);
    const centre = (id, height = 100) => slots.get(id).y + height / 2;
    assert.deepEqual(slots.get('1'), { x: 0, y: 0 });
    assert.equal(slots.get('1.1').x, COLUMN);
    assert.equal(slots.get('1.1.1').x, 2 * COLUMN);
    assert.ok(slots.get('1.1').y < 0 && slots.get('1.3').y > 300, '1.1 above the trunk, 1.3 below');
    for (const [parent, height, kids] of [
        ['1.1', 100, ['1.1.1', '1.1.2']],
        ['1.2', 200, ['1.2.1', '1.2.2']],
    ])
        assert.equal(
            centre(parent, height),
            (centre(kids[0]) + centre(kids[1])) / 2,
            `${parent} centred`,
        );
    assert.equal(
        centre('1', 300),
        (slots.get('1.1.1').y + slots.get('1.3').y + 100) / 2,
        'the trunk is centred on the whole stack of subtrees',
    );
    assert.ok(
        slots.get('1.2.1').y >= slots.get('1.1.2').y + 100 + 48,
        'cousin subtrees never overlap',
    );
    // A new branch whose slot is taken goes below the cards already beside the parent.
    const size = { width: 220, height: 100 };
    const taken = { ...slots.get('1.1.1'), ...size };
    assert.deepEqual(placeBox(slots.get('1.1.1'), size, [taken]), {
        x: taken.x,
        y: taken.y + 100 + 48,
    });
});

test('tidy columns are 320px apart on the full map and 248px in the dock (mockups Map, Read, Narrow)', () => {
    const cards = [
        { id: '1', parent: null, height: 100 },
        { id: '1.1', parent: '1', height: 100 },
        { id: '1.1.1', parent: '1.1', height: 100 },
    ];
    const xs = (column) => [...tidySlots('1', cards, column).values()].map((slot) => slot.x);
    assert.deepEqual(xs(), [0, 320, 640]);
    assert.deepEqual(xs(DOCK_COLUMN), [0, 248, 496]);
    assert.equal(COLUMN, 320);
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
            boxes.map((b) =>
                b.id === 'revealed' || b.id === 'child' ? { ...b, hidden: true } : b,
            ),
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
    const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-growth-')), 'trees.sqlite');
    let store = new Store(path);
    const root = store.create('Growing root', 'codex'),
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
                headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
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
                {
                    folded: [],
                    selected: root.id,
                    panel: 'beside',
                    viewport: { x: 0, y: 0, zoom: 0.001 },
                },
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
    const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-position-')), 'trees.sqlite');
    const legacy = new DatabaseSync(path);
    legacy.exec(
        'CREATE TABLE trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL)',
    );
    legacy.close();
    let store = new Store(path);
    const root = store.create('Root', 'codex');
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
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    try {
        app.jobs.start('reply', child.id, child.id, () => new Promise(() => {}));
        for (const body of [{ x: null, y: 1 }, { x: '1', y: 2 }, { x: 2 }, { x: 1e7, y: 0 }])
            assert.equal((await post(child.id, body)).status, 400);
        assert.equal((await post('missing', { x: 0, y: 0 })).status, 404);
        assert.equal((await post(child.id, { x: -125.5, y: 802.25 })).status, 200);
        assert.equal((await post(root.id, { x: 0, y: 20 })).status, 200);
        const { trees } = await (await fetch(`${origin}/api/state`)).json();
        assert.deepEqual(
            trees
                .filter((t) => t.id === child.id)
                .map((t) => [t.x, t.y, t.messageId, t.start, t.end]),
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

test('zoom reads as a whole percent, with one decimal below 1%', () => {
    assert.deepEqual([1, 1.234, 0.5, 0.01, 0.0042].map(zoomLabel), [
        '100%',
        '123%',
        '50%',
        '1%',
        '0.4%',
    ]);
});

test('saved children under a wider parent move right with their subtree', () => {
    const box = (id, parent, x, y) => ({ id, parent, x, y, width: 260, height: 200 });
    const boxes = [
        box('root', null, 0, 0),
        box('child', 'root', 260, 100),
        box('grand', 'child', 520, 150),
        box('below', 'root', 100, 400),
        box('right', 'root', 400, 0),
    ];
    assert.deepEqual(clearParents(boxes), {
        child: { x: 308, y: 100 },
        grand: { x: 616, y: 150 },
    });
    assert.deepEqual(
        clearParents([
            box('root', null, 0, 0),
            { ...box('child', 'root', 260, 100), dragging: true },
        ]),
        {},
        'a card being dragged is left alone',
    );
});
