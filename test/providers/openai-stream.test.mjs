import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';
import { open } from '../support/openai-kit.mjs';

test('custom endpoint saves locally, lists models and streams each turn with saved history and fixed branch context', async (t) => {
  const fake = await fakeOpenAI(t),
    env = await open(t);
  const { get, post, store, dir } = env,
    apiKey = 'fixture-custom-endpoint-secret';
  assert.deepEqual(await (await get('/api/settings/endpoint')).json(), {
    configured: false,
    baseUrl: null,
  });
  const unconfigured = await get('/api/models');
  assert.equal(unconfigured.status, 502);
  // Provider names come from the server even when nothing connects, so the client keeps no label list.
  assert.deepEqual((await unconfigured.json()).providers, {
    claude: { label: 'Claude', connected: false },
    codex: { label: 'Codex', connected: false },
    openai: { label: 'Custom endpoint', connected: false },
  });
  assert.equal(
    (await post('/api/settings/endpoint', { baseUrl: fake.baseUrl + '/', apiKey })).status,
    200,
  );
  assert.equal(fake.calls.length, 0, 'save does not contact the endpoint');
  const path = join(dir, 'openai-endpoints.json');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(path))[0].apiKey, apiKey);
  const catalogue = await (await get('/api/models')).json();
  assert.deepEqual(catalogue.models, [
    {
      provider: 'openai',
      model: 'local-tutor',
      label: 'local-tutor',
      isDefault: true,
      efforts: [],
      readsImages: false,
    },
    {
      provider: 'openai',
      model: 'second-model',
      label: 'second-model',
      isDefault: false,
      efforts: [],
      readsImages: false,
    },
  ]);
  assert.equal(catalogue.defaultProvider, 'claude');
  assert.deepEqual(
    Object.entries(catalogue.providers).map(([id, p]) => [id, p.label, p.connected]),
    [
      ['claude', 'Claude', false],
      ['codex', 'Codex', false],
      ['openai', 'Custom endpoint', true],
    ],
  );
  assert.equal((await post('/api/settings/endpoint/test')).status, 200);
  const root = store.create('Parent', 'openai');
  const source = store.message(root.id, 'assistant', 'Peterson passage', 'completed');
  const child = store.branch(
    root,
    { messageId: source, start: 0, end: 8, text: 'Peterson', question: 'How?' },
    'Frozen ancestor fact',
  );
  for (const text of ['How?', 'Explain flags']) {
    const response = await post(`/api/trees/${child.id}/messages`, { text });
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    const events = (await response.text())
      .trim()
      .split('\n\n')
      .map((frame) => JSON.parse(frame.slice(6)));
    assert.deepEqual(
      events.filter((e) => e.type === 'text').map((e) => e.text),
      ['Peterson ', 'Peterson uses two flags.'],
    );
    assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
  }
  const calls = fake.calls.filter((c) => c.body);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.headers.authorization, `Bearer ${apiKey}`);
    assert.equal(call.body.model, 'local-tutor');
    assert.equal(call.body.stream, true);
    assert.match(call.body.messages[0].content, /Frozen ancestor fact/);
    assert.match(call.body.messages[0].content, /Peterson/);
    assert.equal(call.body.messages[0].role, 'system');
  }
  assert.deepEqual(calls[1].body.messages.slice(1), [
    { role: 'user', content: 'How?' },
    { role: 'assistant', content: 'Peterson uses two flags.' },
    { role: 'user', content: 'Explain flags' },
  ]);
  assert.equal(store.tree(child.id).thread, null, 'stateless API stores no remote session');
  assert.equal(store.tree(child.id).model, 'local-tutor');
});

test('Stop cancels the upstream socket, saves partial output and allows another turn without replaying partial replies', async (t) => {
  const fake = await fakeOpenAI(t),
    { post, store, endpoint } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'abort-fixture-secret' });
  const tree = store.create('Stop', 'openai');
  store.model(tree.id, 'local-tutor');
  const closed = Promise.withResolvers();
  fake.reply = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.on('close', closed.resolve);
    res.write('data: {"choices":[{"index":0,"delta":{"content":"Partial answer"}}]}\n\n');
  };
  const response = await post(`/api/trees/${tree.id}/messages`, { text: 'Hold' });
  const reader = response.body.getReader();
  let body = '';
  while (!body.includes('Partial answer'))
    body += new TextDecoder().decode((await reader.read()).value);
  assert.equal(
    store.tree(tree.id).messages.at(-1).status,
    'streaming',
    'a real delta arrives before upstream finishes',
  );
  assert.equal((await post(`/api/trees/${tree.id}/stop`)).status, 200);
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    body += new TextDecoder().decode(part.value);
  }
  assert.match(body, /"status":"interrupted"/);
  await Promise.race([
    closed.promise,
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Upstream socket did not close after Stop')),
        1500,
      );
      timer.unref();
    }),
  ]);
  assert.equal(store.tree(tree.id).messages.at(-1).text, 'Partial answer');
  fake.reply = (req, res) => streamReply(res, ['A complete retry.']);
  assert.match(
    await (await post(`/api/trees/${tree.id}/messages`, { text: 'Retry' })).text(),
    /"status":"completed"/,
  );
  assert.deepEqual(fake.calls.at(-1).body.messages.slice(1), [
    { role: 'user', content: 'Hold' },
    { role: 'user', content: 'Retry' },
  ]);
  const before = fake.calls.length,
    events = [],
    controller = new AbortController();
  controller.abort();
  await endpoint.generate(
    {},
    'Never sent',
    (e) => events.push(e),
    () => assert.fail('Aborted turn saved a session'),
    controller.signal,
  );
  assert.deepEqual(events, [{ type: 'status', status: 'interrupted' }]);
  assert.equal(fake.calls.length, before);
});

test('upstream HTTP, malformed streams, truncation and filtering fail honestly and leave the conversation usable', async (t) => {
  const fake = await fakeOpenAI(t),
    { post, store } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'error-fixture-secret' });
  const tree = store.create('Errors', 'openai');
  store.model(tree.id, 'local-tutor');
  for (const [status, reason] of [
    [401, /API key/],
    [403, /API key/],
    [404, /not found/],
    [429, /usage limit/],
    [503, /unavailable/],
    [400, /rejected the request/],
  ]) {
    fake.reply = (req, res) => {
      res.writeHead(status);
      res.end('private upstream error-fixture-secret');
    };
    const response = await (
      await post(`/api/trees/${tree.id}/messages`, { text: `HTTP ${status}` })
    ).text();
    assert.match(response, reason);
    assert.match(response, /"status":"failed"/);
    assert.doesNotMatch(response, /private upstream|error-fixture-secret/);
  }
  for (const [reply, reason] of [
    [(req, res) => streamReply(res, ['Partial reply'], 'length'), /reply limit/],
    [(req, res) => streamReply(res, ['Partial reply'], 'content_filter'), /filtered/],
    [(req, res) => streamReply(res, ['Partial reply'], 'tool_calls'), /unsupported/],
    [
      (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: {"error":{"message":"error-fixture-secret"}}\n\n');
      },
      /stream error/,
    ],
    [
      (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: invalid error-fixture-secret\n\n');
      },
      /stream failed/,
    ],
    [
      (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: [DONE]\n\n');
      },
      /before completing/,
    ],
    [
      (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: {"choices":[{"index":0,"delta":{"content":"Partial reply"}}]}\n\n');
      },
      /without a complete/,
    ],
    [
      (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"private":"error-fixture-secret"}');
      },
      /did not return/,
    ],
    [(req, res) => streamReply(res, []), /without a complete/],
  ]) {
    fake.reply = reply;
    const response = await (
      await post(`/api/trees/${tree.id}/messages`, { text: 'Try this response' })
    ).text();
    assert.match(response, reason);
    assert.match(response, /"status":"failed"/);
    assert.doesNotMatch(response, /error-fixture-secret/);
  }
  fake.reply = (req, res) => res.destroy();
  assert.match(
    await (await post(`/api/trees/${tree.id}/messages`, { text: 'Disconnected' })).text(),
    /"status":"failed"/,
  );
  fake.reply = (req, res) => streamReply(res, ['Recovered.']);
  assert.match(
    await (await post(`/api/trees/${tree.id}/messages`, { text: 'Recovery' })).text(),
    /"status":"completed"/,
  );
  assert.equal(store.tree(tree.id).provider, 'openai');
  assert.ok(
    fake.calls
      .at(-1)
      .body.messages.filter((m) => m.role === 'assistant')
      .every((m) => m.content === 'Recovered.'),
    'failed assistant fragments never enter later prompts',
  );
});

test('SSE decoding handles fragmented UTF-8, CRLF and multiline data without leaking other choices or metadata', async (t) => {
  const fake = await fakeOpenAI(t),
    { post, store } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'framing-fixture-secret' });
  const tree = store.create('Framing', 'openai');
  store.model(tree.id, 'local-tutor');
  fake.reply = async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const bytes = Buffer.from(
      'event: message\r\n: comment\r\ndata: {"id":"framing-fixture-secret","choices":\r\ndata: [{"index":1,"delta":{"content":"MUST NOT APPEAR"}},{"index":0,"delta":{"content":"🌲 café"}}]}\r\n\r\ndata: {"choices":[]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    );
    for (const byte of bytes) {
      if (res.destroyed) return;
      res.write(Buffer.from([byte]));
      await new Promise((resolve) => setImmediate(resolve));
    }
    res.end();
  };
  const body = await (await post(`/api/trees/${tree.id}/messages`, { text: 'Unicode' })).text();
  assert.match(body, /🌲 café/);
  assert.match(body, /"status":"completed"/);
  assert.doesNotMatch(body, /MUST NOT APPEAR|framing-fixture-secret|�/);
  assert.equal(store.tree(tree.id).messages.at(-1).text, '🌲 café');
});
