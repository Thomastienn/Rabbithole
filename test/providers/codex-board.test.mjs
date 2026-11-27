import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Codex } from '../../server/providers/codex.mjs';

const boardPrompt = 'Fixture board instructions.';
const caption = '> Hello there.\n';

// Loaded threads keep their instructions on resume, just as the app-server does.
function setup(t) {
    const server = { launches: 0, turns: [], hold: false };
    const threads = new Map();
    const turnStarted = Promise.withResolvers();
    const interrupted = Promise.withResolvers();
    const launch = () => {
        server.launches++;
        const loaded = new Map();
        const child = new EventEmitter();
        Object.assign(child, {
            stdin: new PassThrough(),
            stdout: new PassThrough(),
            stderr: new PassThrough(),
        });
        child.kill = () => child.stdout.end();
        const send = (m) => child.stdout.writable && child.stdout.write(JSON.stringify(m) + '\n');
        createInterface({ input: child.stdin }).on('line', (line) => {
            const m = JSON.parse(line);
            if (m.id == null) return;
            const { threadId, baseInstructions, items, input, effort } = m.params;
            const previous = loaded.get(threadId) ?? threads.get(threadId);
            const respond = (result = {}) => send({ id: m.id, result });
            if (m.method === 'thread/start' || m.method === 'thread/fork') {
                const id = `t${threads.size + 1}`;
                const thread = {
                    instructions: baseInstructions,
                    history: [...(threads.get(threadId)?.history ?? [])],
                };
                loaded.set(id, thread);
                threads.set(id, structuredClone(thread));
                return respond({ thread: { id } });
            }
            if (m.method === 'thread/resume') {
                if (!loaded.has(threadId))
                    loaded.set(threadId, {
                        ...structuredClone(previous),
                        instructions: baseInstructions,
                    });
                return respond({ thread: { id: threadId } });
            }
            if (m.method === 'thread/inject_items') {
                previous.history.push(...items.map((item) => item.content[0].text));
                return respond();
            }
            if (m.method === 'turn/interrupt') {
                interrupted.resolve(m.params);
                return respond();
            }
            if (m.method !== 'turn/start') return respond();
            const turnId = `u${server.turns.length + 1}`;
            const note = (method, params) =>
                send({ method, params: { threadId, turnId, ...params } });
            const { instructions, history } = previous;
            server.turns.push({ threadId, turnId, effort, input, history: [...history] });
            respond({ turn: { id: turnId } });
            turnStarted.resolve();
            if (server.hold) return;
            const reply = instructions === boardPrompt ? caption : 'A chat reply.';
            history.push(input[0].text, reply);
            threads.set(threadId, structuredClone(previous));
            note('item/agentMessage/delta', { itemId: 'a1', delta: reply.slice(0, 7) });
            note('item/agentMessage/delta', { itemId: 'a1', delta: reply.slice(7) });
            const tokens = {
                inputTokens: 50,
                cachedInputTokens: 20,
                outputTokens: 7,
                reasoningOutputTokens: 0,
            };
            note('thread/tokenUsage/updated', { tokenUsage: { last: tokens, total: tokens } });
            note('turn/completed', { turn: { status: 'completed' } });
        });
        return child;
    };
    const codex = new Codex(
        { token: async () => 'synthetic-token' },
        mkdtempSync(join(tmpdir(), 'tt-codex-board-')),
        launch,
    );
    t.after(() => codex.close());
    const board = (options) =>
        codex.board({ model: 'fixture-model', system: boardPrompt, ...options });
    const ask = async (b, text, signal = new AbortController().signal) => {
        let streamed = '';
        const result = await b.ask(text, (e) => (streamed += e.text), signal);
        return { ...result, streamed };
    };
    const chat = async (text, { thread, messages, nativeTools } = {}) => {
        let reply = '';
        await codex.generate(
            { model: 'fixture-model', effort: 'medium', thread, messages, nativeTools },
            text,
            (event) => {
                if (event.type === 'delta') reply += event.text;
            },
            (id) => (thread = id),
            new AbortController().signal,
        );
        return { thread, reply };
    };
    return {
        server,
        board,
        ask,
        chat,
        turnStarted: turnStarted.promise,
        interrupted: interrupted.promise,
    };
}

test('Codex board: turns run on the shared app-server with the board prompt at low effort', async (t) => {
    const { server, board, ask } = setup(t);
    const b = board({ thread: null, history: [{ role: 'user', text: 'What are hyphae?' }] });
    await b.open();
    assert.equal(server.launches, 1, 'the app-server is warm before the first question');
    const first = await ask(b, 'Why?');
    assert.equal(first.status, 'completed');
    assert.equal(first.streamed, caption);
    assert.deepEqual(first.usage, { input: 30, output: 7, cacheRead: 20, thinking: 0 });
    assert.equal(server.turns[0].effort, 'low');
    assert.deepEqual(server.turns[0].history, ['What are hyphae?']);
    const thread = b.thread;
    assert.equal((await ask(b, 'And then?')).streamed, caption);
    assert.equal(server.launches, 1);
    assert.equal(b.thread, thread);
    assert.deepEqual(server.turns[1].history, ['What are hyphae?', 'Why?', caption]);
    await b.ask('Look.', () => {}, new AbortController().signal, [
        { type: 'image/png', path: '/tmp/p1.png' },
    ]);
    assert.deepEqual(server.turns[2].input[1], { type: 'localImage', path: '/tmp/p1.png' });
});

test('Codex board: switching modes changes the effective prompt and carries the history both ways', async (t) => {
    const { server, board, ask, chat } = setup(t);
    const first = await chat('What are hyphae?');
    const b = board({ thread: first.thread });
    assert.equal((await ask(b, 'How do they grow?')).streamed, caption);
    assert.deepEqual(server.turns[1].history, ['What are hyphae?', first.reply]);

    const following = await chat('What was on the board?', { thread: b.thread });
    assert.equal(following.reply, first.reply);
    assert.deepEqual(server.turns[2].history, [
        'What are hyphae?',
        first.reply,
        'How do they grow?',
        caption,
    ]);
    assert.equal(server.launches, 1);
});

test('Codex chat: replay keeps the caption saved from an interrupted board turn', async (t) => {
    const { server, chat } = setup(t);
    await chat('What did you just say?', {
        messages: [
            { role: 'assistant', status: 'interrupted', board: true, text: 'The caption I saw.' },
            { role: 'assistant', status: 'interrupted', board: true, text: '' },
            { role: 'assistant', status: 'interrupted', text: 'An unfinished chat reply.' },
        ],
    });
    assert.deepEqual(server.turns[0].history, ['The caption I saw.']);
});

test('Codex board: reopening sees chat turns made by the tools app-server', async (t) => {
    const { server, board, ask, chat } = setup(t);
    const first = board();
    await ask(first, 'What are hyphae?');
    const following = await chat('Can you search for that?', {
        thread: first.thread,
        nativeTools: ['web_search'],
    });
    assert.equal(following.reply, 'A chat reply.');
    assert.equal(
        (await ask(board({ thread: following.thread }), 'How do they grow?')).streamed,
        caption,
    );
    assert.deepEqual(server.turns[2].history, [
        'What are hyphae?',
        caption,
        'Can you search for that?',
        following.reply,
    ]);
    assert.equal(server.launches, 2);
});

test('Codex board: leaving interrupts the running turn', async (t) => {
    const { server, board, ask, turnStarted, interrupted } = setup(t);
    const b = board();
    server.hold = true;
    const leave = new AbortController();
    const active = ask(b, 'Why?', leave.signal);
    await turnStarted;
    leave.abort();
    assert.equal((await active).status, 'interrupted');
    const { threadId, turnId } = server.turns[0];
    assert.deepEqual(await interrupted, { threadId, turnId });
});
