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
                    if (signal.aborted)
                        return { status: 'interrupted', usage: board.interruptedUsage };
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

async function setup(t, provider, { providerName = 'claude', app = {} } = {}) {
    const logs = [];
    const env = await open(
        { models: async () => [], generate: async () => {} },
        {
            providers: { claude: provider },
            log: (line) => {
                logs.push(line);
                notify();
            },
            ...app,
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
    // Normal chat draws the board as it stood at the end of the reply.
    assert.deepEqual(reply.snapshot, [...first.ops, ...second.ops]);
    assert.equal(question.snapshot, undefined);
    // Usage history counts the board turn as a chat reply under the conversation's model.
    const [usage] = env.store.usageEvents().events.filter((event) => event.task === 'chat');
    assert.deepEqual(
        [usage.provider, usage.model, usage.tree, usage.output, usage.reasoning],
        ['claude', 'sonnet', id, 20, 0],
    );
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
    for (const phase of ['start', 'end'])
        again.send({ type: 'progress', sentence: joined.id, phase });
    await again.next('state', (event) => event.state === 'idle');
    const [, earlier, , latest] = messages(env, id);
    assert.deepEqual(earlier.snapshot, [...first.ops, ...second.ops]);
    assert.deepEqual(latest.snapshot, [...earlier.snapshot, ...joined.ops]);
});

test('board: a finished board reply records familiarity and concepts, with no marks or next questions', async (t) => {
    const provider = boardProvider([['> A hypha grows at its tip.\nt1 text "tip" at 800,450\n']]);
    const quick = [];
    provider.generate = async (tree, text, emit) => {
        quick.push(tree.role);
        return complete(
            emit,
            tree.role === 'verdict'
                ? '[{"concept":"Hypha","level":1,"confidence":"low"}]'
                : '{"suggestions":[{"text":"tip","concept":"Tip"}],"concepts":[{"name":"Hypha","topics":["Mycology"]}],"links":[],"next_questions":["Why?"]}',
        );
    };
    const { env, id, connect } = await setup(t, provider, {
        app: { suggestions: true, verdicts: true },
    });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'How do hyphae grow?' });
    const sentence = await board.next('sentence');
    for (const phase of ['start', 'end'])
        board.send({ type: 'progress', sentence: sentence.id, phase });
    await until(() => quick.length === 2);
    await env.app.settled();
    const hypha = env.store.graph().concepts.find((c) => c.name === 'Hypha');
    assert.deepEqual(hypha.topics, ['Mycology']);
    assert.deepEqual(hypha.observations, [0, 1, 0, 0, 0, 0], "the learner's question is evidence");
    const tree = env.store.tree(id);
    assert.deepEqual(tree.suggestions, [], 'no suggestion marks');
    assert.equal(tree.messages[1].questions, undefined, 'no next questions');
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

test('board: pen strokes wait for the next question, which names what they mark, and the tutor can erase them', async (t) => {
    const provider = boardProvider([
        ['> Here is the pivot.\nt1 box at 560,660 w=120 h=80\nt2 text "load" at 370,450 size=s\n'],
        ['> The pivot carries the load.\ne1 erase p1\n'],
    ]);
    const { env, id, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const play = async () => {
        const sentence = await board.next('sentence');
        for (const phase of ['start', 'end'])
            board.send({ type: 'progress', sentence: sentence.id, phase });
        await board.next('state', (e) => e.state === 'idle');
        return sentence;
    };
    board.send({ type: 'ask', text: 'What is a lever?' });
    await play();

    const loop = [
        [650, 620],
        [470, 600],
        [480, 760],
        [690, 740],
        [640, 615],
    ];
    board.send({ type: 'stroke', points: loop });
    const circled = await board.next('stroke');
    assert.deepEqual(circled.mark, { verb: 'circled', ids: ['t1'] });
    assert.deepEqual(circled.item, { id: 'p1', kind: 'stroke', points: loop });
    board.send({
        type: 'stroke',
        points: [
            [500, 380],
            [400.4, 455],
        ],
    });
    assert.deepEqual((await board.next('stroke')).mark, { verb: 'pointed at', ids: ['t2'] });
    board.send({ type: 'stroke', points: [[1500, 100]] });
    assert.equal((await board.next('stroke')).mark, null);
    board.send({ type: 'stroke', points: [['x', 1]] });
    assert.equal(provider.boards[0].asked.length, 1, 'the pen alone sends nothing');

    board.send({ type: 'ask', text: 'Why here?' });
    const sentence = await play();
    assert.deepEqual(sentence.ops, [{ id: 'e1', kind: 'erase', ids: ['p1'] }]);
    assert.equal(
        provider.boards[0].asked[1],
        'Why here?\n\npen: circled t1 · pointed at t2 · strokes p1, p2, p3',
    );
    const question = messages(env, id)[2];
    assert.equal(question.text, 'Why here?', 'the learner message keeps their own words');
    // Normal chat's snapshot of that reply leaves out what it erased.
    assert.deepEqual(
        messages(env, id)[3].snapshot.map((i) => i.id),
        ['t1', 't2', 'p2', 'p3'],
    );

    // Reopened, the strokes saved with the question show again, except the one the tutor erased.
    board.send({ type: 'leave' });
    const again = connect();
    assert.deepEqual(
        (await again.next('board')).items.map((i) => i.id),
        ['t1', 't2', 'p2', 'p3'],
    );
});

test('board: a stroke drawn after an erase that was never shown keeps its own id and comes back on reopen', async (t) => {
    // The reply fails before its erase sentence shows, so the erase of p1 is never saved.
    const provider = boardProvider([['> One.\n> Gone.\ne1 erase p1\n'], []], { status: 'failed' });
    const { connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const strokeAndAsk = async (text) => {
        board.send({ type: 'stroke', points: [[1500, 100]] });
        const { item } = await board.next('stroke');
        board.send({ type: 'ask', text });
        await board.next('state', (e) => e.state === 'idle');
        return item.id;
    };
    assert.equal(await strokeAndAsk('First?'), 'p1');
    assert.equal(await strokeAndAsk('Second?'), 'p2');
    board.send({ type: 'leave' });
    assert.deepEqual(
        (await connect().next('board')).items.map((i) => i.id),
        ['p1', 'p2'],
    );
});

test('board: leaving mid-reply saves only shown sentences and keeps any usage the provider reports', async (t) => {
    const provider = boardProvider([
        [
            '> First idea.\na dot at 300,450\n> Second idea.\nb dot at 600,450\n> Third idea.\nc dot at 900,450\n',
        ],
    ]);
    const { env, id, logs, connect } = await setup(t, provider);
    env.store.thread(id, 'old-session', 'sonnet');
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const process = provider.boards[0];
    process.hold = new Promise(() => {}); // still generating when the learner leaves
    process.interruptedUsage = { input: 10, output: 14, cacheRead: 5, thinking: 3 };
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
        logs.some((line) => /model interrupted.*task="board".*thinking=3/.test(line)),
    );
    const reply = messages(env, id)[1];
    assert.deepEqual(
        { text: reply.text, status: reply.status, stopped: reply.stopped },
        { text: 'First idea.\nSecond idea.', status: 'interrupted', stopped: 'learner' },
    );
    assert.deepEqual(reply.snapshot, [...first.ops, ...second.ops]);
    const calls = env.store.usageEvents().events.filter((event) => event.task === 'chat');
    assert.deepEqual(
        calls.map(({ tree, output, reasoning }) => [tree, output, reasoning]),
        [[id, 14, 3]],
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
