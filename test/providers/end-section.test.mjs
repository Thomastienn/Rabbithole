import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { createInterface } from 'node:readline';
import { ENDED } from '../../server/providers/chatStream.mjs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';
import { observeStore, until } from '../support/events.mjs';
import { taskOf } from '../support/model-task.mjs';

const SVG =
    '<svg viewBox="0 0 10 10" role="img" aria-label="Dot"><circle cx="5" cy="5" r="2"/></svg>';

test('a custom endpoint reply ends at [[end]]: its visual and call still run and no further request answers again', async (t) => {
    const logs = [];
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
    const dir = mkdtempSync(join(tmpdir(), 'tt-end-section-')),
        store = observeStore(new Store(join(dir, 'trees.sqlite')));
    const app = createApp({
        store,
        dir,
        endpoint: new OpenAI(dir),
        providers: {},
        defaultProvider: 'claude',
        auth: { status: () => ({ connected: false }) },
        log: (line) => logs.push(line),
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
    const tutor = [];
    fake.reply = async (req, res, body) => {
        if (taskOf(body.messages.at(-1).content)?.request) return streamReply(res, [SVG]);
        if (!body.tools?.some((tool) => tool.function.name === 'make_video'))
            return streamReply(res, ['[]']);
        tutor.push(body);
        if (tutor.length > 1) return streamReply(res, ['Cut. Then search one half.\n[[end]]']);
        return streamToolCalls(
            res,
            [{ name: 'make_video', input: { topic: 'Halving' } }],
            'Cut. [[visual: halving | shows: A list cut in half]]\n[[next: Why halve?]]\n[[end]]\nCut again.',
            'tool_calls',
            { prompt_tokens: 40, completion_tokens: 9 },
        );
    };
    const id = store.create('Visuals', endpoint, 'tooled').id;
    const events = (await (await post(`/api/trees/${id}/messages`, { text: 'Halve?' })).text())
        .split('\n\n')
        .filter((f) => f.startsWith('data: '))
        .map((f) => JSON.parse(f.slice(6)));
    assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
    assert.equal(tutor.length, 1);
    for (const e of events.filter((e) => e.type === 'text')) assert.doesNotMatch(e.text, /again/);
    const saved = store.tree(id);
    const reply = saved.messages.at(-1);
    assert.equal(reply.status, 'completed');
    assert.equal(reply.text, 'Cut. \n\n');
    assert.deepEqual(reply.questions, ['Why halve?']);
    assert.equal(saved.artifacts.length, 1);
    assert.equal(saved.artifacts[0].position, 'Cut. '.length);
    await until(() => store.tree(id).artifacts[0]?.status === 'ready');
    // The call ran: beside the visual its video is refused.
    assert.ok(logs.some((l) => /tool="make_video" cause="make_video stands alone/.test(l)));
    assert.deepEqual(
        store
            .usageEvents()
            .events.filter((u) => u.task === 'chat')
            .map(({ input, output }) => ({ input, output })),
        [{ input: 40, output: 9 }],
    );
});

// A CLI that writes its lines, then waits until it is killed.
const scripted = (lines, launches) => (command, args) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
        child.killed = true;
        child.stdout.end();
        queueMicrotask(() => child.emit('close', null));
    };
    launches.push({ args, child });
    queueMicrotask(() => {
        for (const line of lines)
            if (!child.killed) child.stdout.write(JSON.stringify(line) + '\n');
    });
    return child;
};
const stream = (event) => ({ type: 'stream_event', event });

test('a Claude run the server ends at [[end]] completes, sums each message’s usage and keeps its session', async () => {
    const launches = [];
    const claude = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-end-claude-')),
        scripted(
            [
                { type: 'system', subtype: 'init', session_id: 'session-1' },
                stream({
                    type: 'message_start',
                    message: {
                        id: 'm1',
                        usage: {
                            input_tokens: 10,
                            cache_creation_input_tokens: 5,
                            cache_read_input_tokens: 100,
                            output_tokens: 1,
                        },
                    },
                }),
                stream({
                    type: 'content_block_delta',
                    delta: { type: 'text_delta', text: 'Cut.\n[[end]]' },
                }),
                stream({ type: 'message_delta', usage: { output_tokens: 20 } }),
                stream({
                    type: 'message_start',
                    message: {
                        id: 'm2',
                        usage: {
                            input_tokens: 3,
                            cache_creation_input_tokens: 0,
                            cache_read_input_tokens: 130,
                            output_tokens: 1,
                        },
                    },
                }),
                stream({
                    type: 'content_block_delta',
                    delta: { type: 'text_delta', text: 'Cut again.' },
                }),
            ],
            launches,
        ),
    );
    const run = new AbortController(),
        events = [],
        threads = [];
    let text = '';
    await claude.generate(
        { model: 'sonnet', nativeTools: ['web_search'] },
        'Halve?',
        (e) => {
            events.push(e);
            if (e.type === 'delta') text += e.text;
            if (e.type === 'response' && text.includes('[[end]]')) run.abort(ENDED);
        },
        (thread, model) => threads.push([thread, model]),
        run.signal,
    );
    assert.ok(launches[0].child.killed);
    assert.equal(text, 'Cut.\n[[end]]');
    assert.deepEqual(
        events.filter((e) => e.type === 'status').map((e) => e.status),
        ['completed'],
    );
    assert.deepEqual(events.find((e) => e.type === 'usage').usage, {
        input: 18,
        output: 21,
        cacheRead: 230,
    });
    assert.deepEqual(threads, [['session-1', 'sonnet']]);
});

// A Codex app server that answers every request and plays one turn's notifications.
const codexServer = (notes, requests) => () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => child.stdout.end();
    const send = (m) => child.stdout.writable && child.stdout.write(JSON.stringify(m) + '\n');
    createInterface({ input: child.stdin }).on('line', (line) => {
        const m = JSON.parse(line);
        if (m.id == null) return;
        requests.push(m.method);
        const result =
            m.method === 'thread/start'
                ? { thread: { id: 't1' } }
                : m.method === 'turn/start'
                  ? { turn: { id: 'u1' } }
                  : {};
        send({ id: m.id, result });
        if (m.method === 'turn/start')
            for (const [method, params] of notes)
                send({ method, params: { threadId: 't1', turnId: 'u1', ...params } });
    });
    return child;
};

test('a Codex run the server ends at [[end]] interrupts its turn and completes with its usage', async () => {
    const requests = [],
        tokens = {
            inputTokens: 50,
            cachedInputTokens: 20,
            outputTokens: 7,
            reasoningOutputTokens: 2,
        };
    const codex = new Codex(
        { token: async () => 'synthetic-token' },
        mkdtempSync(join(tmpdir(), 'tt-end-codex-')),
        codexServer(
            [
                ['item/started', { item: { type: 'agentMessage', id: 'a1' } }],
                ['item/agentMessage/delta', { itemId: 'a1', delta: 'Cut.\n[[end]]' }],
                ['thread/tokenUsage/updated', { tokenUsage: { last: tokens, total: tokens } }],
                // Reasoning inside the same model response, before its tool call.
                ['item/started', { item: { type: 'reasoning', id: 'r1' } }],
                ['item/started', { item: { type: 'webSearch', id: 'w1', query: 'halving' } }],
                ['item/completed', { item: { type: 'webSearch', id: 'w1', query: 'halving' } }],
                ['item/started', { item: { type: 'reasoning', id: 'r2' } }],
                ['item/agentMessage/delta', { itemId: 'a2', delta: 'Cut again.' }],
            ],
            requests,
        ),
    );
    const run = new AbortController(),
        events = [],
        threads = [];
    let text = '';
    try {
        await codex.generate(
            { model: 'fixture-model', effort: 'low', nativeTools: ['web_search'] },
            'Halve?',
            (e) => {
                events.push(e);
                if (e.type === 'delta') text += e.text;
                if (e.type === 'response' && text.includes('[[end]]')) run.abort(ENDED);
            },
            (thread, model) => threads.push([thread, model]),
            run.signal,
        );
    } finally {
        codex.close();
    }
    assert.equal(text, 'Cut.\n[[end]]');
    assert.ok(
        events.some((e) => e.type === 'tool' && e.tool.id === 'w1'),
        "the response's tool call still runs",
    );
    assert.ok(requests.includes('turn/interrupt'));
    assert.deepEqual(
        events.filter((e) => e.type === 'status').map((e) => e.status),
        ['completed'],
    );
    assert.deepEqual(events.filter((e) => e.type === 'usage').at(-1).usage, {
        input: 30,
        output: 7,
        cacheRead: 20,
        reasoning: 2,
    });
    assert.deepEqual(threads, [['t1', 'fixture-model']]);
});
