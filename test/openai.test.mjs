import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, existsSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAI } from '../server/openai.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { fakeOpenAI, streamReply } from './fake-openai.mjs';

async function open(t, providers = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-openai-')), store = new Store(join(dir, 'trees.sqlite'));
  const endpoint = new OpenAI(dir);
  const app = createApp({ store, dir, endpoint, providers, defaultProvider: 'claude', auth: { status: () => ({ connected: false }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await app.stop(); store.close(); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = path => fetch(origin + path);
  const { csrf } = await (await get('/api/state')).json();
  const post = (path, body = {}, headers = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf, ...headers }, body: JSON.stringify(body) });
  return { dir, store, endpoint, app, origin, get, post };
}

test('custom endpoint saves locally, lists models and streams each turn with saved history and fixed branch context', async t => {
  const fake = await fakeOpenAI(t), env = await open(t);
  const { get, post, store, dir } = env, apiKey = 'fixture-custom-endpoint-secret';
  assert.deepEqual(await (await get('/api/settings/endpoint')).json(), { configured: false, baseUrl: null });
  assert.equal((await get('/api/models')).status, 502);
  assert.equal((await post('/api/settings/endpoint', { baseUrl: fake.baseUrl + '/', apiKey })).status, 200);
  assert.equal(fake.calls.length, 0, 'save does not contact the endpoint');
  const path = join(dir, 'openai-endpoint.json');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(path)).apiKey, apiKey);
  const catalogue = await (await get('/api/models')).json();
  assert.deepEqual(catalogue.models, [
    { provider: 'openai', model: 'local-tutor', label: 'local-tutor', isDefault: true, efforts: [] },
    { provider: 'openai', model: 'second-model', label: 'second-model', isDefault: false, efforts: [] },
  ]);
  assert.equal(catalogue.defaultProvider, 'claude');
  assert.equal((await post('/api/settings/endpoint/test')).status, 200);
  const root = store.create('Parent', 'openai');
  const source = store.message(root.id, 'assistant', 'Peterson passage', 'completed');
  const child = store.branch(root, { messageId: source, start: 0, end: 8, text: 'Peterson', question: 'How?' }, 'Frozen ancestor fact');
  for (const text of ['How?', 'Explain flags']) {
    const response = await post(`/api/trees/${child.id}/messages`, { text });
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    const events = (await response.text()).trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
    assert.deepEqual(events.filter(e => e.type === 'text').map(e => e.text), ['Peterson ', 'Peterson uses two flags.']);
    assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
  }
  const calls = fake.calls.filter(c => c.body);
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

test('Stop cancels the upstream socket, saves partial output and allows another turn without replaying partial replies', async t => {
  const fake = await fakeOpenAI(t), { post, store, endpoint } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'abort-fixture-secret' });
  const tree = store.create('Stop', 'openai'); store.model(tree.id, 'local-tutor');
  const closed = Promise.withResolvers();
  fake.reply = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.on('close', closed.resolve);
    res.write('data: {"choices":[{"index":0,"delta":{"content":"Partial answer"}}]}\n\n');
  };
  const response = await post(`/api/trees/${tree.id}/messages`, { text: 'Hold' });
  const reader = response.body.getReader();
  let body = '';
  while (!body.includes('Partial answer')) body += new TextDecoder().decode((await reader.read()).value);
  assert.equal(store.tree(tree.id).messages.at(-1).status, 'streaming', 'a real delta arrives before upstream finishes');
  assert.equal((await post(`/api/trees/${tree.id}/stop`)).status, 200);
  for (;;) { const part = await reader.read(); if (part.done) break; body += new TextDecoder().decode(part.value); }
  assert.match(body, /"status":"interrupted"/);
  await Promise.race([closed.promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Upstream socket did not close after Stop')), 1500); timer.unref(); })]);
  assert.equal(store.tree(tree.id).messages.at(-1).text, 'Partial answer');
  fake.reply = (req, res) => streamReply(res, ['A complete retry.']);
  assert.match(await (await post(`/api/trees/${tree.id}/messages`, { text: 'Retry' })).text(), /"status":"completed"/);
  assert.deepEqual(fake.calls.at(-1).body.messages.slice(1), [{ role: 'user', content: 'Hold' }, { role: 'user', content: 'Retry' }]);
  const before = fake.calls.length, events = [], controller = new AbortController(); controller.abort();
  await endpoint.generate({}, 'Never sent', e => events.push(e), () => assert.fail('Aborted turn saved a session'), controller.signal);
  assert.deepEqual(events, [{ type: 'status', status: 'interrupted' }]);
  assert.equal(fake.calls.length, before);
});

test('upstream HTTP, malformed streams, truncation and filtering fail honestly and leave the conversation usable', async t => {
  const fake = await fakeOpenAI(t), { post, store } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'error-fixture-secret' });
  const tree = store.create('Errors', 'openai'); store.model(tree.id, 'local-tutor');
  for (const [status, reason] of [[401, /API key/], [403, /API key/], [404, /not found/], [429, /usage limit/], [503, /unavailable/], [400, /rejected the request/]]) {
    fake.reply = (req, res) => { res.writeHead(status); res.end('private upstream error-fixture-secret'); };
    const response = await (await post(`/api/trees/${tree.id}/messages`, { text: `HTTP ${status}` })).text();
    assert.match(response, reason); assert.match(response, /"status":"failed"/);
    assert.doesNotMatch(response, /private upstream|error-fixture-secret/);
  }
  for (const [reply, reason] of [
    [(req, res) => streamReply(res, ['Partial reply'], 'length'), /reply limit/],
    [(req, res) => streamReply(res, ['Partial reply'], 'content_filter'), /filtered/],
    [(req, res) => streamReply(res, ['Partial reply'], 'tool_calls'), /unsupported/],
    [(req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: {"error":{"message":"error-fixture-secret"}}\n\n'); }, /stream error/],
    [(req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: invalid error-fixture-secret\n\n'); }, /stream failed/],
    [(req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: [DONE]\n\n'); }, /before completing/],
    [(req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: {"choices":[{"index":0,"delta":{"content":"Partial reply"}}]}\n\n'); }, /without a complete/],
    [(req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"private":"error-fixture-secret"}'); }, /did not return/],
    [(req, res) => streamReply(res, []), /without a complete/],
  ]) {
    fake.reply = reply;
    const response = await (await post(`/api/trees/${tree.id}/messages`, { text: 'Try this response' })).text();
    assert.match(response, reason); assert.match(response, /"status":"failed"/); assert.doesNotMatch(response, /error-fixture-secret/);
  }
  fake.reply = (req, res) => res.destroy();
  assert.match(await (await post(`/api/trees/${tree.id}/messages`, { text: 'Disconnected' })).text(), /"status":"failed"/);
  fake.reply = (req, res) => streamReply(res, ['Recovered.']);
  assert.match(await (await post(`/api/trees/${tree.id}/messages`, { text: 'Recovery' })).text(), /"status":"completed"/);
  assert.equal(store.tree(tree.id).provider, 'openai');
  assert.ok(fake.calls.at(-1).body.messages.filter(m => m.role === 'assistant').every(m => m.content === 'Recovered.'), 'failed assistant fragments never enter later prompts');
});

test('SSE decoding handles fragmented UTF-8, CRLF and multiline data without leaking other choices or metadata', async t => {
  const fake = await fakeOpenAI(t), { post, store } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'framing-fixture-secret' });
  const tree = store.create('Framing', 'openai'); store.model(tree.id, 'local-tutor');
  fake.reply = async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const bytes = Buffer.from('event: message\r\n: comment\r\ndata: {"id":"framing-fixture-secret","choices":\r\ndata: [{"index":1,"delta":{"content":"MUST NOT APPEAR"}},{"index":0,"delta":{"content":"🌲 café"}}]}\r\n\r\ndata: {"choices":[]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    for (const byte of bytes) { if (res.destroyed) return; res.write(Buffer.from([byte])); await new Promise(resolve => setImmediate(resolve)); }
    res.end();
  };
  const body = await (await post(`/api/trees/${tree.id}/messages`, { text: 'Unicode' })).text();
  assert.match(body, /🌲 café/); assert.match(body, /"status":"completed"/);
  assert.doesNotMatch(body, /MUST NOT APPEAR|framing-fixture-secret|�/);
  assert.equal(store.tree(tree.id).messages.at(-1).text, '🌲 café');
});

test('settings enforce CSRF, loopback and URL boundaries; clear unregisters without fallback and restores from an owner-only file', async t => {
  const fake = await fakeOpenAI(t);
  let nativeCalls = 0;
  const claude = { models: async () => [{ model: 'sonnet', label: 'Sonnet' }], generate: async () => { nativeCalls++; } };
  const { get, post, store, dir, endpoint, origin } = await open(t, { claude });
  const saved = { baseUrl: fake.baseUrl, apiKey: 'settings-fixture-secret' };
  for (const path of ['/api/settings/endpoint', '/api/settings/endpoint/test', '/api/settings/endpoint/clear']) {
    for (const headers of [{ 'X-TreeTutor-CSRF': '' }, { 'Content-Type': 'text/plain' }, { Origin: 'https://attacker.test' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await post(path, saved, headers)).status, 403, JSON.stringify({ path, headers }));
    // Node fetch rewrites Host; use raw HTTP to exercise rebinding protection.
    const rebound = await new Promise(resolve => { const req = http.request(origin + path, { method: 'POST', headers: { Host: 'attacker.test' } }, res => { res.resume(); resolve(res.statusCode); }); req.end('{}'); });
    assert.equal(rebound, 403);
  }
  for (const body of [null, {}, { ...saved, baseUrl: 'file:///tmp/foo' }, { ...saved, baseUrl: 'http://user:pass@localhost/v1' }, { ...saved, baseUrl: fake.baseUrl + '?key=secret' }, { ...saved, baseUrl: fake.baseUrl + '#secret' }, { ...saved, baseUrl: fake.baseUrl + '?' }, { ...saved, baseUrl: fake.baseUrl + '#' }, { ...saved, baseUrl: fake.baseUrl + '/' + saved.apiKey }, { ...saved, apiKey: '' }, { ...saved, apiKey: 'invalid\nkey' }]) assert.equal((await post('/api/settings/endpoint', body)).status, 400);
  assert.equal(fake.calls.length, 0, 'rejected settings never contact a host');
  assert.equal((await post('/api/settings/endpoint/test')).status, 502);
  assert.equal((await post('/api/settings/endpoint', saved)).status, 200);
  const path = join(dir, 'openai-endpoint.json');
  chmodSync(path, 0o644);
  assert.deepEqual(new OpenAI(dir).status(), { configured: true, baseUrl: fake.baseUrl });
  assert.equal(statSync(path).mode & 0o777, 0o600, 'restart repairs permissive credential mode');
  const root = await (await post('/api/trees')).json();
  assert.equal(root.provider, 'claude', 'saving an endpoint leaves default unchanged');
  assert.equal((await post(`/api/trees/${root.id}/model`, { provider: 'openai', model: 'local-tutor' })).status, 200);
  await (await post(`/api/trees/${root.id}/messages`, { text: 'First' })).text();
  assert.deepEqual(await (await post('/api/settings/endpoint/clear')).json(), { configured: false, baseUrl: null });
  assert.equal(existsSync(path), false);
  assert.deepEqual(new OpenAI(dir).status(), { configured: false, baseUrl: null });
  const body = await (await post(`/api/trees/${root.id}/messages`, { text: 'After clear' })).text();
  assert.match(body, /Selected provider is unavailable/); assert.match(body, /"status":"failed"/);
  assert.equal(nativeCalls, 0, 'no fallback to Claude after clearing');
  assert.equal(store.tree(root.id).provider, 'openai');
  assert.deepEqual((await (await get('/api/models')).json()).models.map(m => m.provider), ['claude']);
  assert.equal((await post('/api/settings/endpoint', saved)).status, 200);
  assert.match(await (await post(`/api/trees/${root.id}/messages`, { text: 'Reconfigured' })).text(), /"status":"completed"/);
  assert.equal((await post('/api/settings/endpoint', { ...saved, apiKey: 'replacement-fixture-secret' })).status, 200);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.doesNotMatch(readFileSync(path, 'utf8'), /settings-fixture-secret/);
  assert.equal((await post('/api/settings/endpoint/clear')).status, 200);
  writeFileSync(path, '{invalid', { mode: 0o600 });
  assert.equal(new OpenAI(dir).status().configured, false);
  await post('/api/settings/endpoint/clear');
  const target = join(dir, 'unrelated'); writeFileSync(target, JSON.stringify(saved));
  symlinkSync(target, path);
  assert.equal(new OpenAI(dir).status().configured, false, 'credential loader refuses symlinks');
  endpoint.clear();
  assert.equal(existsSync(target), true, 'clear removes the link, preserving unrelated targets');
});

for (const name of ['claude', 'codex']) test(`custom endpoint compaction and nested switching to/from ${name} preserve history through real adapters with protocol fixtures`, async t => {
  const fake = await fakeOpenAI(t), dir = mkdtempSync(join(tmpdir(), 'tt-openai-native-')), calls = [];
  const launch = (command, args, options) => {
    const call = { command, args, options, input: [] }; calls.push(call);
    const child = spawn(process.execPath, [fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url)), ...(command === 'claude' ? args : [])], options);
    const key = command === 'claude' ? 'end' : 'write', send = child.stdin[key].bind(child.stdin);
    child.stdin[key] = data => { call.input.push(command === 'claude' ? data : JSON.parse(data)); return send(data); };
    return child;
  };
  const native = name === 'claude' ? new Claude(dir, launch, (cmd, args, opts, cb) => cb(null, '{"loggedIn":true}')) : new Codex({ token: async () => 'fixture-subscription-token' }, dir, launch);
  const { post, store } = await open(t, { [name]: native });
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'switch-fixture-secret' });
  const root = store.create('Root', 'openai'); store.model(root.id, 'local-tutor');
  await (await post(`/api/trees/${root.id}/messages`, { text: 'Root fact' })).text();
  const rootBefore = store.tree(root.id), reply = rootBefore.messages.at(-1);
  fake.reply = (req, res, body) => streamReply(res, [body.messages[0].content.startsWith('Compact') ? 'Frozen compaction fact' : 'Peterson uses two flags.']);
  const child = await (await post(`/api/trees/${root.id}/branches`, { messageId: reply.id, start: 0, end: 8, text: 'Peterson', question: 'Explain Peterson' })).json();
  const compact = fake.calls.at(-1).body;
  assert.equal(compact.messages.length, 2, 'compaction is one isolated data prompt with its own instructions');
  assert.match(compact.messages[0].content, /^Compact relevant/);
  assert.match(compact.messages[1].content, /Root fact/);
  assert.equal(child.branch.snapshot, 'Frozen compaction fact'); assert.equal(child.provider, 'openai');
  assert.deepEqual(store.tree(root.id), rootBefore, 'compaction never changes source discussion or session');
  store.message(root.id, 'user', 'LATER ROOT MUST NOT ENTER CHILD', 'completed');
  await (await post(`/api/trees/${child.id}/messages`, { text: 'Custom child fact' })).text();
  const nativeModel = name === 'claude' ? 'sonnet' : 'fixture-model';
  assert.equal((await post(`/api/trees/${child.id}/model`, { provider: name, model: nativeModel })).status, 200);
  assert.match(await (await post(`/api/trees/${child.id}/messages`, { text: 'Native child fact' })).text(), /"status":"completed"/);
  const nativeInput = JSON.stringify(calls.map(({ args, input }) => ({ args, input })));
  assert.match(nativeInput, /Frozen compaction fact/); assert.match(nativeInput, /Custom child fact/);
  assert.doesNotMatch(nativeInput, /LATER ROOT MUST NOT ENTER CHILD|switch-fixture-secret/);
  for (const call of calls) assert.ok(!Object.values(call.options.env).includes('switch-fixture-secret'), 'custom key never enters native process environments');
  assert.equal((await post(`/api/trees/${child.id}/model`, { provider: 'openai', model: 'second-model' })).status, 200);
  assert.match(await (await post(`/api/trees/${child.id}/messages`, { text: 'Custom again' })).text(), /"status":"completed"/);
  const continued = fake.calls.at(-1).body;
  assert.equal(continued.model, 'second-model');
  assert.deepEqual(continued.messages.slice(1).map(m => m.content), ['Custom child fact', 'Peterson uses two flags.', 'Native child fact', 'Authoritative original', 'Custom again']);
  assert.match(continued.messages[0].content, /Frozen compaction fact/);
  assert.doesNotMatch(JSON.stringify(continued), /LATER ROOT MUST NOT ENTER CHILD/);
  assert.equal(store.tree(child.id).thread, null);
  const nested = await (await post(`/api/trees/${child.id}/branches`, { messageId: store.tree(child.id).messages.at(-1).id, start: 0, end: 8, text: 'Peterson', question: 'Nested question' })).json();
  const nestedPrompt = fake.calls.at(-1).body.messages[1].content;
  assert.match(nestedPrompt, /Frozen compaction fact/); assert.match(nestedPrompt, /Native child fact/);
  assert.equal(nested.provider, 'openai'); assert.equal(nested.model, 'second-model');
  assert.equal(store.tree(child.id).branch.snapshot, 'Frozen compaction fact');
  assert.equal(store.tree(root.id).messages.length, 3, 'child discussion never enters the root');
  // A failed custom turn restores the last working native selection/session.
  await post(`/api/trees/${child.id}/model`, { provider: name, model: nativeModel });
  await (await post(`/api/trees/${child.id}/messages`, { text: 'Native again' })).text();
  const working = store.tree(child.id);
  await post(`/api/trees/${child.id}/model`, { provider: 'openai', model: 'local-tutor' });
  fake.reply = (req, res) => { res.writeHead(401); res.end('switch-fixture-secret'); };
  assert.match(await (await post(`/api/trees/${child.id}/messages`, { text: 'Fail custom' })).text(), /"status":"failed"/);
  const after = store.tree(child.id);
  assert.deepEqual([after.provider, after.model, after.thread], [name, nativeModel, working.thread]);
});

test('catalogue validation, model-change failure and refused redirects preserve settings and send no credential to another host', async t => {
  const fake = await fakeOpenAI(t), other = await fakeOpenAI(t), { get, post, store } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'catalogue-fixture-secret' });
  const tree = store.create('Catalogue', 'openai'); store.model(tree.id, 'local-tutor');
  for (const catalogue of [{}, { data: null }, { data: [] }, { data: [{ id: 2 }, { id: '' }, { id: 'catalogue-fixture-secret' }] }]) {
    fake.catalogue = catalogue;
    assert.equal((await get('/api/models')).status, 502);
    assert.equal((await post('/api/settings/endpoint/test')).status, 502);
    assert.equal((await post(`/api/trees/${tree.id}/model`, { provider: 'openai', model: 'other' })).status, 502);
    assert.equal(store.tree(tree.id).model, 'local-tutor');
  }
  delete fake.catalogue;
  fake.models = [{ id: 'local-tutor', extra: 'ignored' }, { id: 'local-tutor' }, { id: 'second-model' }];
  assert.equal((await (await get('/api/models')).json()).models.length, 2);
  fake.modelStatus = 302; fake.modelHeaders = { Location: other.baseUrl + '/models' };
  assert.equal((await post('/api/settings/endpoint/test')).status, 502);
  fake.reply = (req, res) => { res.writeHead(307, { Location: other.baseUrl + '/chat/completions' }); res.end(); };
  assert.match(await (await post(`/api/trees/${tree.id}/messages`, { text: 'No redirect' })).text(), /"status":"failed"/);
  assert.equal(other.calls.length, 0, 'no Authorization or inference is sent to a redirected host');
  assert.deepEqual(await (await get('/api/settings/endpoint')).json(), { configured: true, baseUrl: fake.baseUrl });
});

test('clearing settings interrupts in-flight generations; timeout releases resources', async t => {
  const fake = await fakeOpenAI(t), { post, store, endpoint } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'lifecycle-fixture-secret' });
  const tree = store.create('Lifecycle', 'openai'); store.model(tree.id, 'local-tutor');
  const started = Promise.withResolvers(), closed = Promise.withResolvers();
  fake.reply = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.flushHeaders(); res.on('close', closed.resolve); started.resolve(); };
  const response = await post(`/api/trees/${tree.id}/messages`, { text: 'Clear while running' });
  await started.promise;
  await post('/api/settings/endpoint/clear');
  assert.match(await response.text(), /"status":"interrupted"/);
  await closed.promise;
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'lifecycle-fixture-secret' });
  const events = [];
  await assert.rejects(endpoint.generate({ model: 'local-tutor' }, 'Timeout', e => events.push(e), () => assert.fail('Timeout saved a session'), AbortSignal.timeout(50)), /timed out/);
  assert.deepEqual(events, [{ type: 'status', status: 'failed' }]);
});

test('a saved video retry fails cleanly when its selected endpoint has been cleared', async t => {
  const fake = await fakeOpenAI(t), { post, get, store } = await open(t);
  await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'video-fixture-secret' });
  const tree = store.create('Saved video', 'openai');
  const message = store.message(tree.id, 'assistant', 'Requested video', 'completed');
  const job = store.pendingArtifact(tree.id, message, 'Saved video', 'Retry request', 'video', '{}');
  store.cancelVideo(tree.id, job.id);
  await post('/api/settings/endpoint/clear');
  assert.equal((await post(`/api/trees/${tree.id}/artifacts/${job.id}/retry`)).status, 200);
  const artifact = await (await get(`/api/trees/${tree.id}/artifacts/${job.id}`)).json();
  assert.equal(artifact.status, 'failed');
  assert.match(artifact.error, /Selected provider is unavailable/);
  assert.deepEqual((await (await get('/api/state')).json()).videos, [], 'missing provider leaves no running job');
});
