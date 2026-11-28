import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
        createInterface({ input: child.stdin }).on('line', async (line) => {
            const m = JSON.parse(line);
            record.sent.push(m.message.content);
            if (record.hold) await record.hold;
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
                type: 'stream_event',
                event: {
                    type: 'message_delta',
                    usage: { output_tokens_details: { thinking_tokens: 3 } },
                },
            });
            send({
                type: 'result',
                is_error: false,
                usage: {
                    input_tokens: 3,
                    cache_creation_input_tokens: 100,
                    cache_read_input_tokens: 40,
                    output_tokens: 7,
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

test('Claude board: one warm process for the whole board, in its own session at low effort', async (t) => {
    const { launches, board, ask, flag } = setup(t);
    const b = board({ thread: 'chat-session' });
    b.open();
    assert.equal(launches.length, 1, 'started before the first question');
    const first = await ask(b, 'Why?');
    const second = await ask(b, 'And then?');
    assert.equal(launches.length, 1, 'every turn reuses the process');
    const [run] = launches;
    assert.equal(flag(run, '--input-format'), 'stream-json');
    assert.equal(
        run.args.includes('--resume'),
        false,
        'a resumed chat session keeps the chat prompt',
    );
    assert.ok(flag(run, '--session-id'));
    assert.equal(flag(run, '--model'), 'sonnet');
    assert.equal(flag(run, '--effort'), 'low');
    assert.equal(flag(run, '--tools'), '');
    assert.deepEqual(JSON.parse(readFileSync(flag(run, '--mcp-config'))), { mcpServers: {} });
    assert.equal(run.args.includes('--allowedTools'), false);
    assert.equal(run.env.CLAUDE_CODE_EFFORT_LEVEL, 'low');
    assert.equal(run.system, 'Board prompt.');
    assert.deepEqual(run.sent, ['Why?', 'And then?'], 'no saved discussion to replay');
    assert.equal(first.streamed, '> Hello there.\n');
    assert.deepEqual(first.usage, { input: 103, output: 7, cacheRead: 40, thinking: 3 });
    assert.equal(second.status, 'completed');
    assert.equal(b.thread, null, 'the next chat turn replays the saved discussion');
    const image = join(mkdtempSync(join(tmpdir(), 'tt-board-image-')), 'p1.png');
    writeFileSync(image, 'png bytes');
    await b.ask('Look.', () => {}, new AbortController().signal, [
        { type: 'image/png', path: image },
    ]);
    assert.deepEqual(run.sent[2], [
        { type: 'text', text: 'Look.' },
        {
            type: 'image',
            source: {
                type: 'base64',
                media_type: 'image/png',
                data: Buffer.from('png bytes').toString('base64'),
            },
        },
    ]);
});

test('Claude board: tutor tools are its native web tools and app tools served over MCP for its whole life, and report to the turn asking', async (t) => {
    const { launches, board, flag } = setup(t);
    const opened = [];
    const mcp = {
        async open(toolset, emit, signal) {
            opened.push({ toolset, emit, signal });
            return {
                url: 'http://127.0.0.1:9/mcp',
                headers: { Authorization: 'Bearer x' },
                close() {},
            };
        },
    };
    const tools = [{ name: 'run_python', description: 'Run.', parameters: {} }];
    const b = board({ nativeTools: ['web_search', 'read_page'], tools, mcp, runTool: () => 'ok' });
    await b.open();
    const [run] = launches;
    assert.equal(flag(run, '--tools'), 'WebSearch,WebFetch');
    assert.deepEqual(run.args.slice(run.args.indexOf('--allowedTools') + 1).slice(0, 3), [
        'WebSearch',
        'WebFetch',
        'mcp__rabbithole__run_python',
    ]);
    assert.deepEqual(JSON.parse(readFileSync(flag(run, '--mcp-config'))).mcpServers.rabbithole, {
        type: 'http',
        url: 'http://127.0.0.1:9/mcp',
        headers: { Authorization: 'Bearer x' },
    });
    assert.equal(opened.length, 1);
    assert.equal(opened[0].toolset.tools, tools);
    // The CLI's web tool streams its start, then its arguments in the whole message, then its result.
    const held = Promise.withResolvers();
    run.hold = held.promise;
    const events = [];
    const asked = b.ask('Look it up.', (e) => events.push(e), new AbortController().signal);
    await new Promise((resolve) => setImmediate(resolve));
    opened[0].emit({ type: 'tool', tool: { id: 'p1', name: 'run_python', status: 'running' } });
    const send = (o) => run.child.stdout.write(JSON.stringify(o) + '\n');
    const use = { type: 'tool_use', id: 'w1', name: 'WebSearch', input: {} };
    send({ type: 'stream_event', event: { type: 'content_block_start', content_block: use } });
    send({ type: 'assistant', message: { content: [{ ...use, input: { query: 'hyphae' } }] } });
    send({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: 'w1', content: 'found' }] },
    });
    held.resolve();
    const calls = () =>
        events.filter((e) => e.type === 'tool').map((e) => [e.tool.id, e.tool.status]);
    await asked;
    assert.deepEqual(calls(), [
        ['p1', 'running'],
        ['w1', 'running'],
        ['w1', 'running'],
        ['w1', 'done'],
    ]);
    assert.deepEqual(events.find((e) => e.tool?.input?.query)?.tool.input, { query: 'hyphae' });
    b.close();
    assert.equal(opened[0].signal.aborted, true, 'closing the board ends its tool server');
});

test('Claude board: it gets the saved chat once and keeps it out of the chat session', async (t) => {
    const { launches, board, ask } = setup(t);
    const b = board({
        thread: 'chat-session',
        history: [{ role: 'user', text: 'What are hyphae?' }],
    });
    await ask(b, 'Why?');
    await ask(b, 'And then?');
    const [run] = launches;
    assert.match(run.sent[0], /What are hyphae\?[\s\S]*Why\?$/);
    assert.equal(run.sent[1], 'And then?');
    assert.equal(run.args.includes('--resume'), false);
    assert.equal(b.thread, null, 'chat turns never resume the board prompt');
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
    b.open();
    const held = Promise.withResolvers();
    launches[1].hold = held.promise;
    const active = ask(b, 'Back again?');
    t.mock.timers.tick(600000);
    assert.equal(launches[1].child.killed, false, 'an active request cannot go idle');
    held.resolve();
    assert.equal((await active).status, 'completed');
    t.mock.timers.tick(599999);
    assert.equal(launches[1].child.killed, false, 'the idle interval starts after the result');
    assert.equal(launches.length, 2);
    launches[1].dies = true;
    assert.equal((await ask(b, 'Why?')).status, 'failed', 'the process ended on its own');
    assert.equal((await ask(b, 'Again?')).status, 'completed');
    assert.equal(
        flag(launches[2], '--resume'),
        flag(launches[1], '--session-id'),
        'a restart resumes the board session',
    );
    b.close();
    assert.equal(launches[2].child.killed, true);
});
