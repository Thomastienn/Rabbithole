import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';

// A stream-json CLI stand-in: each user line gets a streamed reply and a result; it records how it was started.
function setup(t) {
    const launches = [];
    const launch = (cmd, args, options) => {
        const child = new EventEmitter();
        Object.assign(child, {
            stdin: new PassThrough(),
            stdout: new PassThrough(),
            stderr: new PassThrough(),
            killed: false,
        });
        child.kill = () => {
            child.killed = true;
            child.stdout.end();
            queueMicrotask(() => child.emit('close'));
        };
        const record = { args, env: options.env, sent: [], child };
        const at = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
        record.system = readFileSync(at('--system-prompt-file'), 'utf8');
        createInterface({ input: child.stdin }).on('line', (line) => {
            const m = JSON.parse(line);
            record.sent.push(m.message.content);
            if (record.dies) return child.kill();
            const send = (o) => child.stdout.write(JSON.stringify(o) + '\n');
            send({
                type: 'system',
                subtype: 'init',
                session_id: at('--resume') ?? at('--session-id'),
            });
            for (const text of ['> Hello', ' there.\n'])
                send({ type: 'stream_event', event: { delta: { type: 'text_delta', text } } });
            send({
                type: 'result',
                is_error: false,
                usage: {
                    input_tokens: 3,
                    cache_creation_input_tokens: 100,
                    cache_read_input_tokens: 40,
                    output_tokens: 7,
                    output_tokens_details: { thinking_tokens: 0 },
                },
            });
        });
        launches.push(record);
        return child;
    };
    const claude = new Claude(mkdtempSync(join(tmpdir(), 'tt-board-')), launch);
    const board = (options) => {
        const b = claude.board({ model: 'sonnet', system: 'Board prompt.', ...options });
        t.after(() => b.close());
        return b;
    };
    const ask = async (b, text) => {
        let streamed = '';
        const result = await b.ask(text, (e) => (streamed += e.text), new AbortController().signal);
        return { ...result, streamed };
    };
    const flag = (record, name) => record.args[record.args.indexOf(name) + 1];
    return { launches, board, ask, flag };
}

test('Claude board: one warm process for the whole board, resuming the conversation at low effort', async (t) => {
    const { launches, board, ask, flag } = setup(t);
    const b = board({ thread: 'chat-session' });
    b.open();
    assert.equal(launches.length, 1, 'started before the first question');
    const first = await ask(b, 'Why?');
    const second = await ask(b, 'And then?');
    assert.equal(launches.length, 1, 'every turn reuses the process');
    const [run] = launches;
    assert.equal(flag(run, '--input-format'), 'stream-json');
    assert.equal(flag(run, '--resume'), 'chat-session');
    assert.equal(flag(run, '--model'), 'sonnet');
    assert.equal(flag(run, '--effort'), 'low');
    assert.equal(run.env.CLAUDE_CODE_EFFORT_LEVEL, 'low');
    assert.equal(run.system, 'Board prompt.');
    assert.deepEqual(run.sent, ['Why?', 'And then?'], 'a resumed session already holds the chat');
    assert.equal(first.streamed, '> Hello there.\n');
    assert.deepEqual(first.usage, { input: 103, output: 7, cacheRead: 40, thinking: 0 });
    assert.equal(second.status, 'completed');
    assert.equal(b.thread, 'chat-session');
});

test('Claude board: a fresh conversation gets the saved chat once and keeps its new session', async (t) => {
    const { launches, board, ask, flag } = setup(t);
    const b = board({ thread: null, history: [{ role: 'user', text: 'What are hyphae?' }] });
    await ask(b, 'Why?');
    await ask(b, 'And then?');
    const [run] = launches;
    assert.match(run.sent[0], /What are hyphae\?[\s\S]*Why\?$/);
    assert.equal(run.sent[1], 'And then?');
    assert.equal(b.thread, flag(run, '--session-id'), 'later chat turns resume the board session');
});

test('Claude board: it stops after 10 minutes idle or on close, and a dead process restarts on the next question', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { launches, board, ask, flag } = setup(t);
    const b = board({ thread: 'chat-session' });
    b.open();
    t.mock.timers.tick(599000);
    assert.equal(launches[0].child.killed, false);
    t.mock.timers.tick(1000);
    assert.equal(launches[0].child.killed, true, 'idle for 10 minutes');
    await ask(b, 'Back again?');
    assert.equal(launches.length, 2);
    launches[1].dies = true;
    assert.equal((await ask(b, 'Why?')).status, 'failed', 'the process ended on its own');
    assert.equal((await ask(b, 'Again?')).status, 'completed');
    assert.equal(flag(launches[2], '--resume'), 'chat-session');
    b.close();
    assert.equal(launches[2].child.killed, true);
});
