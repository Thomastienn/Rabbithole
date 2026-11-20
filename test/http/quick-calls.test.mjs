import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { NAME_CONVERSATION, quickTool } from '../../server/tools/quickTools.mjs';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';

const read = (input) => {
    if (!input.title) throw new Error('title must be a short plain title.');
    return input.title;
};
const plain = (text) => `plain:${text}`;

test('a quick tool answers natively, through <tool_call> text, or through the plain text fallback', () => {
    const native = quickTool(NAME_CONVERSATION, read, true, 'mcp');
    assert.deepEqual(native.request.tools, [NAME_CONVERSATION]);
    assert.equal(native.request.mcp, 'mcp');
    assert.throws(() => native.request.runTool('name_conversation', {}), /title must be/);
    assert.equal(native.request.runTool('name_conversation', { title: 'Heaps' }), 'Recorded.');
    assert.equal(native.answer('Done.', plain), 'Heaps');

    const text = quickTool(NAME_CONVERSATION, read, false);
    assert.deepEqual(text.request, {});
    assert.match(text.instructions, /<tool_call>/);
    assert.match(text.instructions, /"name":"name_conversation"/);
    // A rejected call is skipped; the next valid one answers.
    assert.equal(
        text.answer(
            '<tool_call>{"name":"name_conversation","arguments":{}}</tool_call>' +
                '<tool_call>{"name":"name_conversation","arguments":"{\\"title\\":\\"Tries\\"}"}</tool_call>',
            plain,
        ),
        'Tries',
    );
    // Without a call the text, minus any call markup, goes to the old reader.
    assert.equal(quickTool(NAME_CONVERSATION, read, false).answer(' Heaps ', plain), 'plain:Heaps');
});

test('title, verdicts and suggestions arrive through native tool calls; a bad call gets a plain error', async (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-quick-')), 'trees.sqlite'));
    const errors = {};
    const calls = {
        name_conversation: [{}, { title: '**Heaps**.', concept: 'Binary heap' }],
        record_verdicts: [
            { verdicts: 'none' },
            {
                verdicts: [
                    { concept: 'Heap', level: 3, confidence: 'high' },
                    { concept: 'bad', level: 9, confidence: 'high' },
                ],
            },
        ],
        mark_suggestions: [
            {},
            {
                suggestions: [{ text: 'parent', concept: 'Heap order' }],
                concepts: [{ name: 'Heap order', topics: ['Data structures'] }],
            },
        ],
    };
    const quick = {
        models: async () => [{ model: 'quick-model', efforts: ['low'] }],
        generate: async (tree, text, emit) => {
            assert.equal(tree.tools.length, 1);
            assert.doesNotMatch(tree.instructions, /<tool_call>/);
            const name = tree.tools[0].name;
            for (const input of calls[name])
                try {
                    await tree.runTool(name, input);
                } catch (error) {
                    errors[name] = error.message;
                }
            emit({ type: 'status', status: 'completed' });
        },
    };
    const chat = {
        generate: async (tree, text, emit) => {
            emit({ type: 'item', item: 'a', text: 'A heap keeps each parent above its children.' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const app = createApp({
        store,
        providers: { codex: chat, claude: quick },
        auth: { status: () => ({ connected: true }) },
        log: () => {},
        verdicts: true,
        suggestions: true,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.stop();
        store.close();
    });
    store.saveSuggestionSettings({
        enabled: true,
        model: { provider: 'claude', model: 'quick-model' },
        effort: 'low',
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (route, body) =>
        fetch(`${origin}/api/trees${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const id = (await (await post('', {})).json()).id;
    await (await post(`/${id}/messages`, { text: 'A heap keeps the smallest on top?' })).text();
    await app.settled();

    assert.deepEqual(errors, {
        name_conversation: 'title must be a short plain title.',
        record_verdicts:
            'verdicts must be a list of {concept, level 0-5, confidence "low" or "high"}; record an empty list when the message shows nothing.',
        mark_suggestions:
            'suggestions must be a list of {text, concept}; use [] when none qualify.',
    });
    const tree = await (await fetch(`${origin}/api/trees/${id}`)).json();
    assert.equal(tree.title, 'Heaps');
    assert.equal(store.list().find((c) => c.id === id).concept, 'Binary heap');
    const observed = store.db
        .prepare('SELECT COUNT(*) AS n FROM observations WHERE message=?')
        .get(tree.messages[0].id).n;
    assert.equal(observed, 1);
    assert.equal(tree.suggestions[0].status, 'ready');
    assert.deepEqual(
        tree.suggestions[0].passages.map((p) => [p.text, p.concept]),
        [['parent', 'Heap order']],
    );
});

const endpointApp = async (t, fake) => {
    const dir = mkdtempSync(join(tmpdir(), 'rabbithole-quick-endpoint-')),
        store = new Store(join(dir, 'trees.sqlite'));
    const chat = {
        generate: async (tree, text, emit) => {
            emit({ type: 'item', item: 'a', text: 'An answer.' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const app = createApp({
        store,
        dir,
        endpoint: new OpenAI(dir),
        providers: { codex: chat },
        auth: { status: () => ({ connected: true }) },
        log: () => {},
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
                apiKey: 'k',
            })
        ).json()
    ).at(-1).id;
    store.saveSuggestionSettings({
        enabled: false,
        model: { provider: endpoint, model: fake.models[0].id },
        effort: null,
    });
    const id = store.create('New conversation', 'codex', null).id;
    await (await post(`/api/trees/${id}/messages`, { text: 'What is a heap?' })).text();
    await app.settled();
    return store.tree(id).title;
};

test('a custom endpoint names the conversation through one native call, re-asked only after an error', async (t) => {
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
    const bodies = [];
    fake.reply = (req, res, body) => {
        bodies.push(body);
        streamToolCalls(res, [
            { name: 'name_conversation', input: bodies.length === 1 ? {} : { title: 'Heaps' } },
        ]);
    };
    assert.equal(await endpointApp(t, fake), 'Heaps');
    assert.equal(bodies.length, 2);
    assert.deepEqual(
        bodies[0].tools.map((tool) => tool.function.name),
        ['name_conversation'],
    );
    assert.match(bodies[1].messages.at(-1).content, /^Error: title must be/);
});

test('a custom endpoint without tool support names the conversation through <tool_call> text', async (t) => {
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'plain', capabilities: { tools: false } }];
    const bodies = [];
    fake.reply = (req, res, body) => {
        bodies.push(body);
        streamReply(res, [
            '<tool_call>{"name": "name_conversation", "arguments": {"title": "Heaps"}}</tool_call>',
        ]);
    };
    assert.equal(await endpointApp(t, fake), 'Heaps');
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].tools, undefined);
    assert.match(bodies[0].messages[0].content, /<tool_call>/);
});
