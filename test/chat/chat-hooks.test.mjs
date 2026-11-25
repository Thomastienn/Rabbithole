import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { conversation, deferred, json, mount, summary } from '../support/chat-hooks-kit.mjs';

test('slow selections cannot replace the current conversation and drafts stay per conversation', async (t) => {
    const slow = deferred();
    let delay = false;
    const page = await mount(t, ({ path }) =>
        delay && path === '/api/trees/a' ? slow.promise : undefined,
    );
    const { act } = page;
    assert.equal(page.current.trees.tree.id, 'a');
    await act(async () => {
        page.current.stream.setDraft('a', 'Draft A');
        page.current.stream.setDraft('b', 'Draft B');
    });
    delay = true;
    let selecting;
    await act(async () => {
        selecting = page.current.trees.select('a');
    });
    await act(async () => page.current.trees.openConversation('b'));
    await act(async () => {
        slow.resolve(json(conversation('a')));
        await selecting;
    });
    assert.equal(page.current.trees.tree.id, 'b');
    assert.equal(page.current.trees.loading, false);
    assert.equal(page.current.c.overview, false);
    assert.deepEqual(page.current.stream.drafts, { a: 'Draft A', b: 'Draft B' });
});

test('model saving never replaces a newly selected conversation', async (t) => {
    const save = deferred();
    const page = await mount(t, ({ path }) =>
        path === '/api/trees/a/model' ? save.promise : undefined,
    );
    let saving;
    await page.act(async () => {
        saving = page.current.model.chooseModel('codex', 'gpt', null);
    });
    await page.act(async () => page.current.trees.select('b'));
    await page.act(async () => {
        save.resolve(json({ provider: 'codex', model: 'gpt', effort: null }));
        await saving;
    });
    assert.equal(page.current.trees.tree.id, 'b');
    assert.equal(page.current.trees.tree.provider, 'claude');
    assert.equal(page.current.model.modelNotice, '');
    assert.equal(page.current.model.savingModel, undefined);
    assert.deepEqual(page.calls.find((c) => c.path.endsWith('/model')).body, {
        provider: 'codex',
        model: 'gpt',
        effort: null,
    });
});

test('interleaved replies update their own previews and retry preserves the composer draft', async (t) => {
    const streams = new Map();
    const page = await mount(t, ({ path }) => {
        if (!/\/(messages|retry)$/.test(path)) return;
        const id = path.split('/')[3];
        return new Response(
            new ReadableStream({
                start(controller) {
                    streams.set(id, controller);
                },
            }),
        );
    });
    const emit = (id, events) =>
        streams
            .get(id)
            .enqueue(
                new TextEncoder().encode(
                    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
                ),
            );
    const replies = [];
    await page.act(async () => {
        replies.push(page.current.stream.send('Question A'));
    });
    await page.act(async () => page.current.trees.openConversation('b'));
    await page.act(async () => {
        replies.push(page.current.stream.send('Question B'));
    });
    for (const id of ['b', 'a']) {
        const user = {
            id: `${id}-q`,
            role: 'user',
            text: `Question ${id.toUpperCase()}`,
            status: 'completed',
        };
        await page.act(async () =>
            emit(id, [
                { type: 'saved', id: `${id}-r`, title: id, user },
                { type: 'text', text: `Reply ${id}` },
            ]),
        );
        page.data.set(id, {
            ...conversation(id),
            messages: [
                user,
                {
                    id: `${id}-r`,
                    role: 'assistant',
                    text: `Reply ${id}`,
                    status: 'completed',
                },
            ],
        });
    }
    assert.equal(page.current.trees.tree.id, 'b');
    assert.equal(page.current.trees.tree.messages.at(-1).text, 'Reply b');
    assert.equal(page.current.trees.previews.a.at(-1).text, 'Reply a');
    assert.equal(page.current.trees.previews.b.at(-1).text, 'Reply b');
    assert.deepEqual(new Set(page.current.trees.state.active), new Set(['a', 'b']));
    await page.act(async () => page.current.stream.stop('a'));
    assert.ok(page.calls.some((c) => c.path === '/api/trees/a/stop'));
    await page.act(async () => {
        streams.get('a').close();
        streams.get('b').close();
        await Promise.all(replies);
    });
    assert.deepEqual(page.current.trees.state.active, []);
    await page.act(async () => page.current.stream.setDraft('b', 'Keep this draft'));
    let retry;
    await page.act(async () => {
        retry = page.current.stream.retryFromMap('b');
    });
    const retryCall = page.calls.find((c) => c.path.endsWith('/retry'));
    assert.deepEqual(retryCall.body, { theme: { name: 'paperback', mode: 'light' } });
    assert.equal(retryCall.init.headers['X-Rabbithole-CSRF'], 'csrf');
    await page.act(async () => {
        streams.get('b').close();
        await retry;
    });
    assert.equal(page.current.stream.drafts.b, 'Keep this draft');
});

test('reopened replies poll saved checkpoints until the server reports completion', async (t) => {
    const page = await mount(t, ({ path }, { state, data }) => {
        if (path === '/api/state' && !data.get('a').messages.length) state.active = ['a'];
    });
    assert.deepEqual(page.current.trees.state.active, ['a']);
    page.data.set('a', {
        ...conversation('a'),
        messages: [
            {
                id: 'answer',
                role: 'assistant',
                text: 'Recovered reply',
                status: 'completed',
            },
        ],
    });
    page.state.active = [];
    await page.act(async () => t.mock.timers.tick(1500));
    assert.equal(page.current.trees.tree.messages[0].text, 'Recovered reply');
    assert.deepEqual(page.current.trees.state.active, []);
});

test('branch preparation excludes the question and the saved child opens before its reply finishes', async (t) => {
    let controller;
    const page = await mount(t, ({ path, body }, { data, state }) => {
        if (path === '/api/trees/a/branches') {
            const child = {
                ...conversation('child'),
                branch: {
                    parent: 'a',
                    messageId: 'reply',
                    text: 'Thin threads',
                    question: body.question,
                    snapshot: 'Context',
                },
            };
            data.set('child', child);
            state.trees.push(summary('child', 'a'));
            return json(child);
        }
        if (path === '/api/trees/child/messages')
            return new Response(
                new ReadableStream({
                    start(value) {
                        controller = value;
                    },
                }),
            );
    });
    const anchor = {
        messageId: 'reply',
        start: 0,
        end: 12,
        text: 'Thin threads',
        at: { x: 1, y: 2 },
    };
    await page.act(async () => page.current.branch.startBranch('a', anchor, { current: null }));
    await page.act(async () => page.current.branch.setQuestion('Why threads?'));
    assert.deepEqual(page.calls.find((c) => c.path.endsWith('/prepare')).body, {
        messageId: 'reply',
        start: 0,
        end: 12,
        text: 'Thin threads',
    });
    let submitted;
    await page.act(async () => {
        submitted = page.current.branch.submitBranch({ preventDefault() {} });
    });
    assert.equal(page.current.trees.tree.id, 'child');
    assert.equal(page.current.c.overview, false);
    assert.equal(page.current.branch.branch, undefined);
    assert.ok(page.current.trees.state.trees.some((t) => t.id === 'child'));
    assert.deepEqual(page.calls.find((c) => c.path.endsWith('/branches')).body, {
        messageId: 'reply',
        start: 0,
        end: 12,
        text: 'Thin threads',
        question: 'Why threads?',
    });
    assert.equal(page.calls.filter((c) => c.path.endsWith('/prepare')).length, 1);
    assert.ok(page.calls.some((c) => c.path.endsWith('/unprepare')));
    await page.act(async () => {
        controller.close();
        await submitted;
    });
});

test("the map's + asks on the side of another node and opens the child from the map", async (t) => {
    let controller;
    const page = await mount(t, ({ path, body }, { data, state }) => {
        if (path === '/api/trees/b/branches') {
            const child = {
                ...conversation('child'),
                branch: { parent: 'b', messageId: 'reply', text: '', question: body.question },
            };
            data.set('child', child);
            state.trees.push(summary('child', 'b'));
            return json(child);
        }
        if (path === '/api/trees/child/messages')
            return new Response(new ReadableStream({ start: (value) => (controller = value) }));
    });
    assert.equal(page.current.trees.tree.id, 'a');
    await page.act(async () => {
        page.current.c.setOverview(true);
        page.current.stream.setDraft('a', 'Keep this draft');
        page.current.stream.setDraft('b', 'And this one');
    });
    let created = 0,
        asked;
    await page.act(async () => {
        asked = page.current.branch.askFromMap('b', 'Lichens?', () => created++);
    });
    assert.deepEqual(page.calls.find((c) => c.path.endsWith('/branches')).body, {
        free: true,
        question: 'Lichens?',
    });
    assert.equal(created, 1);
    assert.equal(page.current.trees.tree.id, 'child');
    assert.equal(page.current.c.overview, false, "the child's focused chat opens");
    assert.equal(page.current.stream.drafts.a, 'Keep this draft');
    assert.equal(
        page.current.stream.drafts.b,
        'And this one',
        "the parent's draft is not the question",
    );
    await page.act(async () => {
        controller.close();
        await asked;
    });
});

test('choosing a groundwork chip creates its child at once and choosing it again opens that child', async (t) => {
    let controller;
    const page = await mount(t, ({ path, body }, { data, state }) => {
        if (path === '/api/trees/a/branches') {
            const child = {
                ...conversation('child'),
                branch: {
                    parent: 'a',
                    messageId: 'reply',
                    text: body.groundwork,
                    question: `What is ${body.groundwork}?`,
                    snapshot: '',
                },
            };
            data.set('child', child);
            state.trees.push({
                ...summary('child', 'a'),
                messageId: 'reply',
                start: null,
                end: null,
                passage: body.groundwork,
            });
            return json(child);
        }
        if (path === '/api/trees/child/messages')
            return new Response(
                new ReadableStream({
                    start(value) {
                        controller = value;
                    },
                }),
            );
    });
    let chosen;
    await page.act(async () => {
        chosen = page.current.branch.chooseGroundwork('reply', 'Mutexes');
    });
    assert.deepEqual(page.calls.find((c) => c.path.endsWith('/branches')).body, {
        messageId: 'reply',
        groundwork: 'Mutexes',
    });
    assert.equal(page.current.trees.tree.id, 'child');
    const sent = page.calls.find((c) => c.path === '/api/trees/child/messages');
    assert.equal(sent.body.text, 'What is Mutexes?');
    await page.act(async () => {
        controller.close();
        await chosen;
    });
    await page.act(async () => page.current.trees.openConversation('a'));
    assert.deepEqual(
        page.current.branch.groundworkBranches.reply.map((b) => [b.concept, b.child]),
        [['Mutexes', 'child']],
    );
    await page.act(async () => page.current.branch.chooseGroundwork('reply', 'Mutexes'));
    assert.equal(page.current.trees.tree.id, 'child');
    assert.equal(page.calls.filter((c) => c.path.endsWith('/branches')).length, 1);
});

test('deleting the open learning tree discards pending layout and opens the next saved conversation', async (t) => {
    const page = await mount(t, ({ path }, { state, data }) => {
        if (path === '/api/trees/a/delete') {
            state.trees = state.trees.filter((t) => t.id !== 'a');
            data.delete('a');
            return json({ deleted: ['a'], parent: null });
        }
    });
    await page.act(async () => {
        page.current.layout.savePositions({ a: { x: 1, y: 2 } });
        page.current.stream.setDraft('a', 'Delete me');
        page.current.stream.setDraft('b', 'Keep me');
        page.current.stream.setFiles('a', [new File(['x'], 'gone.png')]);
        page.current.branch.startBranch(
            'a',
            { messageId: 'reply', text: 'Gone' },
            { current: null },
        );
        page.current.branch.setSelectingMessage('reply');
        page.current.actions.askDelete('a', null);
    });
    let composerFocused = 0;
    page.current.trees.targets.composer.current = { focus: () => composerFocused++ };
    await page.act(async () => page.current.actions.deleteConversation());
    assert.equal(page.current.trees.tree.id, 'b');
    assert.equal(page.current.branch.branch, undefined, 'its branch form closes');
    assert.equal(page.current.branch.selectingMessage, undefined);
    assert.equal(page.current.c.root, 'b');
    assert.equal(composerFocused, 1, 'the next conversation opens on its composer');
    assert.equal(page.current.layout.saver.current.pending().has('a'), false);
    assert.deepEqual(page.current.stream.drafts, { b: 'Keep me' });
    assert.deepEqual(page.current.stream.pendingFiles, {}, 'its pending files go too');
    assert.deepEqual(
        page.current.trees.state.trees.map((t) => t.id),
        ['b'],
    );
    assert.equal(page.current.actions.deletion, undefined);
});

test('deleting the open learning tree from the library keeps the library and opens no other tree', async (t) => {
    const page = await mount(t, ({ path }, { state, data }) => {
        if (path === '/api/trees/a/delete') {
            state.trees = state.trees.filter((t) => t.id !== 'a');
            data.delete('a');
            return json({ deleted: ['a'], parent: null });
        }
    });
    await page.act(async () => {
        page.current.c.setTab('library');
        page.current.actions.askDelete('a', null);
    });
    await page.act(async () => page.current.actions.deleteConversation());
    assert.equal(page.current.c.tab, 'library');
    assert.equal(page.current.trees.tree, undefined);
    assert.equal(page.current.c.root, undefined);
    assert.deepEqual(
        page.current.trees.state.trees.map((t) => t.id),
        ['b'],
    );
    assert.ok(!page.calls.some((c) => c.path === '/api/trees/b'), 'no neighbour opens');
    await page.act(async () => page.current.c.setTab('learning'));
    // No root on the learning tab is the new-chat screen.
    assert.equal(page.current.c.root, undefined);
});

test('polling refreshes media usage during an owning reply stream while preserving live text', async (t) => {
    let stream;
    const page = await mount(t, ({ path }) => {
        if (path.endsWith('/messages'))
            return new Response(
                new ReadableStream({
                    start(controller) {
                        stream = controller;
                    },
                }),
            );
    });
    let sending;
    await page.act(async () => {
        sending = page.current.stream.send('Show a visual');
    });
    const emit = (event) =>
        stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    await page.act(async () => {
        emit({
            type: 'saved',
            id: 'reply',
            title: 'a',
            user: { id: 'q', role: 'user', text: 'Show a visual', status: 'completed' },
        });
        emit({ type: 'text', text: 'Latest streamed text' });
    });
    const mediaUsage = [{ task: 'diagram', input: 50, output: 10, cacheRead: 2 }];
    page.data.set('a', {
        ...conversation('a'),
        messages: [
            { id: 'q', role: 'user', text: 'Show a visual', status: 'completed' },
            {
                id: 'reply',
                role: 'assistant',
                text: 'Older checkpoint',
                status: 'streaming',
                usage: null,
                mediaUsage,
            },
        ],
    });
    await page.act(async () => t.mock.timers.tick(1500));
    assert.equal(page.current.trees.tree.messages.at(-1).text, 'Latest streamed text');
    assert.deepEqual(page.current.trees.tree.messages.at(-1).mediaUsage, mediaUsage);
    await page.act(async () => {
        emit({ type: 'text', text: 'Even newer text' });
    });
    assert.deepEqual(page.current.trees.tree.messages.at(-1).mediaUsage, mediaUsage);
    await page.act(async () => {
        stream.close();
        await sending;
    });
});

test('a briefed selection joins the open reply suggestions so it underlines without reloading', async (t) => {
    const row = {
        message: 'reply',
        status: 'ready',
        passages: [{ start: 2, end: 6, text: 'heap' }],
        groundwork: [],
    };
    const page = await mount(t, ({ path }, { data }) => {
        if (path === '/api/trees/a/brief')
            return json({ explanation: 'A tree kept in order.', suggestions: row });
        if (path === '/api/trees/a')
            return json({
                ...data.get('a'),
                suggestions: [{ message: 'reply', status: 'ready', passages: [], groundwork: [] }],
            });
    });
    await page.act(async () => page.current.trees.openConversation('a'));
    const anchor = { messageId: 'reply', start: 2, end: 6, text: 'heap' };
    await page.act(async () => page.current.branch.explainBrief('a', anchor));
    assert.deepEqual(page.current.trees.tree.suggestions, [row]);
    assert.equal(page.current.trees.tree.briefs[0].explanation, 'A tree kept in order.');
});
