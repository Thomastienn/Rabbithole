import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Codex } from '../../server/providers/codex.mjs';

// A Codex app-server stand-in: it records every request and streams one reply per turn unless told to hold.
function setup(t) {
    const server = { requests: [], launches: 0, hold: false };
    const launch = () => {
        server.launches++;
        const child = new EventEmitter();
        Object.assign(child, {
            stdin: new PassThrough(),
            stdout: new PassThrough(),
            stderr: new PassThrough(),
        });
        child.kill = () => child.stdout.end();
        const send = (m) => child.stdout.writable && child.stdout.write(JSON.stringify(m) + '\n');
        const note = (method, params) =>
            send({ method, params: { threadId: 't1', turnId: 'u1', ...params } });
        createInterface({ input: child.stdin }).on('line', (line) => {
            const m = JSON.parse(line);
            if (m.id == null) return;
            server.requests.push(m);
            const result =
                m.method === 'thread/start' || m.method === 'thread/resume'
                    ? { thread: { id: 't1' } }
                    : m.method === 'turn/start'
                      ? { turn: { id: 'u1' } }
                      : {};
            send({ id: m.id, result });
            if (m.method === 'turn/interrupt')
                note('turn/completed', { turn: { status: 'interrupted' } });
            if (m.method !== 'turn/start' || server.hold) return;
            note('item/agentMessage/delta', { itemId: 'a1', delta: '> Hello' });
            note('item/agentMessage/delta', { itemId: 'a1', delta: ' there.\n' });
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
        codex.board({ model: 'fixture-model', system: 'Board prompt.', ...options });
    const ask = async (b, text, signal = new AbortController().signal) => {
        let streamed = '';
        const result = await b.ask(text, (e) => (streamed += e.text), signal);
        return { ...result, streamed };
    };
    const sent = (method) => server.requests.filter((r) => r.method === method);
    return { server, board, ask, sent };
}

test('Codex board: turns run on the shared app-server with the board prompt at low effort', async (t) => {
    const { server, board, ask, sent } = setup(t);
    const b = board({ thread: null, history: [{ role: 'user', text: 'What are hyphae?' }] });
    await b.open();
    assert.equal(server.launches, 1, 'the app-server is warm before the first question');
    const first = await ask(b, 'Why?');
    assert.equal(first.status, 'completed');
    assert.equal(first.streamed, '> Hello there.\n');
    assert.deepEqual(first.usage, { input: 30, output: 7, cacheRead: 20, thinking: 0 });
    assert.equal(sent('thread/start')[0].params.baseInstructions, 'Board prompt.');
    assert.equal(sent('turn/start')[0].params.effort, 'low');
    assert.deepEqual(
        sent('thread/inject_items')[0].params.items.map((i) => i.content[0].text),
        ['What are hyphae?'],
        'a fresh thread gets the saved chat',
    );
    assert.equal(b.thread, 't1', 'later chat turns resume the board thread');
    await ask(b, 'And then?');
    assert.equal(server.launches, 1);
    const [resume] = sent('thread/resume');
    assert.equal(resume.params.threadId, 't1');
    assert.equal(resume.params.baseInstructions, 'Board prompt.');
    assert.equal(sent('thread/inject_items').length, 1, 'a resumed thread already holds the chat');
});

test('Codex board: a conversation thread is resumed, and leaving interrupts the running turn', async (t) => {
    const { server, board, ask, sent } = setup(t);
    const b = board({ thread: 'chat-thread' });
    server.hold = true;
    const leave = new AbortController();
    const active = ask(b, 'Why?', leave.signal);
    while (!sent('turn/start').length) await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sent('thread/resume')[0].params.threadId, 'chat-thread');
    leave.abort();
    assert.equal((await active).status, 'interrupted');
    assert.deepEqual(sent('turn/interrupt')[0].params, { threadId: 't1', turnId: 'u1' });
});
