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
  return { store, get, post, origin, headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, close: async () => { await app.stop(); store.close(); } };
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
  env.store.db.prepare("UPDATE usage_events SET at=0 WHERE id IN (SELECT 'chat:'||id FROM messages WHERE tree=?)").run(codex.id);
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

test('usage history migrates once, keeps attribution and unavailable calls, survives restart and deletion, filters ranges and never duplicates', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-usage-history-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain brackets' });
  // Simulate a database from before durable history: only per-message usage exists.
  await env.close();
  const old = new Store(join(dir, 'trees.sqlite'));
  old.db.exec('DROP TABLE usage_events');
  const reply = old.tree(tree.id).messages.find(m => m.role === 'assistant');
  old.db.prepare("UPDATE messages SET usage=json_set(usage,'$.at',?) WHERE id=?").run(new Date(2025, 11, 31, 23, 30).getTime(), reply.id);
  old.close();

  env = await start(dir);
  const migrated = (await env.get('/api/usage')).events;
  // Historical provider/model were never saved, so they stay unknown.
  assert.deepEqual(migrated, [{ at: new Date(2025, 11, 31, 23, 30).getTime(), provider: null, model: null, task: 'chat', input: 103, output: 7, cacheRead: 40 }]);

  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Again, no usage' });
  const codex = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${codex.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'Explain rounds' });
  const events = (await env.get('/api/usage')).events;
  assert.deepEqual(events.slice(1).map(({ at, ...e }) => e), [
    { provider: 'claude', model: events[1].model, task: 'chat', input: null, output: null, cacheRead: null },
    { provider: 'codex', model: 'fixture-model', task: 'chat', input: 30, output: 9, cacheRead: 20 },
  ]);
  // Codex reports cached input inside its input total; history stores disjoint counts so totals never double count.
  assert.equal(events[2].input + events[2].cacheRead, 50);

  // Repeated completion and reopening do not add rows.
  const codexReply = (await env.get(`/api/trees/${codex.id}`)).messages.at(-1).id;
  env.store.record(`chat:${codexReply}`, 'chat', { provider: 'codex', model: 'fixture-model' }, { input: 30, output: 9, cacheRead: 20 });
  await env.close();
  env = await start(dir);
  assert.deepEqual((await env.get('/api/usage')).events, events);

  // Year boundary: the migrated call belongs to 2025 only.
  const range = async (a, b) => (await env.get(`/api/usage?from=${a.getTime()}&to=${b.getTime()}`)).events.length;
  assert.equal(await range(new Date(2025, 0, 1), new Date(2026, 0, 1)), 1);
  assert.equal(await range(new Date(2024, 0, 1), new Date(2025, 0, 1)), 0);
  assert.equal(await range(new Date(2026, 0, 1), new Date(2027, 0, 1)), events.filter(e => new Date(e.at).getFullYear() === 2026).length);
  assert.equal((await env.get('/api/usage')).first, events[0].at);

  // Deleting learning trees removes their content but never history; rows hold no conversation text or ids.
  for (const id of [tree.id, codex.id]) assert.equal((await fetch(env.origin + `/api/trees/${id}/delete`, { method: 'POST', headers: env.headers, body: JSON.stringify({ conversation: id }) })).status, 200);
  assert.deepEqual((await env.get('/api/usage')).events, events);
  assert.deepEqual(env.store.db.prepare('PRAGMA table_info(usage_events)').all().map(c => c.name), ['id', 'at', 'provider', 'model', 'task', 'input', 'output', 'cacheRead']);
  assert.ok(!JSON.stringify(env.store.db.prepare('SELECT * FROM usage_events').all()).match(/brackets|rounds|Authoritative/));
  await env.close();
  env = await start(dir);
  assert.deepEqual((await env.get('/api/usage')).events, events);
});
