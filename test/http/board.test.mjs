import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { complete, open, until } from '../support/diagram-kit.mjs';
import { notify } from '../support/events.mjs';

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
                    if (board.hold)
                        await Promise.race([
                            board.hold,
                            new Promise((resolve) =>
                                signal.addEventListener('abort', resolve, { once: true }),
                            ),
                        ]);
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

async function setup(t, provider, { providerName = 'claude', speech } = {}) {
    const logs = [];
    const env = await open(
        { models: async () => [], generate: async () => {} },
        {
            providers: { claude: provider },
            speech,
            log: (line) => {
                logs.push(line);
                notify();
            },
        },
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
        ws.on('message', (data, binary) => {
            // A speech frame: one byte of sentence id length, the id, then the audio.
            events.push(
                binary
                    ? {
                          type: 'audio',
                          id: data.subarray(1, 1 + data[0]).toString(),
                          audio: data.subarray(1 + data[0]).toString(),
                      }
                    : JSON.parse(data),
            );
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
            '> A hypha grows only at its tip.\nt1 text "tip" at 800,450 look=focus\nt2 text "x" at 9\n',
            'h1 arrow from t1 to nowhere\n> Tiny sacs',
            ' carry new wall forward.\nv1 dot at 900,450\nw1 text "wall" at 800,450 size=s',
        ],
        ['> They join.\nj1 arrow from t1 to v1\n'],
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
    // Each sentence carries the ops written under it; broken ones are skipped and logged, never shown.
    assert.deepEqual(
        [first.ops, second.ops],
        [
            [{ id: 't1', kind: 'text', look: 'focus', at: [800, 450], size: 'm', text: 'tip' }],
            [
                { id: 'v1', kind: 'dot', at: [900, 450] },
                { id: 'w1', kind: 'text', at: [800, 499], size: 's', text: 'wall' },
            ],
        ],
        'w1 landed on t1, so the guard moved it',
    );
    assert.ok(logs.some((l) => /INFO board item moved id="w1"/.test(l)));
    assert.equal(logs.filter((l) => /WARN board op skipped/.test(l)).length, 2);
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
    assert.equal(reply.text, 'A hypha grows only at its tip.\nTiny sacs carry new wall forward.');
    assert.equal(reply.status, 'completed');
    assert.ok(reply.board);
    assert.equal(reply.usage.output, 20);
    // The board turn joined the conversation's provider session, so the next chat turn resumes it.
    assert.equal(env.store.header(id).thread, 'board-session');
    assert.ok(
        logs.some((l) => /task="board"/.test(l) && /thinking=0/.test(l)),
        'the request logs its thinking tokens',
    );

    // Reopened, the board replays its saved op lines at once, and the tutor can still join their ids.
    board.send({ type: 'leave' });
    const again = connect();
    assert.deepEqual((await again.next('board')).items, [...first.ops, ...second.ops]);
    again.send({ type: 'ask', text: 'And then?' });
    const joined = await again.next('sentence');
    assert.deepEqual(
        joined.ops.map((op) => op.id),
        ['j1'],
    );
});

test('board: each sentence is spoken in chunks tagged with its id, one sentence ahead of playback', async (t) => {
    const provider = boardProvider([['> One.\n> Two.\n> Three.\n']]);
    const speech = { warmed: 0, spoken: [], closed: 0 };
    const client = {
        warm: () => speech.warmed++,
        async speak(text, chunk) {
            speech.spoken.push(text);
            notify();
            chunk(Buffer.from(`${text} a`));
            chunk(Buffer.from(`${text} b`));
        },
        close: () => (speech.closed++, notify()),
    };
    const { connect } = await setup(t, provider, { speech: () => client });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const of = (type, id) => board.events.filter((e) => e.type === type && (!id || e.id === id));
    await until(() => of('sentence').length === 3);
    const sentences = of('sentence');
    assert.equal(speech.warmed, 1, 'the socket opens as the turn starts');
    assert.ok(sentences.every((s) => s.voiced));
    const [one, two, three] = sentences.map((s) => s.id);
    const heard = async (id) => {
        await until(() => of('audio-end', id).length);
        return of('audio', id);
    };
    assert.deepEqual(await heard(one), [
        { type: 'audio', id: one, audio: 'One. a' },
        { type: 'audio', id: one, audio: 'One. b' },
    ]);
    assert.deepEqual(speech.spoken, ['One.'], 'the next sentence waits for this one to play');
    board.send({ type: 'progress', sentence: one, phase: 'start' });
    assert.deepEqual(
        (await heard(two)).map((e) => e.audio),
        ['Two. a', 'Two. b'],
    );
    assert.deepEqual(speech.spoken, ['One.', 'Two.']);
    board.send({ type: 'progress', sentence: two, phase: 'start' });
    await heard(three);
    for (const id of [one, two, three])
        board.send({ type: 'progress', sentence: id, phase: 'end' });
    board.send({ type: 'progress', sentence: three, phase: 'start' });
    board.send({ type: 'progress', sentence: three, phase: 'end' });
    await board.next('state', (e) => e.state === 'idle');
    board.ws.close();
    await until(() => speech.closed);
});

test('board: opening during chat shares the finished conversation in both directions', async (t) => {
    const provider = boardProvider([['> The cells extend at their tips.\n']]);
    const finishChat = Promise.withResolvers();
    const chats = [];
    provider.generate = async (tree, text, emit, saveThread) => {
        chats.push({ thread: tree.thread, text });
        if (chats.length === 1) await finishChat.promise;
        saveThread(tree.thread ?? 'chat-session');
        complete(emit, 'Thread-like cells.');
    };
    const { env, id, connect } = await setup(t, provider);
    const sendChat = (text) => env.post(`/api/trees/${id}/messages`, { text });
    const firstChat = await sendChat('What are hyphae?');
    const board = connect();
    await opened(board.ws);
    finishChat.resolve();
    assert.equal(firstChat.status, 200);
    await firstChat.text();

    board.send({ type: 'ask', text: 'How do they grow?' });
    const sentence = await board.next('sentence');
    assert.equal(provider.boards.length, 1);
    assert.equal(provider.boards[0].options.thread, 'chat-session');
    assert.deepEqual(provider.boards[0].options.history, [
        { role: 'user', text: 'What are hyphae?' },
        { role: 'assistant', text: 'Thread-like cells.' },
    ]);
    board.send({ type: 'progress', sentence: sentence.id, phase: 'start' });
    board.send({ type: 'progress', sentence: sentence.id, phase: 'end' });
    await board.next('state', (event) => event.state === 'idle');

    const nextChat = await sendChat('How long are they?');
    assert.equal(nextChat.status, 200);
    await nextChat.text();
    assert.deepEqual(chats[1], { thread: 'board-session', text: 'How long are they?' });

    board.send({ type: 'ask', text: 'And their width?' });
    await board.next('notice');
    assert.ok(provider.boards[0].closed, 'chat changed the history of the warm process');
    assert.deepEqual(provider.boards[1].options.history.slice(-2), [
        { role: 'user', text: 'How long are they?' },
        { role: 'assistant', text: 'Thread-like cells.' },
    ]);
});

test('board: chat cannot start before the queued board captions finish or are stopped', async (t) => {
    const provider = boardProvider([['> One.\n> Two.\n']]);
    const { env, id, logs, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const first = await board.next('sentence');
    await board.next('sentence');
    board.send({ type: 'progress', sentence: first.id, phase: 'start' });
    await until(() => logs.some((line) => /model finished.*task="board"/.test(line)));
    const chat = await env.post(`/api/trees/${id}/messages`, { text: 'Meanwhile?' });
    assert.equal(chat.status, 409);
    assert.equal((await env.post(`/api/trees/${id}/stop`)).status, 200);
    await board.next('state', (event) => event.state === 'idle');
    const reply = messages(env, id).at(-1);
    assert.equal(reply.status, 'interrupted');
    assert.equal(reply.text, 'One.');
});

test('board: leaving mid-reply stops the tutor at once and saves the reply up to the sentence shown', async (t) => {
    const provider = boardProvider([['> First idea.\n> Second idea.\n> Third idea.\n']]);
    const { env, id, logs, connect } = await setup(t, provider);
    env.store.thread(id, 'old-session', 'sonnet');
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
    await until(() => messages(env, id)[1]?.text === 'First idea.\nSecond idea.');
    board.send({ type: 'leave' });
    await until(() => process.closed);
    assert.ok(process.signals[0].aborted, 'the running turn stops');
    await until(() =>
        logs.some((line) => /model interrupted.*task="board".*thinking="unreported"/.test(line)),
    );
    const reply = messages(env, id)[1];
    assert.deepEqual(
        { text: reply.text, status: reply.status, stopped: reply.stopped },
        { text: 'First idea.\nSecond idea.', status: 'interrupted', stopped: 'learner' },
    );
    await opened(connect().ws);
    await until(() => provider.boards[1]?.opened);
    assert.equal(provider.boards[1].options.thread, null);
    assert.deepEqual(provider.boards[1].options.history.at(-1), {
        role: 'assistant',
        text: 'First idea.\nSecond idea.',
    });
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

test('board: closing the tab ends the session and its process; a provider without boards gets a notice', async (t) => {
    const provider = boardProvider([]);
    const { connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    board.ws.close();
    await until(() => provider.boards[0].closed);

    const other = await setup(t, provider, { providerName: 'openai' });
    const socket = other.connect();
    assert.ok((await socket.next('notice')).notice);
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
