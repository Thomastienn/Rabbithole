import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { publicAddress } from '../../server/tools/readPage.mjs';
import { toolRunner } from '../../server/tools/runner.mjs';
import { runTool } from '../../server/providers/chatStream.mjs';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';
import { notify, until } from '../support/events.mjs';

const PAGE =
    '<html><head><title>Heaps</title></head><body><article><h1>Heaps</h1><p>The answer printed on this page is forty-two, and a heap keeps its smallest key at the root for quick access.</p><p>Each parent is ordered before its children in the array.</p></article></body></html>';

async function launch(t) {
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }, { id: 'plain' }];
    const hits = [],
        closed = new Set();
    const pages = createServer((req, res) => {
        hits.push(req.url);
        notify();
        if (req.url === '/slow') {
            res.on('close', () => {
                closed.add(req.url);
                notify();
            });
            return; // never answers; only Stop ends it
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(PAGE);
    });
    await new Promise((resolve) => pages.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        pages.closeAllConnections();
        await new Promise((resolve) => pages.close(resolve));
    });
    const site = `http://site.test:${pages.address().port}`;
    const dir = mkdtempSync(join(tmpdir(), 'tt-tools-')),
        store = new Store(join(dir, 'trees.sqlite'));
    const app = createApp({
        store,
        dir,
        endpoint: new OpenAI(dir),
        providers: {},
        defaultProvider: 'claude',
        auth: { status: () => ({ connected: false }) },
        log: () => {},
        // The fake page host resolves to the local page server; every other address keeps the real check.
        tools: toolRunner({
            readPage: {
                lookup: (name, options, callback) =>
                    name === 'site.test'
                        ? options.all
                            ? callback(null, [{ address: '127.0.0.1', family: 4 }])
                            : callback(null, '127.0.0.1', 4)
                        : callback(Object.assign(new Error('not found'), { code: 'ENOTFOUND' })),
                isPublic: (address) => publicAddress(address) || address === '127.0.0.1',
            },
        }),
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (path, body) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const endpoint = (
        await (
            await post('/api/settings/endpoints', {
                name: 'Local',
                baseUrl: fake.baseUrl,
                apiKey: 'sk-test',
            })
        ).json()
    ).at(-1).id;
    const ask = async (model, text = 'What does the page say?') => {
        const id = store.create('Tools', endpoint, model).id;
        const stream = (await post(`/api/trees/${id}/messages`, { text })).body;
        return { id, stream };
    };
    const events = async (stream) =>
        (await new Response(stream).text())
            .split('\n\n')
            .filter((f) => f.startsWith('data: '))
            .map((f) => JSON.parse(f.slice(6)));
    const chats = () => fake.calls.filter((c) => c.path === '/v1/chat/completions');
    return { fake, hits, closed, site, store, origin, post, ask, events, chats };
}

test('a tools-capable endpoint model reads a page through read_page and answers from it', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res, body) =>
        body.messages.some((m) => m.role === 'tool')
            ? streamReply(res, ['The page says ', 'forty-two.'])
            : streamToolCalls(
                  res,
                  [{ name: 'read_page', input: { url: `${env.site}/heaps` } }],
                  'Reading it.',
              );
    const { id, stream } = await env.ask('tooled');
    const events = await env.events(stream);

    const [first, second] = env.chats();
    assert.equal(env.chats().length, 2);
    assert.deepEqual(
        first.body.tools.map((t) => [t.type, t.function.name]),
        [
            ['function', 'read_page'],
            ['function', 'show_visual'],
            ['function', 'make_video'],
            ['function', 'start_discussion'],
            ['function', 'record_turn'],
        ],
    );
    assert.doesNotMatch(first.body.messages[0].content, /Do not use tools/);
    assert.deepEqual(second.body.messages.at(-2), {
        role: 'assistant',
        content: 'Reading it.',
        tool_calls: [
            {
                id: 'call-0',
                type: 'function',
                function: {
                    name: 'read_page',
                    arguments: JSON.stringify({ url: `${env.site}/heaps` }),
                },
            },
        ],
    });
    const result = second.body.messages.at(-1);
    assert.equal(result.role, 'tool');
    assert.equal(result.tool_call_id, 'call-0');
    assert.match(result.content, /Title: Heaps/);
    assert.match(result.content, /forty-two/);
    assert.deepEqual(env.hits, ['/heaps']);

    // Tool events stream running then done, with the same id, input and the raw output.
    const tools = events.filter((e) => e.type === 'tool').map((e) => e.tool);
    assert.deepEqual(
        tools.map((t) => t.status),
        ['running', 'done'],
    );
    assert.equal(tools[0].id, tools[1].id);
    assert.deepEqual(tools[1].input, { url: `${env.site}/heaps` });
    assert.equal(tools[1].output, result.content);
    assert.ok(Number.isInteger(tools[1].elapsed));
    assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });

    // Stored per reply message and returned with the conversation.
    const saved = await (await fetch(`${env.origin}/api/trees/${id}`)).json();
    const reply = saved.messages.at(-1);
    assert.equal(reply.text, 'Reading it.\n\nThe page says forty-two.');
    assert.deepEqual(reply.tools, [
        {
            id: tools[0].id,
            name: 'read_page',
            input: { url: `${env.site}/heaps` },
            output: result.content,
            status: 'done',
            elapsed: tools[1].elapsed,
        },
    ]);
});

test('a refused or failing tool call goes back to the model as an error, and the loop continues', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res, body) => {
        const results = body.messages.filter((m) => m.role === 'tool');
        if (results.length === 2) return streamReply(res, ['Could not read those.']);
        streamToolCalls(res, [
            { name: 'read_page', input: { url: 'http://127.0.0.2:9/' } },
            { name: 'read_page', input: { url: 'http://192.168.0.1/admin' } },
        ]);
    };
    const { id, stream } = await env.ask('tooled');
    await env.events(stream);
    const tools = env.store.tree(id).messages.at(-1).tools;
    assert.deepEqual(
        tools.map((t) => t.status),
        ['failed', 'failed'],
    );
    for (const t of tools) assert.match(t.output, /^Error: read_page refuses/);
    assert.equal(env.store.tree(id).messages.at(-1).text, 'Could not read those.');
    assert.deepEqual(env.hits, []);
});

test('models without tool capability get a request without native tools', async (t) => {
    const env = await launch(t);
    const { id, stream } = await env.ask('plain');
    await env.events(stream);
    assert.equal(env.chats().length, 1);
    assert.equal(Object.hasOwn(env.chats()[0].body, 'tools'), false);
    // App tools are described for the <tool_call> text fallback instead.
    assert.match(env.chats()[0].body.messages[0].content, /<tool_call>/);
    const reply = env.store.tree(id).messages.at(-1);
    assert.equal(reply.text, 'Peterson uses two flags.');
    assert.equal(reply.tools, undefined);
});

test('Stop ends the loop and the running tool; the call is kept as failed', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res) =>
        streamToolCalls(res, [{ name: 'read_page', input: { url: `${env.site}/slow` } }]);
    const { id, stream } = await env.ask('tooled');
    const pending = env.events(stream);
    await until(
        () =>
            env.hits.includes('/slow') &&
            env.store.toolCalls(env.store.tree(id).messages.at(-1).id).length,
    );
    assert.equal((await env.post(`/api/trees/${id}/stop`, {})).status, 200);
    const events = await pending;
    await until(() => env.closed.has('/slow'));
    const stoppedTool = events.filter((e) => e.type === 'tool').at(-1).tool;
    assert.equal(stoppedTool.status, 'failed');
    assert.equal(stoppedTool.output, 'Stopped before it finished.');
    assert.deepEqual(events.at(-1), { type: 'done', status: 'interrupted' });
    assert.equal(env.chats().length, 1);
    const reply = env.store.tree(id).messages.at(-1);
    assert.equal(reply.status, 'interrupted');
    assert.equal(reply.tools[0].status, 'failed');
    assert.equal(reply.tools[0].output, 'Stopped before it finished.');
});

test('tool turns keep running across model rounds until the model answers', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res, body) =>
        body.messages.filter((m) => m.role === 'tool').length === 12
            ? streamReply(res, ['Finished reading.'])
            : streamToolCalls(res, [{ name: 'read_page', input: { url: `${env.site}/heaps` } }]);
    const { id, stream } = await env.ask('tooled');
    assert.equal((await env.events(stream)).at(-1).status, 'completed');
    assert.equal(env.chats().length, 13);
    assert.equal(env.store.tree(id).messages.at(-1).tools.length, 12);
});

test('a truncated tool call is never executed', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res, body) =>
        body.messages.some((m) => m.role === 'tool')
            ? streamReply(res, ['Should not get here.'])
            : streamToolCalls(
                  res,
                  [{ name: 'read_page', input: { url: `${env.site}/heaps` } }],
                  '',
                  'length',
              );
    const { id, stream } = await env.ask('tooled');
    assert.equal((await env.events(stream)).at(-1).status, 'failed');
    assert.deepEqual(env.hits, []);
    assert.equal(env.store.tree(id).messages.at(-1).tools, undefined);
});

test('endpoint credential echoes in tool input are refused and redacted before streaming or storage', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res, body) =>
        body.messages.some((m) => m.role === 'tool')
            ? streamReply(res, ['Call refused.'])
            : streamToolCalls(res, [
                  { name: 'read_page', input: { url: `${env.site}/heaps?key=sk-test` } },
              ]);
    const { id, stream } = await env.ask('tooled');
    const events = await env.events(stream);
    assert.doesNotMatch(JSON.stringify(events), /sk-test/);
    const reply = env.store.tree(id).messages.at(-1);
    assert.doesNotMatch(JSON.stringify(reply), /sk-test/);
    assert.equal(reply.tools[0].status, 'failed');
    assert.deepEqual(env.hits, []);
});

test('a running tool reports elapsed time until it finishes, then stops its timer', async (t) => {
    let now = 100;
    t.mock.method(performance, 'now', () => now);
    t.mock.timers.enable({ apis: ['setInterval'] });
    const pending = Promise.withResolvers(),
        events = [];
    const run = runTool(
        { tools: [{ name: 'read_page' }], runTool: () => pending.promise },
        { name: 'read_page', arguments: '{}' },
        (event) => events.push(event),
        new AbortController().signal,
        'fixture-secret',
    );
    assert.equal(events[0].tool.status, 'running');
    now += 1000;
    t.mock.timers.tick(1000);
    assert.equal(events.at(-1).tool.elapsed, 1000);
    assert.equal(events.at(-1).tool.status, 'running');
    pending.resolve('Page text');
    await run;
    assert.equal(events.at(-1).tool.status, 'done');
    const count = events.length;
    t.mock.timers.tick(5000);
    assert.equal(events.length, count);
});

test('escaped endpoint credentials in tool arguments are refused without leaking decoded input', async () => {
    const events = [];
    await runTool(
        { tools: [{ name: 'read_page' }], runTool: () => assert.fail('Credentials reached tool') },
        { name: 'read_page', arguments: '{"url":"https://example.com/?key=\\u0073k-test"}' },
        (event) => events.push(event),
        new AbortController().signal,
        'sk-test',
    );
    assert.doesNotMatch(JSON.stringify(events), /sk-test/);
    assert.equal(events.at(-1).tool.status, 'failed');
});

test('a follow-up turn replays earlier tool calls with their saved outputs instead of re-running them', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res, body) =>
        body.messages.at(-1).role === 'tool'
            ? streamReply(res, ['It says forty-two.'])
            : body.messages.at(-1).content === 'And again?'
              ? streamReply(res, ['Still forty-two.'])
              : streamToolCalls(res, [{ name: 'read_page', input: { url: `${env.site}/heaps` } }]);
    const { id, stream } = await env.ask('tooled');
    await env.events(stream);
    const [saved] = env.store.tree(id).messages.at(-1).tools;

    await env.events((await env.post(`/api/trees/${id}/messages`, { text: 'And again?' })).body);
    assert.deepEqual(env.hits, ['/heaps']);
    const followUp = env.chats().at(-1).body.messages;
    assert.deepEqual(followUp.slice(1), [
        { role: 'user', content: 'What does the page say?' },
        {
            role: 'assistant',
            content: null,
            tool_calls: [
                {
                    id: saved.id,
                    type: 'function',
                    function: { name: 'read_page', arguments: JSON.stringify(saved.input) },
                },
            ],
        },
        { role: 'tool', tool_call_id: saved.id, content: saved.output },
        { role: 'assistant', content: 'It says forty-two.' },
        { role: 'user', content: 'And again?' },
    ]);
    assert.match(saved.output, /forty-two/);
});

test('usage of every model call in a tool turn is summed into the reply and usage history', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res, body) =>
        body.messages.at(-1).role === 'tool'
            ? streamReply(res, ['Done.'], 'stop', {
                  prompt_tokens: 300,
                  completion_tokens: 20,
                  prompt_tokens_details: { cached_tokens: 100 },
                  completion_tokens_details: { reasoning_tokens: 12 },
              })
            : streamToolCalls(
                  res,
                  [{ name: 'read_page', input: { url: `${env.site}/heaps` } }],
                  '',
                  'tool_calls',
                  {
                      prompt_tokens: 120,
                      completion_tokens: 15,
                  },
              );
    const { id, stream } = await env.ask('tooled');
    const events = await env.events(stream);
    assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
    assert.ok(env.chats().every((c) => c.body.stream_options?.include_usage === true));
    // Only the second round reports reasoning; it is summed into output's share, not added to output.
    const total = { input: 320, output: 35, cacheRead: 100, reasoning: 12 };
    const { at, ...usage } = env.store.tree(id).messages.at(-1).usage;
    assert.deepEqual(usage, total);
    const { events: recorded } = env.store.usageEvents();
    assert.equal(recorded.length, 1);
    const [event] = recorded;
    assert.deepEqual(
        {
            input: event.input,
            output: event.output,
            cacheRead: event.cacheRead,
            reasoning: event.reasoning,
            task: event.task,
        },
        { ...total, task: 'chat' },
    );
});

test('a tool-free endpoint call asks for usage and records it once', async (t) => {
    const env = await launch(t);
    env.fake.reply = (req, res) =>
        streamReply(res, ['Plain.'], 'stop', { prompt_tokens: 50, completion_tokens: 7 });
    const { id, stream } = await env.ask('plain');
    assert.deepEqual((await env.events(stream)).at(-1), { type: 'done', status: 'completed' });
    const [chat] = env.chats();
    assert.equal(chat.body.tools, undefined);
    assert.equal(chat.body.stream_options?.include_usage, true);
    const { at, ...usage } = env.store.tree(id).messages.at(-1).usage;
    assert.deepEqual(usage, { input: 50, output: 7, cacheRead: 0 });
    const { events } = env.store.usageEvents();
    assert.equal(events.length, 1);
    assert.deepEqual(
        [events[0].input, events[0].output, events[0].reasoning, events[0].task],
        [50, 7, null, 'chat'],
    );
});

test('uses tutor tools: override, else reported tools, else off; tool switches remove tools; all off is tool-free', async (t) => {
    const env = await launch(t);
    const uses = async () =>
        Object.fromEntries(
            (await (await fetch(`${env.origin}/api/models`)).json()).models
                .filter((m) => m.provider.startsWith('openai:'))
                .map((m) => [m.model, m.usesTutorTools]),
        );
    const offered = async (model) => {
        await env.events((await env.ask(model)).stream);
        return (
            env
                .chats()
                .at(-1)
                .body.tools?.map((x) => x.function.name) ?? null
        );
    };
    const id = (await (await fetch(`${env.origin}/api/models`)).json()).models.find(
        (m) => m.model === 'tooled',
    ).provider;
    assert.deepEqual(await uses(), { tooled: true, plain: false });
    assert.deepEqual(await offered('tooled'), [
        'read_page',
        'show_visual',
        'make_video',
        'start_discussion',
        'record_turn',
    ]);
    assert.equal(await offered('plain'), null);

    const toggle = async (model, usesTutorTools) =>
        assert.equal(
            (await env.post('/api/settings/endpoints/model', { id, model, usesTutorTools })).status,
            200,
        );
    await toggle('tooled', false);
    await toggle('plain', true);
    assert.deepEqual(await uses(), { tooled: false, plain: true });
    assert.equal(await offered('tooled'), null);
    assert.deepEqual(await offered('plain'), [
        'read_page',
        'show_visual',
        'make_video',
        'start_discussion',
        'record_turn',
    ]);
    assert.equal(
        (await env.post('/api/settings/endpoints/model', { id, model: 'plain', usesTutorTools: 1 }))
            .status,
        400,
    );

    // Switching off the only learner tool still offers show_visual, which is never learner-toggled.
    const switched = await (
        await env.post('/api/settings/tutor-tools', { name: 'read_page', enabled: false })
    ).json();
    assert.equal(switched.find((x) => x.name === 'read_page').enabled, false);
    assert.deepEqual(await offered('plain'), [
        'show_visual',
        'make_video',
        'start_discussion',
        'record_turn',
    ]);
    assert.doesNotMatch(env.chats().at(-1).body.messages[0].content, /rabbithole-visual/);
    assert.equal(
        (await env.post('/api/settings/tutor-tools', { name: 'nope', enabled: false })).status,
        400,
    );
});
