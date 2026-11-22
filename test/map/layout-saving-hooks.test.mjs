import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../support/chat-hooks-kit.mjs';

// Map layout saving and the map's folds, through the ChatPage hook composition.
test('layout changes survive stale refreshes and batch into one write with the latest CSRF', async (t) => {
    const page = await mount(t);
    await page.act(async () => page.current.c.setOverview(false));
    await page.act(async () => {
        page.current.layout.savePositions({ a: { x: 120, y: 70 } });
        page.current.layout.saveViewport({ x: -3, y: 10, zoom: 0.8 });
    });
    page.state.csrf = 'latest-csrf';
    await page.act(async () => page.current.trees.refresh());
    const root = page.current.trees.state.trees.find((t) => t.id === 'a');
    assert.equal(root.x, 120);
    assert.deepEqual(root.layout.viewport, { x: -3, y: 10, zoom: 0.8 });
    assert.equal(page.calls.filter((c) => c.path.endsWith('/layout')).length, 0);
    await page.act(async () => t.mock.timers.tick(60_000));
    const writes = page.calls.filter((c) => c.path.endsWith('/layout'));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].init.headers['X-Rabbithole-CSRF'], 'latest-csrf');
    assert.deepEqual(writes[0].body.positions, { a: { x: 120, y: 70 } });
    assert.deepEqual(writes[0].body.viewport, root.layout.viewport);
    await page.act(async () => t.mock.timers.tick(60_000));
    assert.equal(page.calls.filter((c) => c.path.endsWith('/layout')).length, 1);
});

test('closing the page writes pending layout at once with keepalive, and nothing when clean', async (t) => {
    const page = await mount(t);
    const layoutWrites = () => page.calls.filter((c) => c.path.endsWith('/layout'));
    await page.act(async () => t.mock.timers.tick(60_000));
    const before = layoutWrites().length;
    await page.act(async () => window.dispatchEvent(new Event('pagehide')));
    assert.equal(layoutWrites().length, before, 'no pending layout sends no save');
    await page.act(async () => {
        page.current.trees.map.setFolded((saved) => new Set([...saved, 'b']));
        page.current.c.setOverview(false);
    });
    await page.act(async () => {
        page.current.layout.savePositions({ a: { x: 120, y: 70 } });
        page.current.layout.saveViewport({ x: -3, y: 10, zoom: 0.8 });
    });
    await page.act(async () => window.dispatchEvent(new Event('pagehide')));
    const [write, ...rest] = layoutWrites().slice(before);
    assert.equal(rest.length, 0);
    assert.equal(write.init.keepalive, true);
    assert.deepEqual(write.body.positions, { a: { x: 120, y: 70 } });
    assert.deepEqual(write.body.folded, ['b']);
    assert.equal(write.body.selected, 'a');
    assert.deepEqual(write.body.viewport, { x: -3, y: 10, zoom: 0.8 });
    assert.equal(page.current.layout.saver.current.pending().size, 0);
});

test('a map shows its saved folds until the learner changes them, and keeps the change on return', async (t) => {
    const page = await mount(t, ({ path }, { state }) => {
        if (path === '/api/state') state.trees[0].layout.folded = ['x'];
    });
    const folds = () => [...page.current.trees.map.folded];
    assert.deepEqual(folds(), ['x']);
    await page.act(async () => page.current.trees.map.setFolded(new Set(['y'])));
    assert.deepEqual(folds(), ['y']);
    await page.act(async () => page.current.trees.openTree('b'));
    assert.deepEqual(folds(), []);
    await page.act(async () => page.current.trees.map.setFolded(new Set(['z'])));
    await page.act(async () => page.current.trees.openTree('a'));
    assert.deepEqual(folds(), ['y'], 'the snapshot saved the change into its layout');
});
