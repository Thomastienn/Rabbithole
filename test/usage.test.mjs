import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { createApp } from '../server/app.mjs';

const launch = (command, args, options) => spawn(process.execPath, [fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url)), ...(command === 'claude' ? args : [])], options);

async function start(dir) {
  const store = new Store(join(dir, 'trees.sqlite'));
  const claude = new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}'));
  const codex = new Codex({ token: async () => 'fixture-token' }, dir, launch);
  const app = createApp({ store, dir, providers: { claude, codex }, defaultProvider: 'claude', auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async path => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const post = async (path, data = {}) => (await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(data) })).text();
  return { store, get, post, close: async () => { await app.stop(); store.close(); } };
}
const replies = tree => tree.messages.filter(m => m.role === 'assistant').map(m => ({ status: m.status, usage: m.usage }));

test('provider-reported usage is saved per reply, survives restart and totals today; missing or failed usage is never invented', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-usage-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  const claude = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${claude.id}/messages`, { text: 'Explain brackets' });
  await env.post(`/api/trees/${claude.id}/messages`, { text: 'Again, no usage' });
  const codex = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${codex.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'Explain rounds' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'Codex, no usage' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'fail' });

  const claudeUsage = { input: 103, output: 7, cacheRead: 40 }, codexUsage = { input: 30, output: 9, cacheRead: 20 };
  const strip = rows => rows.map(r => ({ ...r, usage: r.usage && { input: r.usage.input, output: r.usage.output, cacheRead: r.usage.cacheRead } }));
  const check = async () => {
    assert.deepEqual(strip(replies(await env.get(`/api/trees/${claude.id}`))), [{ status: 'completed', usage: claudeUsage }, { status: 'completed', usage: null }]);
    assert.deepEqual(strip(replies(await env.get(`/api/trees/${codex.id}`))), [{ status: 'completed', usage: codexUsage }, { status: 'completed', usage: null }, { status: 'failed', usage: null }]);
    assert.deepEqual((await env.get('/api/state')).usage, { input: 133, output: 16, cacheRead: 60, replies: 2 });
  };
  await check();
  await env.close();
  env = await start(dir);
  await check();
  // Yesterday's usage is outside today's total.
  env.store.db.prepare("UPDATE messages SET usage=json_set(usage,'$.at',0) WHERE tree=?").run(codex.id);
  assert.deepEqual((await env.get('/api/state')).usage, { input: 103, output: 7, cacheRead: 40, replies: 1 });
});

test('a canceled Codex reply keeps no usage', async t => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-usage-cancel-')));
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  const pending = env.post(`/api/trees/${tree.id}/messages`, { text: 'hold' });
  while (!(await env.get('/api/state')).active.includes(tree.id)) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 200));
  await env.post(`/api/trees/${tree.id}/stop`);
  await pending;
  assert.deepEqual(replies(await env.get(`/api/trees/${tree.id}`)), [{ status: 'interrupted', usage: null }]);
});
