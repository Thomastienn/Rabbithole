import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { OpenAI } from '../server/openai.mjs';
import { fakeOpenAI } from './fake-openai.mjs';

async function start(dir = mkdtempSync(join(tmpdir(), 'tt-chat-defaults-'))) {
  const store = new Store(join(dir, 'trees.sqlite')), calls = [];
  const providers = Object.fromEntries(['claude', 'codex', 'openai'].map(provider => [provider, {
    models: async () => [{ model: 'chat', label: 'Chat', isDefault: true, efforts: ['low', 'high'] }, { model: 'plain', label: 'Plain', efforts: [] }],
    model: async () => 'chat',
    generate: async (tree, text, emit, save) => {
      calls.push({ tree, text }); save(tree.thread ?? `${provider}-${tree.id}`, tree.model);
      emit({ type: 'item', item: 'reply', text: 'A fixed passage about trees.' });
      emit({ type: 'status', status: 'completed' });
    },
  }]));
  const app = createApp({ store, providers, defaultProvider: 'claude', auth: { status: () => ({ connected: true }) }, dir });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async path => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const post = (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  const send = async (id, text = 'Continue') => {
    const response = await post(`/api/trees/${id}/messages`, { text });
    assert.match(await response.text(), /"status":"completed"/);
    return get(`/api/trees/${id}`);
  };
  return { dir, store, app, providers, calls, get, post, send, close: async () => { await app.stop(); store.close(); } };
}

test('chat defaults snapshot into roots; overrides and recursive branches persist without changing other discussion', async () => {
  let env = await start();
  try {
    assert.deepEqual(await env.get('/api/settings/chat'), { provider: 'claude', model: null, effort: null });
    const chosen = { provider: 'codex', model: 'chat', effort: 'high' };
    assert.equal((await env.post('/api/settings/chat', chosen)).status, 200);
    assert.equal(env.calls.length, 0, 'saving settings never starts inference');
    const root = await (await env.post('/api/trees')).json();
    for (const [key, value] of Object.entries(chosen)) assert.equal(root[key], value);
    await env.send(root.id);
    const initial = await env.get(`/api/trees/${root.id}`);
    const current = { provider: 'openai', model: 'chat', effort: 'low' };
    assert.equal((await env.post(`/api/trees/${root.id}/model`, current)).status, 200);
    const branch = async id => {
      const tree = await env.get(`/api/trees/${id}`), source = tree.messages.find(m => m.role === 'assistant');
      const response = await env.post(`/api/trees/${id}/branches`, { messageId: source.id, start: 2, end: 15, text: 'fixed passage', question: 'Why trees?' });
      assert.equal(response.status, 201);
      return response.json();
    };
    const child = await branch(root.id);
    for (const [key, value] of Object.entries(current)) assert.equal(child[key], value);
    await env.send(child.id);
    await env.post(`/api/trees/${child.id}/model`, { ...chosen, effort: 'low' });
    const grandchild = await branch(child.id);
    assert.equal(grandchild.provider, 'codex'); assert.equal(grandchild.effort, 'low');
    const snapshot = grandchild.branch;
    await env.send(grandchild.id);
    await env.post(`/api/trees/${grandchild.id}/model`, { ...chosen, effort: 'high' });
    const before = await env.get(`/api/trees/${grandchild.id}`);
    await env.post('/api/settings/chat', { provider: 'claude', model: 'plain', effort: null });
    assert.deepEqual(await env.get(`/api/trees/${grandchild.id}`), before);
    assert.deepEqual((await env.get(`/api/trees/${root.id}`)).messages, initial.messages);
    const next = await (await env.post('/api/trees')).json();
    assert.equal(next.provider, 'claude'); assert.equal(next.model, 'plain'); assert.equal(next.effort, null);
    const dir = env.dir;
    await env.close(); env = await start(dir);
    assert.deepEqual(await env.get('/api/settings/chat'), { provider: 'claude', model: 'plain', effort: null });
    assert.deepEqual(await env.get(`/api/trees/${grandchild.id}`), before);
    await env.send(grandchild.id, 'After restart');
    const call = env.calls.at(-1).tree;
    assert.equal(call.effort, 'high'); assert.equal(call.thread, before.thread);
    assert.deepEqual(call.messages, before.messages); assert.deepEqual(call.branch, snapshot);
  } finally { await env.close(); }
});

test('invalid or disconnected choices never replace saved defaults or conversation choices', async () => {
  const env = await start(), chosen = { provider: 'codex', model: 'chat', effort: 'high' };
  try {
    await env.post('/api/settings/chat', chosen);
    const root = await (await env.post('/api/trees')).json();
    await env.send(root.id);
    const before = await env.get(`/api/trees/${root.id}`);
    for (const selection of [
      { ...chosen, effort: 'max' }, { ...chosen, effort: 1 }, { ...chosen, effort: {} },
      { ...chosen, model: 'plain' }, { ...chosen, model: 'missing' }, { ...chosen, provider: 'missing' },
    ]) {
      for (const path of ['/api/settings/chat', `/api/trees/${root.id}/model`]) {
        const response = await env.post(path, selection);
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /[Cc]hoose|[Cc]onfigure|[Rr]efresh/);
      }
      assert.deepEqual(await env.get('/api/settings/chat'), chosen);
      assert.deepEqual(await env.get(`/api/trees/${root.id}`), before);
    }
    env.providers.codex.models = async () => { throw new Error('private provider diagnostic'); };
    for (const path of ['/api/settings/chat', `/api/trees/${root.id}/model`, '/api/trees']) {
      const response = await env.post(path, chosen);
      assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /private provider diagnostic/);
    }
    delete env.providers.codex;
    const response = await env.post('/api/trees');
    assert.equal(response.status, 400); assert.match((await response.json()).error, /Chat default provider is unavailable/);
    assert.equal(env.store.list().length, 1);
    assert.deepEqual(await env.get(`/api/trees/${root.id}`), before);
  } finally { await env.close(); }
});

test('active turns freeze effort; failed changes restore the last working provider, model, effort and session', async () => {
  const env = await start();
  let finish;
  try {
    await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: 'low' });
    const root = await (await env.post('/api/trees')).json();
    await env.send(root.id);
    const original = await env.get(`/api/trees/${root.id}`);
    env.providers.codex.generate = (tree, text, emit) => new Promise(resolve => {
      assert.equal(tree.effort, 'low');
      finish = () => { emit({ type: 'status', status: 'completed' }); resolve(); };
    });
    const stream = await env.post(`/api/trees/${root.id}/messages`, { text: 'Keep working' });
    assert.equal((await env.post(`/api/trees/${root.id}/model`, { effort: 'high' })).status, 409);
    await env.post('/api/settings/chat', { provider: 'openai', model: 'chat', effort: 'high' });
    finish(); await stream.text();
    const before = await env.get(`/api/trees/${root.id}`);
    assert.equal(before.effort, 'low');
    await env.post(`/api/trees/${root.id}/model`, { provider: 'openai', model: 'chat', effort: 'high' });
    env.providers.openai.generate = async (tree, text, emit, save) => { save('failed-session', tree.model); throw new Error('Chosen effort is unavailable for this account.'); };
    const failed = await env.post(`/api/trees/${root.id}/messages`, { text: 'Try new choice' });
    assert.match(await failed.text(), /Chosen effort is unavailable/);
    const restored = await env.get(`/api/trees/${root.id}`);
    assert.equal(restored.provider, 'codex'); assert.equal(restored.effort, 'low'); assert.equal(restored.thread, original.thread);
    assert.deepEqual(restored.messages.slice(0, -2), before.messages);
  } finally { finish?.(); await env.close(); }
});

test('legacy schema gains nullable effort without changing history, provider defaults or working selection', async () => {
  let env = await start();
  const root = env.store.create('Older conversation', 'codex', 'chat');
  await env.send(root.id);
  const before = await env.get(`/api/trees/${root.id}`), dir = env.dir;
  await env.close();
  const db = new DatabaseSync(join(dir, 'trees.sqlite'));
  db.exec('ALTER TABLE trees DROP COLUMN effort; ALTER TABLE trees DROP COLUMN working_effort; DROP TABLE chat_settings');
  db.close();
  env = await start(dir);
  try {
    assert.deepEqual(await env.get(`/api/trees/${root.id}`), before);
    assert.equal(before.effort, null); assert.equal(before.working_effort, null);
    await env.send(root.id);
    assert.equal(env.calls.at(-1).tree.effort, null);
    assert.equal(env.calls.at(-1).tree.thread, before.thread);
  } finally { await env.close(); }
});

test('HTTP settings and conversation effort reach real Claude/Codex adapters and the compatible upstream, including clearing overrides', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-effort-adapters-')), traffic = [], fake = await fakeOpenAI(t);
  fake.models[0].supported_reasoning_efforts = ['low', 'high'];
  const launch = (command, args, options) => {
    const call = { command, args, env: options.env, input: [] }; traffic.push(call);
    const child = spawn(process.execPath, ['test/protocol-fixture.mjs', ...(command === 'claude' ? args : [])], { ...options, cwd: process.cwd() });
    if (command === 'codex') {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = data => { call.input.push(JSON.parse(data)); return write(data); };
    }
    return child;
  };
  const store = new Store(join(dir, 'trees.sqlite')), endpoint = new OpenAI(dir);
  endpoint.save({ baseUrl: fake.baseUrl, apiKey: 'effort-fixture-key' });
  const providers = { claude: new Claude(dir, launch, (cmd, args, opts, cb) => cb(null, '{"loggedIn":true}')),
    codex: new Codex({ token: async () => 'fixture-token' }, dir, launch), openai: endpoint };
  const app = createApp({ store, providers, endpoint, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`, { csrf } = await (await fetch(origin + '/api/state')).json();
  const post = (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  const previous = process.env.CLAUDE_CODE_EFFORT_LEVEL;
  process.env.CLAUDE_CODE_EFFORT_LEVEL = 'max';
  try {
    const catalog = await (await fetch(origin + '/api/models')).json();
    assert.deepEqual(catalog.models.find(m => m.provider === 'codex' && m.isDefault).efforts, ['low', 'medium', 'high']);
    assert.deepEqual(catalog.models.find(m => m.provider === 'openai' && m.model === 'second-model').efforts, []);
    for (const [provider, model] of [['claude', 'sonnet'], ['codex', 'fixture-model'], ['openai', 'local-tutor']]) {
      assert.equal((await post('/api/settings/chat', { provider, model, effort: 'high' })).status, 200);
      const root = await (await post('/api/trees')).json();
      for (const effort of ['high', null, 'low']) {
        assert.equal((await post(`/api/trees/${root.id}/model`, { provider, model, effort })).status, 200);
        assert.match(await (await post(`/api/trees/${root.id}/messages`, { text: 'Explain a tree' })).text(), /"status":"completed"/);
        if (provider === 'claude') {
          const call = traffic.filter(c => c.command === 'claude').at(-1), index = call.args.indexOf('--effort');
          assert.equal(index < 0 ? null : call.args[index + 1], effort);
          assert.equal(call.env.CLAUDE_CODE_EFFORT_LEVEL, effort ?? 'max', 'explicit choices override the learner environment; unset preserves it');
        } else if (provider === 'codex') {
          const call = traffic.flatMap(c => c.input).filter(r => r.method === 'turn/start').at(-1);
          assert.equal(call.params.effort, effort ?? 'medium', 'clearing effort resolves the provider default, not a sticky prior override');
        } else assert.equal(fake.calls.filter(c => c.body).at(-1).body.reasoning_effort, effort ?? undefined);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CODE_EFFORT_LEVEL; else process.env.CLAUDE_CODE_EFFORT_LEVEL = previous;
    await app.stop(); store.close();
  }
});
