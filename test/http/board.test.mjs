import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { open, until } from '../support/diagram-kit.mjs';
import { notify } from '../support/events.mjs';
import { TUTOR_RULES, VERDICT_RULE } from '../../server/media/tutor-instructions.mjs';

// A Claude-like provider whose board process plays scripted output: each ask streams the next script in chunks.
function boardProvider(scripts, { status = 'completed' } = {}) {
    const provider = {
        boards: [],
        models: async () => [{ model: 'sonnet', efforts: ['low'] }],
        model: async (tree) => tree.model ?? 'sonnet',
        board(options) {
            const board = {
                options,
                opened: 0,
                closed: false,
                asked: [],
                signals: [],
                thread: 'board-session',
                open: () => (board.opened++, notify()),
                close: () => ((board.closed = true), notify()),
                async ask(text, emit, signal) {
                    board.asked.push(text);
                    board.signals.push(signal);
                    for (const chunk of scripts.shift() ?? []) {
                        if (signal.aborted) return { status: 'interrupted' };
                        emit({ type: 'delta', text: chunk });
                        await new Promise((resolve) => setImmediate(resolve));
                    }
                    // A script ending in a held promise waits there until the learner leaves.
                    if (board.hold) await board.hold;
                    if (signal.aborted) return { status: 'interrupted' };
                    return {
                        status,
                        usage: { input: 10, output: 20, cacheRead: 5, thinking: 0 },
                    };
                },
            };
            provider.boards.push(board);
            return board;
        },
    };
    return provider;
}

async function setup(t, provider, { providerName = 'claude' } = {}) {
    const logs = [];
    const env = await open(
        { models: async () => [], generate: async () => {} },
        { providers: { claude: provider }, log: (line) => logs.push(line) },
    );
    t.after(env.close);
    const { csrf } = await (await env.get('/api/state')).json();
    const id = env.store.create('What are hyphae?', providerName, 'sonnet').id;
    const connect = (query = `?csrf=${csrf}`, origin = env.origin) => {
        const ws = new WebSocket(
            `${env.origin.replace('http', 'ws')}/api/trees/${id}/board${query}`,
            {
                origin,
            },
        );
        const events = [];
        ws.on('error', () => {});
        ws.on('message', (data) => {
            events.push(JSON.parse(data));
            notify();
        });
        t.after(() => ws.terminate());
        const next = async (type, match = () => true) => {
            await until(() => events.some((e) => e.type === type && match(e)));
            const index = events.findIndex((e) => e.type === type && match(e));
            return events.splice(0, index + 1).at(-1);
        };
        return { ws, events, next, send: (m) => ws.send(JSON.stringify(m)) };
    };
    return { env, id, logs, connect };
}

const opened = (ws) =>
    new Promise((resolve, reject) => ws.once('open', resolve).once('error', reject));
const messages = (env, id) => env.store.tree(id).messages;

test('board: a typed question gets its sentences one at a time and saves as a learner message and a reply', async (t) => {
    const provider = boardProvider([
        [
            '> A hypha grows only at its tip.\nt1 text "tip" at 800,450\n> Tiny sacs',
            ' carry new wall forward.\n',
        ],
    ]);
    const { env, id, logs, connect } = await setup(t, provider);
    env.store.saveTutorStyle('Use cooking analogies.');
    env.store.saveMemoryNote('Studies biology.');
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const [process] = provider.boards;
    // Opened warm with the board prompt and the learner's own context, at the conversation's model.
    assert.equal(process.options.model, 'sonnet');
    assert.match(process.options.system, /Use cooking analogies\./);
    assert.match(process.options.system, /Studies biology\./);
    assert.ok(!process.options.system.includes(TUTOR_RULES), 'no chat media rules');
    assert.ok(!process.options.system.includes(VERDICT_RULE), 'no verdict block');
    assert.equal(process.asked.length, 0, 'the tutor waits for the first question');

    board.send({ type: 'ask', text: 'How does a hypha grow at its tip?' });
    assert.equal((await board.next('state')).state, 'thinking');
    assert.equal((await board.next('state')).state, 'speaking');
    const first = await board.next('sentence');
    const second = await board.next('sentence');
    assert.deepEqual(
        [first.text, second.text],
        ['A hypha grows only at its tip.', 'Tiny sacs carry new wall forward.'],
        'only spoken lines, in order; op lines stay off the caption',
    );
    assert.notEqual(first.id, second.id);
    assert.deepEqual(process.asked, ['How does a hypha grow at its tip?']);

    for (const sentence of [first, second])
        for (const phase of ['start', 'end'])
            board.send({ type: 'progress', sentence: sentence.id, phase });
    assert.equal((await board.next('state')).state, 'idle');
    const [question, reply] = messages(env, id);
    assert.deepEqual(
        { role: question.role, text: question.text, board: question.board },
        { role: 'user', text: 'How does a hypha grow at its tip?', board: true },
    );
    assert.equal(reply.text, 'A hypha grows only at its tip. Tiny sacs carry new wall forward.');
    assert.equal(reply.status, 'completed');
    assert.ok(reply.board);
    assert.equal(reply.usage.output, 20);
    // The board turn joined the conversation's provider session, so the next chat turn resumes it.
    assert.equal(env.store.header(id).thread, 'board-session');
    assert.ok(
        logs.some((l) => /task="board"/.test(l) && /thinking=0/.test(l)),
        'the request logs its thinking tokens',
    );
});

test('board: a board turn resumes the conversation session and a fresh one receives the earlier chat', async (t) => {
    const provider = boardProvider([]);
    const { env, id, connect } = await setup(t, provider);
    env.store.message(id, 'user', 'What are hyphae?', 'completed');
    env.store.message(id, 'assistant', 'Thread-like cells.', 'completed');
    env.store.thread(id, 'chat-session', 'sonnet');
    await opened(connect().ws);
    await until(() => provider.boards[0]?.opened);
    assert.equal(provider.boards[0].options.thread, 'chat-session');
    assert.deepEqual(provider.boards[0].options.history, [
        { role: 'user', text: 'What are hyphae?' },
        { role: 'assistant', text: 'Thread-like cells.' },
    ]);
});

test('board: leaving mid-reply stops the tutor at once and saves the reply up to the sentence shown', async (t) => {
    const provider = boardProvider([['> First idea.\n> Second idea.\n> Third idea.\n']]);
    const { env, id, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const process = provider.boards[0];
    process.hold = new Promise(() => {}); // still generating when the learner leaves
    board.send({ type: 'ask', text: 'Why?' });
    const first = await board.next('sentence');
    const second = await board.next('sentence');
    board.send({ type: 'progress', sentence: first.id, phase: 'start' });
    board.send({ type: 'progress', sentence: first.id, phase: 'end' });
    board.send({ type: 'progress', sentence: second.id, phase: 'start' });
    await until(() => messages(env, id)[1]?.text === 'First idea. Second idea.');
    board.send({ type: 'leave' });
    await until(() => process.closed);
    assert.ok(process.signals[0].aborted, 'the running turn stops');
    const reply = messages(env, id)[1];
    assert.deepEqual(
        { text: reply.text, status: reply.status, stopped: reply.stopped },
        { text: 'First idea. Second idea.', status: 'interrupted', stopped: 'learner' },
    );
});

test('board: a process that ends on its own leaves a notice and the reply up to the caption shown', async (t) => {
    const provider = boardProvider([['> One.\n> Two.\n']], { status: 'failed' });
    const { env, id, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const dies = Promise.withResolvers();
    provider.boards[0].hold = dies.promise; // the process dies while the first caption shows
    board.send({ type: 'ask', text: 'Why?' });
    const first = await board.next('sentence');
    board.send({ type: 'progress', sentence: first.id, phase: 'start' });
    await until(() => messages(env, id)[1]?.text === 'One.');
    dies.resolve();
    assert.ok((await board.next('notice')).notice);
    assert.equal((await board.next('state')).state, 'idle');
    assert.deepEqual(
        { text: messages(env, id)[1].text, status: messages(env, id)[1].status },
        { text: 'One.', status: 'failed' },
    );
});

test('board: closing the tab ends the session and its process; a non-Claude conversation gets a notice', async (t) => {
    const provider = boardProvider([]);
    const { connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    board.ws.close();
    await until(() => provider.boards[0].closed);

    const codex = await setup(t, provider, { providerName: 'codex' });
    const other = codex.connect();
    assert.ok((await other.next('notice')).notice);
});

test('board: the socket opens only from the app page with its CSRF token', async (t) => {
    const { connect } = await setup(t, boardProvider([]));
    const status = (board) =>
        new Promise((resolve) =>
            board.ws.once('unexpected-response', (_, res) => resolve(res.statusCode)),
        );
    assert.equal(await status(connect('')), 403);
    assert.equal(await status(connect(undefined, 'http://evil.example')), 403);
});
