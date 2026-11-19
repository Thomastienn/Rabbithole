import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { source, complete, deferred, open } from '../support/visual-kit.mjs';
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
            (await mcp.client.callTool({ name: 'show_visual', arguments: args })).content[0].text;
          results.push(await ask({ ...call, alt: undefined }));
          results.push(await ask({ ...call, title: 'x'.repeat(200) }));
          results.push(await ask(call));
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
    assert.equal(results[2], 'queued');
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
