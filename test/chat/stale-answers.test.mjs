import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { conversation, deferred, json, mount } from '../support/chat-hooks-kit.mjs';

test('a new chat drops a conversation that is still loading', async (t) => {
    const slow = deferred();
    let delay = false;
    const page = await mount(t, ({ path }) =>
        delay && path === '/api/trees/b' ? slow.promise : undefined,
    );
    delay = true;
    let selecting;
    await page.act(async () => {
        selecting = page.current.trees.select('b');
    });
    await page.act(async () => page.current.actions.newChat());
    await page.act(async () => {
        slow.resolve(json(conversation('b')));
        await selecting;
    });
    assert.equal(page.current.trees.tree, undefined);
    assert.equal(page.current.trees.loading, false);
    assert.equal(page.current.c.root, undefined);
});

test('a rename outlives a status poll that started before it and the stale refreshes after it', async (t) => {
    let held, started;
    const page = await mount(t, ({ path, body }, { state, data }) => {
        // A reply keeps the status poll running; the server's tree list never learns the new title.
        if (path === '/api/state') state.active = ['a'];
        if (path === '/api/trees/a' && held) {
            started.resolve();
            return held.promise;
        }
        if (path === '/api/trees/a/rename') {
            data.get('a').title = body.title;
            return json({ title: body.title });
        }
    });
    held = deferred();
    started = deferred();
    await page.act(async () => {
        t.mock.timers.tick(1500);
        await started.promise;
    });
    await page.act(async () => page.current.actions.rename('a', 'Renamed'));
    await page.act(async () => held.resolve(json(conversation('a'))));
    held = undefined;
    assert.equal(page.current.trees.tree.title, 'Renamed');
    await page.act(async () => t.mock.timers.tick(1500));
    assert.equal(page.current.trees.tree.title, 'Renamed');
    assert.equal(page.current.trees.state.trees.find((t) => t.id === 'a').title, 'Renamed');
});

test('a deleted tree stays gone when a refresh still lists it', async (t) => {
    const page = await mount(t, ({ path }) =>
        path === '/api/trees/a/delete' ? json({ deleted: ['a'], parent: null }) : undefined,
    );
    await page.act(async () => page.current.actions.askDelete('a', null));
    await page.act(async () => page.current.actions.deleteConversation());
    await page.act(async () => page.current.trees.refresh());
    assert.deepEqual(
        page.current.trees.state.trees.map((t) => t.id),
        ['b'],
    );
    assert.equal(page.current.trees.tree.id, 'b');
});
