import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Auth } from '../server/auth.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { fakeOpenAI, streamReply } from './fake-openai.mjs';
import { compacted } from './branch-first.mjs';

test('credential-bearing auth keeps tokens out of browser state, catalog, replies and reconnect URL', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-credentials-'));
  const auth = new Auth(dir), store = new Store(join(dir, 'trees.sqlite'));
  const canaries = ['canary-access-secret', 'canary-refresh-secret', 'canary-id-secret'];
  auth.save({ access_token: canaries[0], refresh_token: canaries[1], id_token: canaries[2], scope: 'chatgpt.tokens.use.direct', expires_in: 3600 }, { sub: 'fixture-subject', email: 'learner@example.test' }, 'oaiapp_fixture');
  const restored = new Auth(dir);
  let inferenceCalls = 0;
  const app = createApp({ store, auth: restored, provider: {
    models: async () => [{ model: 'fixture-text', label: 'Fixture text', isDefault: true }],
    async generate(tree, text, emit, save) {
      assert.equal(await restored.token(), canaries[0]);
      inferenceCalls++;
      save('fixture-session', 'fixture-text');
      emit({ type: 'item', item: 'answer', text: 'A synthetic tutor reply.' });
      emit({ type: 'status', status: 'completed' });
    },
  } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`, bodies = [];
  const request = async (path, body) => {
    const response = await fetch(origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
    const text = await response.text(); bodies.push([path, text]); assert.equal(response.ok, true, path); return text;
  };
  let csrf;
  try {
    const state = JSON.parse(await request('/api/state')); csrf = state.csrf;
    assert.deepEqual(state.auth, { connected: true, email: 'learner@example.test' });
    await request('/api/models');
    const tree = JSON.parse(await request('/api/trees', {}));
    await request(`/api/trees/${tree.id}/messages`, { text: 'A synthetic question.' });
    await request(`/api/trees/${tree.id}`);
    await request(`/api/previews?id=${tree.id}`);
    const reconnect = new URL(JSON.parse(await request('/api/auth', {})).url);
    assert.equal(reconnect.searchParams.get('client_id'), 'oaiapp_fixture');
    assert.equal(reconnect.searchParams.get('ext_agent_host_id'), auth.host);
    assert.equal(reconnect.searchParams.has('id_token_hint'), false);
    assert.equal(reconnect.searchParams.has('agent_name_hint'), false);
    for (const [path, text] of bodies) for (const canary of canaries) assert.ok(!text.includes(canary), `Credential exposed by ${path}`);
    assert.equal(inferenceCalls, 1);
  } finally { app.stop(); store.close(); }
});

test('main-entry custom endpoint keeps the key in its owner-only file across restart, hostile upstream output, errors and clear', async t => {
  const fake = await fakeOpenAI(t), dir = mkdtempSync(join(tmpdir(), 'tt-endpoint-credentials-'));
  const apiKey = 'canary-custom-endpoint-secret-47', bodies = [], logs = [];
  fake.models = [{ id: 'local-tutor', api_key: apiKey, owned_by: apiKey }, { id: apiKey }];
  const launch = async () => {
    const child = spawn(process.execPath, ['server/main.mjs'], { env: { ...process.env, PATH: dir, TREETUTOR_DATA_DIR: dir, TREETUTOR_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise(resolve => child.once('exit', resolve));
    let output = '';
    for (const pipe of [child.stdout, child.stderr]) pipe.on('data', chunk => { output += chunk; logs.push(chunk.toString()); });
    const deadline = Date.now() + 10000;
    const stop = async () => { if (child.exitCode === null) child.kill('SIGTERM'); await exited; };
    t.after(stop);
    while (!/Saved trees remain available/.test(output)) {
      assert.equal(child.exitCode, null, 'server must start');
      assert.ok(Date.now() < deadline, 'startup timed out');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const origin = output.match(/TreeTutor: (http:\/\/127\.0\.0\.1:\d+)/)[1];
    let csrf;
    const request = async (path, body, status = 200) => {
      const response = await fetch(origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
      const text = await response.text(); bodies.push({ path, text });
      assert.equal(response.status, status, path);
      assert.ok(!text.includes(apiKey), `Custom key exposed by ${path}`);
      return text;
    };
    csrf = JSON.parse(await request('/api/state')).csrf;
    return { request, stop, origin };
  };
  let app = await launch();
  assert.deepEqual(JSON.parse(await app.request('/api/settings/endpoint')), { configured: false, baseUrl: null });
  await app.request('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey });
  assert.equal(statSync(join(dir, 'openai-endpoint.json')).mode & 0o777, 0o600);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(JSON.parse(readFileSync(join(dir, 'openai-endpoint.json'))).apiKey, apiKey);
  await app.stop();
  app = await launch();
  assert.deepEqual(JSON.parse(await app.request('/api/settings/endpoint')), { configured: true, baseUrl: fake.baseUrl });
  const catalogue = JSON.parse(await app.request('/api/models'));
  assert.deepEqual(catalogue.models, [{ provider: 'openai', model: 'local-tutor', label: 'local-tutor', isDefault: true, efforts: [] }]);
  assert.equal(catalogue.providers.openai.connected, true);
  await app.request('/api/settings/endpoint/test', {});
  const tree = JSON.parse(await app.request('/api/trees', {}, 201));
  assert.equal(tree.provider, 'claude', 'configuration never opts a learner into key-backed inference');
  assert.match(await app.request(`/api/trees/${tree.id}/messages`, { text: 'Unavailable Claude' }), /not installed/);
  assert.equal(fake.calls.filter(call => call.body).length, 0, 'Claude sign-in/installation failure never falls back to the custom endpoint');
  await app.request(`/api/trees/${tree.id}/model`, { provider: 'openai', model: 'local-tutor' });
  fake.reply = (req, res) => streamReply(res, ['Safe: ', apiKey.slice(0, 6), apiKey.slice(6, 17), apiKey.slice(17), ' ', apiKey + apiKey, ' End.']);
  const stream = await app.request(`/api/trees/${tree.id}/messages`, { text: 'A synthetic question' });
  assert.match(stream, /\[redacted\]/); assert.match(stream, /"status":"completed"/);
  const saved = JSON.parse(await app.request(`/api/trees/${tree.id}`));
  assert.equal(saved.messages.at(-1).text, 'Safe: [redacted] [redacted][redacted] End.');
  await app.request(`/api/previews?id=${tree.id}`);
  // Compaction output crosses the same boundary before its snapshot reaches SQLite.
  const child = await compacted(app.origin, JSON.parse(await app.request(`/api/trees/${tree.id}/branches`, { messageId: saved.messages.at(-1).id, start: 0, end: 4, text: 'Safe', question: 'Branch question' }, 201)).id);
  assert.equal(child.branch.snapshot, 'Safe: [redacted] [redacted][redacted] End.');
  fake.modelStatus = 401; fake.error = { message: apiKey };
  await app.request('/api/settings/endpoint/test', {}, 502);
  await app.request('/api/models', undefined, 502);
  await app.request(`/api/trees/${tree.id}/model`, { provider: 'openai', model: 'local-tutor' }, 502);
  fake.modelStatus = 200;
  fake.reply = (req, res) => { res.writeHead(429, { 'X-Secret': apiKey }); res.end(JSON.stringify({ error: { message: apiKey } })); };
  await app.request(`/api/trees/${tree.id}/messages`, { text: 'HTTP failure' });
  fake.reply = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: ' + JSON.stringify({ error: { message: apiKey } }) + '\n\n'); };
  await app.request(`/api/trees/${tree.id}/messages`, { text: 'Stream failure' });
  await app.request('/api/state'); await app.request(`/api/trees/${child.id}`);
  await app.stop();
  // Scan every SQL row plus raw database/WAL bytes, rather than only the visible messages.
  for (const name of readdirSync(dir).filter(name => name.startsWith('trees.sqlite'))) assert.ok(!readFileSync(join(dir, name)).includes(Buffer.from(apiKey)), `${name} contains the key`);
  const db = new DatabaseSync(join(dir, 'trees.sqlite'), { readOnly: true });
  try {
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) assert.ok(!JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all()).includes(apiKey), `SQL table ${name} contains the key`);
  } finally { db.close(); }
  app = await launch();
  await app.request(`/api/trees/${tree.id}`);
  await app.request('/api/settings/endpoint/clear', {});
  assert.equal(existsSync(join(dir, 'openai-endpoint.json')), false);
  assert.equal(readdirSync(dir).some(name => name.endsWith('.tmp')), false);
  await app.request(`/api/trees/${tree.id}/messages`, { text: 'Endpoint cleared' });
  await app.stop();
  assert.ok(!logs.join('').includes(apiKey), 'stdout/stderr contains the key');
  assert.ok(bodies.length >= 20, 'scan covers successful, failed and restarted responses');
  assert.ok(fake.calls.every(call => call.headers.authorization === `Bearer ${apiKey}`), 'the key is sent only as upstream authorization');
  assert.ok(fake.calls.filter(call => call.body).every(call => !JSON.stringify(call.body).includes(apiKey)), 'key never re-enters inference history');
});
