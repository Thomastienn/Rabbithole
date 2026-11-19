import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { complete, open, until } from '../support/visual-kit.mjs';
import { readRecordTurn } from '../../server/tools/recordTurn.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI, streamToolCalls } from '../support/fake-openai.mjs';

const REPLY = 'A mutex guards shared state between threads.';
const turn = {
  next_questions: ['Why can a mutex deadlock?', '  '],
  suggestions: [{ text: 'shared state', concept: 'Shared state' }, { concept: 'No text' }],
  groundwork: ['Threads'],
  concepts: [{ name: 'Shared state', topics: ['Concurrency'] }],
  links: [{ from: 'Shared state', to: 'Mutex', kind: 'builds on' }],
  verdicts: [
    { concept: 'Mutex', level: 3, confidence: 'high' },
    { concept: 'Locks', level: 9, confidence: 'high' },
  ],
};

test('record_turn keeps valid entries and names the skipped ones', () => {
  const read = readRecordTurn(turn);
  assert.deepEqual(read.notes, {
    questions: ['Why can a mutex deadlock?'],
    suggestions: [{ text: 'shared state', concept: 'Shared state' }],
    groundwork: ['Threads'],
    concepts: [{ name: 'Shared state', topics: ['Concurrency'] }],
    links: [{ from: 'Shared state', to: 'Mutex', kind: 'builds on' }],
    readable: true,
  });
  assert.deepEqual(read.verdicts, [{ concept: 'Mutex', level: 3, confidence: 'high' }]);
  assert.match(read.result, /^recorded; skipped /);
  for (const name of ['next_questions[1]', 'suggestions[1]', 'verdicts[1]'])
    assert.ok(read.result.includes(name), name);
  assert.equal(readRecordTurn({}).result, 'recorded');
  assert.match(readRecordTurn({ links: 'x' }).result, /links \(must be a list\)/);
  assert.equal(readRecordTurn({ next_questions: ['a', 'b', 'c', 'd'] }).notes.questions.length, 3);
});

// Reads server-sent events as they arrive, so a test can wait on one mid-reply.
const watch = (response) => {
  const seen = [];
  const done = (async () => {
    let buffer = '';
    for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
      buffer += chunk;
      const frames = buffer.split('\n\n');
      buffer = frames.pop();
      for (const f of frames) if (f.startsWith('data: ')) seen.push(JSON.parse(f.slice(6)));
    }
  })();
  return { seen, done };
};

test('a record_turn call over MCP saves the turn, shows next questions at once and skips quick thinking; a reply without it falls back', async () => {
  const quick = [];
  let watched,
    result,
    record = true;
  const env = await open(
    {
      generate: async (tree, text, emit, _save, signal) => {
        // Quick thinking stands in when the reply made no record_turn call.
        if (tree.instructions?.startsWith('You mark passages')) {
          quick.push('suggestions');
          return complete(emit, '{"suggestions":[{"text":"shared state"}]}');
        }
        if (tree.instructions?.startsWith('You judge')) {
          quick.push('verdicts');
          return complete(emit, '[{"concept":"Mutex","level":1,"confidence":"low"}]');
        }
        emit({ type: 'item', item: 'answer', text: REPLY });
        if (record) {
          const mcp = await tree.mcp.open(tree, emit, signal);
          const client = new Client({ name: 'fixture', version: '1' });
          await client.connect(
            new StreamableHTTPClientTransport(new URL(mcp.url), {
              requestInit: { headers: mcp.headers },
            }),
          );
          result = (await client.callTool({ name: 'record_turn', arguments: turn })).content[0]
            .text;
          await client.close();
          mcp.close();
          // Next questions reach the learner before the reply ends.
          while (!watched.seen.some((e) => e.type === 'questions'))
            await new Promise((r) => setTimeout(r, 10));
          assert.ok(!watched.seen.some((e) => e.type === 'done'));
        }
        emit({ type: 'status', status: 'completed' });
      },
    },
    { generate: () => {} },
    { suggestions: true, verdicts: true },
  );
  try {
    const { tree, store } = env;
    watched = watch(await env.post(`/api/trees/${tree.id}/messages`, { text: 'A mutex locks?' }));
    await watched.done;
    assert.deepEqual(watched.seen.at(-1), { type: 'done', status: 'completed' });
    assert.ok(!watched.seen.some((e) => e.type === 'tool'));
    assert.match(result, /skipped .*suggestions\[1\]/);
    const saved = await env.get(`/api/trees/${tree.id}`);
    const reply = saved.messages.at(-1);
    assert.equal(reply.text, REPLY);
    assert.deepEqual(reply.questions, ['Why can a mutex deadlock?']);
    assert.ok(!reply.tools?.length);
    assert.deepEqual(saved.suggestions, [
      {
        message: reply.id,
        status: 'ready',
        passages: [{ start: 15, end: 27, text: 'shared state', concept: 'Shared state' }],
        groundwork: ['Threads'],
      },
    ]);
    const concepts = () => Object.fromEntries(store.graph().concepts.map((c) => [c.name, c]));
    assert.deepEqual(concepts()['Shared state'].topics, ['Concurrency']);
    assert.ok(concepts().Threads);
    assert.deepEqual(concepts().Mutex.observations, [0, 0, 0, 1, 0, 0]);
    assert.ok(!concepts().Locks);
    assert.ok(store.graph().links.some((l) => l.kind === 'builds on'));
    assert.deepEqual(quick, []);

    record = false;
    watched = watch(await env.post(`/api/trees/${tree.id}/messages`, { text: 'And again?' }));
    await watched.done;
    await until(() => quick.length === 2);
    assert.deepEqual(quick.sort(), ['suggestions', 'verdicts']);
  } finally {
    await env.close();
  }
});

test('a custom endpoint makes no further request after a round of only record_turn', async (t) => {
  const fake = await fakeOpenAI(t);
  fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
  const dir = mkdtempSync(join(tmpdir(), 'tt-record-turn-')),
    store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({
    store,
    dir,
    endpoint: new OpenAI(dir),
    providers: {},
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: false }) },
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
        apiKey: 'sk-test',
      })
    ).json()
  ).at(-1).id;
  let requests = 0;
  fake.reply = (req, res) => {
    requests++;
    streamToolCalls(res, [{ name: 'record_turn', input: turn }], REPLY);
  };
  const id = store.create('Turn', endpoint, 'tooled').id;
  const events = (await (await post(`/api/trees/${id}/messages`, { text: 'Mutex?' })).text())
    .split('\n\n')
    .filter((f) => f.startsWith('data: '))
    .map((f) => JSON.parse(f.slice(6)));
  assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
  assert.equal(requests, 1);
  assert.ok(events.some((e) => e.type === 'questions'));
  const reply = store.tree(id).messages.at(-1);
  assert.equal(reply.text, REPLY);
  assert.deepEqual(reply.questions, ['Why can a mutex deadlock?']);
});
