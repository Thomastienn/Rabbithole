import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { source, complete, deferred, open, until } from '../support/visual-kit.mjs';
import { TUTOR_TOOLS } from '../../server/tools/runner.mjs';

const INTRO = 'Binary search halves the list.';
const call = {
    title: 'Predict the half',
    shows: 'Seven sorted numbers with the midpoint 8 marked',
    alt: 'Search for 12 in 2 to 14; the midpoint is 8. Which half remains?',
    check_answer: 'The right half remains, because 12 is greater than 8.',
};

// The tutor calls show_visual over the per-turn MCP server, the way Claude and Codex do.
async function mcpClient(tree, emit, signal) {
    const turn = await tree.mcp.open(tree, emit, signal);
    const client = new Client({ name: 'fixture', version: '1' });
    await client.connect(
        new StreamableHTTPClientTransport(new URL(turn.url), {
            requestInit: { headers: turn.headers },
        }),
    );
    return { client, close: async () => (await client.close(), turn.close()) };
}

test('show_visual mid-reply lands at its position, starts at once and keeps its check answer hidden', async () => {
    const started = deferred(),
        results = [],
        workers = [];
    let offered;
    const env = await open(
        {
            generate: async (tree, text, emit, _save, signal) => {
                offered = tree.tools.map((t) => t.name);
                emit({ type: 'item', item: 'first', text: INTRO });
                const mcp = await mcpClient(tree, emit, signal);
                try {
                    const ask = async (args) =>
                        (await mcp.client.callTool({ name: 'show_visual', arguments: args }))
                            .content[0].text;
                    results.push(await ask({ ...call, alt: undefined }));
                    results.push(await ask({ ...call, title: 'x'.repeat(200) }));
                    results.push(await ask(call));
                    results.push(await ask({ ...call, name: 'predict-half' }));
                } finally {
                    await mcp.close();
                }
                // The writer runs before the reply goes on.
                await Promise.race([
                    started.promise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('writer not started')), 5000),
                    ),
                ]);
                complete(emit, 'Think about it, then reveal.');
            },
        },
        {
            generate: async (tree, text, emit) => {
                workers.push(JSON.parse(text));
                started.resolve();
                complete(emit, source);
            },
        },
    );
    try {
        const response = await env.post(`/api/trees/${env.tree.id}/messages`, {
            text: 'Check me on binary search.',
        });
        const events = (await response.text())
            .split('\n\n')
            .filter((f) => f.startsWith('data: '))
            .map((f) => JSON.parse(f.slice(6)));
        assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
        assert.ok(offered.includes('show_visual'));
        assert.ok(!Object.hasOwn(TUTOR_TOOLS, 'show_visual'));
        // Plain errors name the argument; the corrected call is queued.
        assert.match(results[0], /show_visual needs alt/);
        assert.match(results[1], /title is 200 characters/);
        assert.match(results[2], /show_visual needs name/);
        assert.match(results[3], /^queued/);
        // Never tool activity, live or stored.
        assert.ok(!events.some((e) => e.type === 'tool'));

        const saved = await env.get(`/api/trees/${env.tree.id}`);
        const reply = saved.messages.at(-1);
        assert.equal(reply.text, INTRO + '\n\nThink about it, then reveal.');
        assert.ok(!reply.tools?.length);
        const [visual] = saved.artifacts;
        assert.equal(saved.artifacts.length, 1);
        assert.equal(visual.kind, 'visual');
        assert.equal(visual.position, INTRO.length);
        assert.equal(visual.title, call.title);
        assert.equal(visual.description, call.alt);
        // The writer gets the check answer and the reply so far; the learner-facing text does not.
        assert.equal(workers.length, 1);
        assert.deepEqual(workers[0].request, { ...call, context: INTRO });
        assert.doesNotMatch(reply.text + visual.title + visual.description, /right half|greater/);
    } finally {
        await env.close();
    }
});

test('a visual shows at its call until its marker streams in, and one reply never repeats a title', async () => {
    const results = [],
        logs = [],
        halves = { title: 'The halves', shows: 'A list cut at 8', alt: 'The list splits at 8.' };
    let replies = 0;
    const env = await open(
        {
            generate: async (tree, text, emit, _save, signal) => {
                replies++;
                emit({ type: 'item', item: 'first', text: INTRO });
                const mcp = await mcpClient(tree, emit, signal);
                try {
                    const ask = async (args) =>
                        (await mcp.client.callTool({ name: 'show_visual', arguments: args }))
                            .content[0].text;
                    results.push(await ask({ ...halves, name: 'halves' }));
                    // Same title in the same reply, in another case and spacing: drawn once only.
                    if (replies === 1)
                        results.push(
                            await ask({ ...halves, title: ' the  HALVES ', name: 'again' }),
                        );
                } finally {
                    await mcp.close();
                }
                complete(emit, 'Then.\n\n[[visual: halves]]\n\nThe right half remains.');
            },
        },
        { generate: async (tree, text, emit) => complete(emit, source) },
        { log: (line) => logs.push(line) },
    );
    try {
        const ask = async () =>
            events(await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show me.' }));
        const streamed = await ask();
        assert.deepEqual(streamed.at(-1), { type: 'done', status: 'completed' });
        const first = env.store.tree(env.tree.id);
        const reply = first.messages.at(-1);
        assert.equal(reply.text, `${INTRO}\n\nThen.\n\n\n\nThe right half remains.`);
        assert.equal(first.artifacts.length, 1);
        const [visual] = first.artifacts;
        // At the call first, then at its marker.
        const marker = `${INTRO}\n\nThen.\n\n`.length;
        const moves = streamed
            .filter((e) => e.type === 'artifact' && e.artifact.id === visual.id)
            .map((e) => e.artifact.position);
        assert.equal(moves[0], INTRO.length);
        assert.equal(moves.at(-1), marker);
        assert.equal(visual.position, marker);
        assert.equal(visual.side, null);
        for (const e of streamed.filter((e) => e.type === 'text'))
            assert.doesNotMatch(e.text, /\[|visual:/);
        assert.match(results[0], /^queued/);
        assert.equal(results[1], 'already shown; continue your reply without repeating it.');
        assert.ok(
            logs.some((l) =>
                new RegExp(`app tool call refused id="${reply.id}" tool="show_visual"`).test(l),
            ),
        );
        // A later reply may show a visual with the same title.
        await ask();
        assert.match(results[2], /^queued/);
        assert.equal(env.store.tree(env.tree.id).artifacts.length, 2);
    } finally {
        await env.close();
    }
});

const events = async (response) =>
    (await response.text())
        .split('\n\n')
        .filter((f) => f.startsWith('data: '))
        .map((f) => JSON.parse(f.slice(6)));
const written = (args) =>
    `<tool_call>${JSON.stringify({ name: 'show_visual', arguments: args })}</tool_call>`;
// Streams text in small deltas so a call arrives across chunks.
const stream = (emit, text) => {
    for (let i = 0; i < text.length; i += 7)
        emit({ type: 'delta', item: 'answer', text: text.slice(i, i + 7) });
    emit({ type: 'status', status: 'completed' });
};

test('a model without tool calling writes show_visual as <tool_call> text and gets the visual', async () => {
    const { check_answer, ...args } = call;
    const workers = [];
    let offered;
    const writer = (tree, text, emit) => {
        workers.push(JSON.parse(text));
        complete(emit, source);
    };
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.instructions?.startsWith('You create one self-contained visual'))
                    return writer(tree, text, emit);
                offered = { tools: tree.tools, text: tree.textTools?.map((t) => t.name) };
                stream(
                    emit,
                    `${INTRO}\n${written({ ...args, name: 'half' })}\nThe right side holds 12.`,
                );
            },
        },
        { generate: writer },
    );
    try {
        const tree = env.store.create('Endpoint', 'openai', 'smart', 'high');
        const response = await env.post(`/api/trees/${tree.id}/messages`, { text: 'Show me.' });
        const streamed = await events(response);
        assert.deepEqual(streamed.at(-1), { type: 'done', status: 'completed' });
        assert.deepEqual(offered, {
            tools: undefined,
            text: ['show_visual', 'make_video', 'start_discussion'],
        });
        for (const e of streamed.filter((e) => e.type === 'text'))
            assert.doesNotMatch(e.text, /tool_call|[{}]/);
        const saved = await env.get(`/api/trees/${tree.id}`);
        assert.equal(saved.messages.at(-1).text, `${INTRO}\n\nThe right side holds 12.`);
        assert.equal(saved.artifacts.length, 1);
        assert.equal(saved.artifacts[0].position, INTRO.length + 1);
        assert.equal(saved.artifacts[0].description, args.alt);
        await until(() => workers.length === 1);
        assert.deepEqual(workers[0].request, { ...args, context: INTRO });
    } finally {
        await env.close();
    }
});

test('a native call leaked into reply text runs once and is hidden', async () => {
    const drawn = [];
    const env = await open(
        {
            generate: async (tree, text, emit) =>
                stream(emit, `${INTRO}${written({ ...call, name: 'half' })}Then.`),
        },
        {
            generate: async (tree, text, emit) => {
                drawn.push(JSON.parse(text).request.title);
                complete(emit, source);
            },
        },
    );
    try {
        const response = await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Go on.' });
        assert.deepEqual((await events(response)).at(-1), { type: 'done', status: 'completed' });
        const saved = await env.get(`/api/trees/${env.tree.id}`);
        assert.equal(saved.messages.at(-1).text, INTRO + 'Then.');
        assert.equal(saved.artifacts.length, 1);
        assert.equal(saved.artifacts[0].position, INTRO.length);
        await until(() => drawn.length === 1);
        assert.deepEqual(drawn, [call.title]);
    } finally {
        await env.close();
    }
});
