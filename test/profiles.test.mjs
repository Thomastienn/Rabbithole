import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

async function start(dir = mkdtempSync(join(tmpdir(), 'tt-profiles-')), names = ['claude', 'codex', 'openai']) {
  const store = new Store(join(dir, 'trees.sqlite')), calls = [];
  const providers = Object.fromEntries(names.map(provider => [provider, {
    models: async () => [{ model: 'chat', label: 'Chat', isDefault: true, efforts: ['low', 'high'] }, { model: 'plain', label: 'Plain', efforts: [] }],
    model: async () => 'chat',
    generate: async (tree, text, emit, save) => { calls.push({ provider, model: tree.model }); save(`${provider}-${tree.id}`, tree.model); emit({ type: 'status', status: 'completed' }); },
  }]));
  const app = createApp({ store, providers, defaultProvider: 'claude', auth: { status: () => ({ connected: true }) }, dir });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async path => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const post = (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  const roles = async () => ({ chat: await get('/api/settings/chat'), smart: await get('/api/settings/smart'), quick: await get('/api/settings/suggestions') });
  return { dir, get, post, roles, calls, close: async () => { await app.stop(); store.close(); } };
}

test('upgrade turns the saved chat, smart and quick thinking choices into an active "Default" profile', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-profiles-migrate-'));
  new Store(join(dir, 'trees.sqlite')).close();
  const db = new DatabaseSync(join(dir, 'trees.sqlite'));
  db.exec(`DROP TABLE active_profile; DROP TABLE profiles;
    INSERT INTO chat_settings VALUES (1, 'codex', 'chat', 'high');
    INSERT INTO smart_settings VALUES (1, 'openai', 'plain', 0, 'low');
    INSERT INTO suggestion_settings VALUES (1, 0, 'openai', 'chat', 'high');`);
  db.close();
  const env = await start(dir);
  t.after(() => env.close());
  const { active, profiles } = await env.get('/api/profiles');
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'Default'); assert.equal(profiles[0].id, active);
  assert.deepEqual(await env.roles(), {
    chat: { provider: 'codex', model: 'chat', effort: 'high' },
    smart: { model: { provider: 'openai', model: 'plain' }, followEffort: false, effort: 'low', resolved: { provider: 'openai', model: 'plain', effort: 'low' } },
    quick: { enabled: false, model: { provider: 'openai', model: 'chat' }, effort: 'high' },
  });
  const root = await (await env.post('/api/trees')).json();
  assert.equal(root.provider, 'codex'); assert.equal(root.effort, 'high');
});

test('a fresh install starts with one "Default" profile holding the provider defaults', async t => {
  const env = await start();
  t.after(() => env.close());
  const { profiles } = await env.get('/api/profiles');
  assert.deepEqual(profiles.map(({ id, ...p }) => p), [{ name: 'Default', chat: { provider: 'claude', model: null, effort: null }, smart: { model: null, followEffort: true, effort: null }, quick: { model: null, effort: null } }]);
});

test('activating a profile swaps all three roles; role routes edit only the active profile; conversations and the suggestions switch stay put', async () => {
  let env = await start();
  await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: 'high' });
  await env.post('/api/settings/smart', { followEffort: false, effort: 'low' });
  await env.post('/api/settings/suggestions', { model: { provider: 'openai', model: 'chat' }, effort: 'low' });
  const defaults = await env.roles();
  const old = await (await env.post('/api/trees')).json();

  const created = await env.post('/api/profiles', { name: ' Deep study ' });
  assert.equal(created.status, 200);
  const list = await created.json(), deep = list.profiles.find(p => p.name === 'Deep study');
  assert.notEqual(list.active, deep.id, 'creating does not swap');
  assert.deepEqual(deep.chat, defaults.chat, 'a new profile copies the active one');
  assert.equal((await env.post('/api/profiles', { name: 'deep STUDY' })).status, 409);
  assert.equal((await env.post('/api/profiles', { name: '  ' })).status, 400);
  assert.equal((await env.post('/api/profiles/active', { id: 'missing' })).status, 404);

  assert.equal((await env.post('/api/profiles/active', { id: deep.id })).status, 200);
  await env.post('/api/settings/chat', { provider: 'claude', model: 'plain', effort: null });
  await env.post('/api/settings/smart', { model: { provider: 'codex', model: 'chat' } });
  await env.post('/api/settings/suggestions', { model: null, enabled: false });
  const deepRoles = await env.roles();
  assert.deepEqual(deepRoles.chat, { provider: 'claude', model: 'plain', effort: null });
  assert.deepEqual(deepRoles.smart.resolved, { provider: 'codex', model: 'chat', effort: 'low' });
  assert.deepEqual(deepRoles.quick, { enabled: false, model: null, effort: null });
  const fresh = await (await env.post('/api/trees')).json();
  assert.equal(fresh.provider, 'claude'); assert.equal(fresh.model, 'plain');
  assert.equal((await env.get(`/api/trees/${old.id}`)).provider, 'codex', 'existing conversations keep their saved model');

  const back = await (await env.post('/api/profiles/active', (await env.get('/api/profiles')).profiles.find(p => p.name === 'Default'))).json();
  assert.equal(back.profiles.find(p => p.name === 'Default').id, back.active);
  assert.deepEqual(await env.roles(), { ...defaults, quick: { ...defaults.quick, enabled: false } }, 'Default is untouched by Deep study edits; on/off is global');

  await env.post('/api/profiles/active', { id: deep.id });
  const dir = env.dir;
  await env.close(); env = await start(dir);
  assert.equal((await env.get('/api/profiles')).active, deep.id, 'the active profile survives a restart');
  assert.deepEqual(await env.roles(), deepRoles);
  await env.close();
});

test('a profile whose model is unavailable still swaps in and fails visibly instead of falling back', async () => {
  let env = await start();
  await (await env.post('/api/profiles', { name: 'Local' })).json();
  const local = (await env.get('/api/profiles')).profiles.find(p => p.name === 'Local');
  await env.post('/api/profiles/active', { id: local.id });
  await env.post('/api/settings/chat', { provider: 'openai', model: 'chat', effort: null });
  await env.post('/api/profiles/active', { id: (await env.get('/api/profiles')).profiles.find(p => p.name === 'Default').id });
  const dir = env.dir;
  await env.close(); env = await start(dir, ['claude', 'codex']);
  assert.equal((await env.post('/api/profiles/active', { id: local.id })).status, 200, 'activation never checks availability');
  assert.deepEqual(await env.get('/api/settings/chat'), { provider: 'openai', model: 'chat', effort: null });
  const response = await env.post('/api/trees');
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /unavailable/);
  assert.equal(env.calls.length, 0);
  await env.close();
});
