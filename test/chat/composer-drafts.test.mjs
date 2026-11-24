import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { conversation, deferred, json, mount, summary } from '../support/chat-hooks-kit.mjs';

test('a branch reopened before its reply offers its question once, keeping an edited draft', async (t) => {
    const page = await mount(t, (_, { data }) => {
        data.get('b').branch = { parent: 'a', question: 'Why?', snapshot: '' };
    });
    await page.act(async () => page.current.trees.select('b'));
    assert.equal(page.current.stream.drafts.b, 'Why?');
    await page.act(async () => page.current.stream.setDraft('b', ''));
    await page.act(async () => page.current.trees.select('a'));
    await page.act(async () => page.current.trees.select('b'));
    assert.equal(page.current.stream.drafts.b, '', 'the cleared draft is not refilled');
});

test('a failed send restores the unsaved question and reports its error', async (t) => {
    const page = await mount(t, ({ path }) =>
        path.endsWith('/messages') ? json({ error: 'Provider unavailable' }, false) : undefined,
    );
    await page.act(async () => page.current.stream.send('Keep my question'));
    assert.equal(page.current.stream.drafts.a, 'Keep my question');
    assert.equal(page.current.c.error, 'Provider unavailable');
    assert.deepEqual(page.current.trees.tree.messages, []);
    assert.deepEqual(page.current.trees.state.active, []);
});

test('a send the server refuses keeps the pending files and the question for another try', async (t) => {
    const reason =
        'This model can’t read images and OCR language data couldn’t be downloaded. Go online and send again, or pick a model that reads images.';
    const page = await mount(t, ({ path }) =>
        path.endsWith('/messages') ? json({ error: reason }, false) : undefined,
    );
    const sheet = new File(['x'], 'worksheet.png', { type: 'image/png' });
    await page.act(async () => page.current.stream.setFiles('a', [sheet]));
    await page.act(async () =>
        page.current.stream.send('Is trial 3 right?', page.current.trees.tree, false, [sheet]),
    );
    const sent = page.calls.find((call) => call.path.endsWith('/messages'));
    assert.ok(sent.body instanceof FormData, 'files go as multipart');
    assert.equal(page.current.c.error, reason, 'the refusal reason reaches the failure banner');
    assert.deepEqual(page.current.stream.pendingFiles.a, [sheet], 'the files stay in the tray');
    assert.equal(
        page.current.stream.drafts.a,
        'Is trial 3 right?',
        'the question stays in the field',
    );
});

test('a question typed while the first reply starts becomes the next draft and is never cleared or sent', async (t) => {
    const created = deferred();
    let reply;
    const page = await mount(t, ({ path }, { data, state }) => {
        if (path === '/api/trees') return created.promise;
        if (path === '/api/trees/c/messages')
            return new Response(
                new ReadableStream({
                    start(controller) {
                        reply = controller;
                    },
                }),
            );
    });
    let creating;
    await page.act(async () => {
        creating = page.current.stream.create('Why fungi?');
    });
    await page.act(async () => page.current.stream.setDraft('first', 'And lichens?'));
    await page.act(async () => {
        page.data.set('c', conversation('c'));
        page.state.trees.push(summary('c'));
        created.resolve(json(conversation('c')));
    });
    assert.equal(page.current.stream.drafts.c, 'And lichens?');
    await page.act(async () => {
        page.data.set('c', {
            ...conversation('c'),
            messages: [{ id: 'q', role: 'user', text: 'Why fungi?', status: 'completed' }],
        });
        reply.close();
        await creating;
    });
    assert.equal(page.current.stream.drafts.c, 'And lichens?');
    assert.equal(page.calls.filter((c) => c.path.endsWith('/messages')).length, 1);
});
