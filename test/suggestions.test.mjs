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

const fixture = fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url));
const SAVED = [{ start: 0, end: 13, text: 'Authoritative' }, { start: 14, end: 22, text: 'original' }];

async function start(dir, suggestions = true) {
  const calls = [];
  const launch = (command, args, options) => {
    const child = spawn(process.execPath, [fixture, ...(command === 'claude' ? args : [])], options);
    if (command === 'claude') { const end = child.stdin.end.bind(child.stdin); child.stdin.end = input => { calls.push({ system: args[args.indexOf('--system-prompt') + 1], model: args.includes('--model') ? args[args.indexOf('--model') + 1] : null, input }); return end(input); }; }
    return child;
  };
  const store = new Store(join(dir, 'trees.sqlite'));
  const claude = new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}'));
  const codex = new Codex({ token: async () => 'fixture-token' }, dir, launch);
  const app = createApp({ store, dir, providers: { claude, codex }, defaultProvider: 'claude', auth: { status: () => ({ connected: true }) }, suggestions });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async path => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const post = async (path, data = {}) => (await fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(data) })).text();
  const settled = async () => { while ((await get('/api/state')).suggesting.length) await new Promise(r => setTimeout(r, 20)); };
  const suggestionCalls = () => calls.filter(c => c.system.startsWith('You mark'));
  return { store, get, post, settled, calls, suggestionCalls, close: async () => { await app.stop(); store.close(); } };
}
const strip = s => s.map(({ message, status, passages, usage }) => ({ message, status, passages, usage: usage && { input: usage.input, output: usage.output, cacheRead: usage.cacheRead } }));

test('a completed reply gets one cheap-model suggestion call whose exact passages and usage are saved; reopening, switching and old replies never run it', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-'));
  // A reply saved before suggestions existed.
  let env = await start(dir, false);
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Before suggestions' });
  await env.close();

  env = await start(dir);
  assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).suggestions, []);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain brackets' });
  await env.settled();
  let saved = await env.get(`/api/trees/${tree.id}`);
  const reply = saved.messages.at(-1);
  assert.equal(env.suggestionCalls().length, 1);
  assert.equal(env.suggestionCalls()[0].model, 'haiku');
  const input = JSON.parse(env.suggestionCalls()[0].input.slice(env.suggestionCalls()[0].input.indexOf('\n') + 1));
  assert.deepEqual(input, { inheritedContext: null, question: 'Explain brackets', answer: 'Authoritative original' });
  assert.deepEqual(strip(saved.suggestions), [{ message: reply.id, status: 'ready', passages: SAVED, usage: { input: 103, output: 7, cacheRead: 40 } }]);
  for (const p of saved.suggestions[0].passages) assert.equal(reply.text.slice(p.start, p.end), p.text);
  // The suggestion call's usage counts in today's total but not as a reply.
  assert.deepEqual((await env.get('/api/state')).usage, { input: 309, output: 21, cacheRead: 120, replies: 2 });

  // Isolation: a fresh tutor session replays saved history without suggestion instructions or results; so does branch compaction.
  env.store.forgetThread(tree.id);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue, no usage' });
  await env.post(`/api/trees/${tree.id}/branches`, { messageId: reply.id, ...SAVED[0], question: 'What is that?' });
  for (const call of env.calls.filter(c => !c.system.startsWith('You mark'))) {
    assert.doesNotMatch(call.system + call.input, /You mark passages|Mark every term|"suggestions"|"passages"/);
  }
  await env.settled();
  const calls = env.suggestionCalls().length;
  assert.equal(calls, 2, 'the second completed reply ran one call; compaction ran none');

  // Switching provider and reopening run nothing new.
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.close();
  env = await start(dir);
  saved = await env.get(`/api/trees/${tree.id}`);
  await env.settled();
  assert.equal(env.suggestionCalls().length, 0);
  assert.equal(saved.suggestions.length, 2);
  assert.ok(!saved.suggestions.some(s => s.message === saved.messages[1].id), 'the pre-feature reply stays without suggestions');
});

test('failed, partial and canceled replies run no suggestions; Codex uses its Luna model', async t => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-codex-')));
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain rounds' });
  await env.settled();
  const saved = await env.get(`/api/trees/${tree.id}`);
  const expected = [{ message: saved.messages.at(-1).id, status: 'ready', passages: SAVED, usage: { input: 30, output: 9, cacheRead: 20 } }];
  assert.deepEqual(strip(saved.suggestions), expected);

  await env.post(`/api/trees/${tree.id}/messages`, { text: 'fail' });
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  const pending = env.post(`/api/trees/${tree.id}/messages`, { text: 'hold' });
  while (!(await env.get('/api/state')).active.includes(tree.id)) await new Promise(r => setTimeout(r, 20));
  await new Promise(r => setTimeout(r, 200));
  await env.post(`/api/trees/${tree.id}/stop`);
  await pending;
  await env.settled();
  const after = await env.get(`/api/trees/${tree.id}`);
  assert.deepEqual(after.messages.filter(m => m.role === 'assistant').map(m => m.status), ['completed', 'failed', 'interrupted']);
  assert.deepEqual(strip(after.suggestions), expected);
});

test('a failed suggestion call is saved as failed with its usage and manual branching still works', async t => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-fail-')));
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, suggestions fail' });
  await env.settled();
  const saved = await env.get(`/api/trees/${tree.id}`);
  assert.deepEqual(strip(saved.suggestions), [{ message: saved.messages[1].id, status: 'failed', passages: [], usage: { input: 103, output: 7, cacheRead: 40 } }]);
  const child = JSON.parse(await env.post(`/api/trees/${tree.id}/branches`, { messageId: saved.messages[1].id, start: 0, end: 13, text: 'Authoritative', question: 'Why?' }));
  assert.equal(child.branch.text, 'Authoritative');
});

test('two conversations run suggestions concurrently while chat stays usable', async t => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-concurrent-')));
  t.after(async () => { await env.close(); });
  // An unstarted chat is reused, so each conversation is started before the next is created.
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain, slow suggestions' });
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain, slow suggestions' });
  assert.deepEqual(new Set((await env.get('/api/state')).suggesting), new Set([a.id, b.id]));
  // Chat continues while its suggestions are pending.
  assert.match(await env.post(`/api/trees/${a.id}/messages`, { text: 'Quick follow-up' }), /"status":"completed"/);
  await env.settled();
  for (const tree of [a, b]) assert.ok((await env.get(`/api/trees/${tree.id}`)).suggestions.every(s => s.status === 'ready'));
  assert.equal(env.suggestionCalls().length, 3);
});

test('stopping during a suggestion call marks it failed on restart and does not rerun it', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-stop-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, slow suggestions' });
  await env.close();
  env = await start(dir);
  await env.settled();
  assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).suggestions.map(s => s.status), ['failed']);
  assert.equal(env.suggestionCalls().length, 0);
});
