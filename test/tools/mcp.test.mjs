import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { toolMcp } from '../../server/tools/mcp.mjs';

const definition = {
    name: 'read_page',
    description: 'Read a page.',
    parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
        additionalProperties: false,
    },
};
async function connect(t, turn) {
    const client = new Client({ name: 'test', version: '1' });
    t.after(() => client.close());
    await client.connect(
        new StreamableHTTPClientTransport(new URL(turn.url), {
            requestInit: { headers: turn.headers },
        }),
    );
    return client;
}

test('MCP binds bearer headers to isolated turn runners and revokes them on end/Stop', async (t) => {
    const mcp = toolMcp();
    t.after(() => mcp.close());
    const events = [],
        calls = [];
    const open = (context, signal = new AbortController().signal) =>
        mcp.open(
            {
                tools: [definition],
                runTool: async (name, input) => {
                    calls.push({ context, name, input });
                    return context;
                },
            },
            (e) => events.push(e),
            signal,
        );
    const a = await open('conversation-a/reply-a'),
        b = await open('conversation-b/reply-b');
    assert.equal(a.url, b.url);
    assert.notEqual(a.headers.Authorization, b.headers.Authorization);
    const probe = (headers = {}, method = 'POST') => fetch(a.url, { method, headers });
    assert.equal((await probe()).status, 401);
    assert.equal((await probe({ Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await probe({ ...a.headers, Origin: 'https://hostile.example' })).status, 403);
    assert.equal(
        await new Promise((resolve) => {
            const req = request(
                a.url,
                { method: 'POST', headers: { ...a.headers, Host: 'hostile.example' } },
                (res) => {
                    res.resume();
                    resolve(res.statusCode);
                },
            );
            req.end();
        }),
        403,
    );
    assert.equal((await probe(a.headers, 'GET')).status, 405);
    const first = await connect(t, a),
        second = await connect(t, b);
    assert.deepEqual((await first.listTools()).tools, [
        {
            name: definition.name,
            description: definition.description,
            inputSchema: definition.parameters,
        },
    ]);
    const call = (client) =>
        client.callTool({ name: 'read_page', arguments: { url: 'https://example.org' } });
    assert.equal((await call(first)).content[0].text, 'conversation-a/reply-a');
    assert.equal((await call(second)).content[0].text, 'conversation-b/reply-b');
    assert.deepEqual(
        calls.map((c) => c.context),
        ['conversation-a/reply-a', 'conversation-b/reply-b'],
    );
    assert.deepEqual(
        events.map((e) => e.tool.status),
        ['running', 'done', 'running', 'done'],
    );
    await assert.rejects(
        first.callTool({ name: 'read_page', arguments: { url: 3 } }),
        /Invalid tool arguments/,
    );
    await assert.rejects(first.callTool({ name: 'not_offered', arguments: {} }), /unavailable/);
    assert.equal(calls.length, 2);
    a.close();
    assert.equal((await probe(a.headers)).status, 401);
    assert.equal((await call(second)).content[0].text, 'conversation-b/reply-b');
    const controller = new AbortController();
    const stopped = await open('stopped', controller.signal);
    controller.abort();
    assert.equal((await probe(stopped.headers)).status, 401);
    b.close();
    const next = await open('next');
    assert.notEqual(next.headers.Authorization, a.headers.Authorization);
    next.close();
});

test('MCP returns runner failures as tool errors, redacts its secret and aborts in-flight work on revocation', async (t) => {
    const mcp = toolMcp();
    t.after(() => mcp.close());
    const entered = Promise.withResolvers(),
        aborted = Promise.withResolvers();
    const events = [];
    let mode = 'fail',
        secret;
    const turn = await mcp.open(
        {
            tools: [definition],
            runTool: async (_name, _input, signal) => {
                if (mode === 'fail') throw new Error('Page unavailable');
                if (mode === 'echo') return secret;
                entered.resolve();
                await new Promise((resolve) =>
                    signal.addEventListener(
                        'abort',
                        () => {
                            aborted.resolve();
                            resolve();
                        },
                        { once: true },
                    ),
                );
                signal.throwIfAborted();
            },
        },
        (e) => events.push(e),
        new AbortController().signal,
    );
    secret = turn.headers.Authorization.slice(7);
    const client = await connect(t, turn);
    const call = () =>
        client.callTool({ name: 'read_page', arguments: { url: 'https://example.org' } });
    assert.deepEqual(await call(), {
        content: [{ type: 'text', text: 'Error: Page unavailable' }],
        isError: true,
    });
    assert.equal(events.at(-1).tool.status, 'failed');
    mode = 'echo';
    assert.equal((await call()).content[0].text, '[redacted]');
    assert.equal(JSON.stringify(events).includes(secret), false);
    mode = 'hold';
    const pending = call();
    const rejected = assert.rejects(pending);
    await entered.promise;
    turn.close();
    await aborted.promise;
    await rejected;
    assert.equal(
        events.some((e) => e.tool.status === 'done' && e.tool.output === undefined),
        false,
    );
});
