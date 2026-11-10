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
import { OpenAI } from '../server/openai.mjs';
import { createApp } from '../server/app.mjs';
import { fakeOpenAI } from './fake-openai.mjs';

const fixture = fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url));
const SAVED = [{ start: 0, end: 13, text: 'Authoritative' }, { start: 14, end: 22, text: 'original' }];

async function start(dir, suggestions = true, connected = { claude: true, codex: true }) {
  const calls = [];
  const launch = (command, args, options) => {
    const child = spawn(process.execPath, [fixture, ...(command === 'claude' ? args : [])], options);
    if (command === 'claude') { const end = child.stdin.end.bind(child.stdin); child.stdin.end = input => { calls.push({ system: args[args.indexOf('--system-prompt') + 1], model: args.includes('--model') ? args[args.indexOf('--model') + 1] : null, input }); return end(input); }; }
    return child;
  };
  const store = new Store(join(dir, 'trees.sqlite'));
  const claude = new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, JSON.stringify({ loggedIn: connected.claude })));
  const codex = new Codex({ token: async () => { if (!connected.codex) throw new Error('Signed out.'); return 'fixture-token'; } }, dir, launch);
  const endpoint = new OpenAI(dir);
  const app = createApp({ store, dir, endpoint, providers: { claude, codex, ...(endpoint.status().configured && { openai: endpoint }) }, defaultProvider: 'claude', auth: { status: () => ({ connected: connected.codex }) }, suggestions });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async path => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const request = (path, data = {}, headers = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf, ...headers }, body: JSON.stringify(data) });
  const post = async (path, data = {}) => (await request(path, data)).text();
  const settled = async () => { while ((await get('/api/state')).suggesting.length) await new Promise(r => setTimeout(r, 20)); };
  const suggestionCalls = () => calls.filter(c => c.system.startsWith('You mark'));
  return { store, get, post, request, settled, calls, suggestionCalls, close: async () => { await app.stop(); store.close(); } };
}
// Graph shape without the derived familiarity fields.
const shape = g => ({ ...g, concepts: g.concepts.map(({ name, topics }) => ({ name, topics })) });
const strip = s => s.map(({ message, status, passages, usage }) => ({ message, status, passages, usage: usage && { input: usage.input, output: usage.output, cacheRead: usage.cacheRead } }));

test('suggestion requests supply exact raw UTF-16 word offsets for terms and sections; mismatched output is still discarded', async t => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-offsets-')));
  t.after(() => env.close());
  for (const provider of ['claude', 'codex']) {
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${tree.id}/model`, { provider, model: provider === 'claude' ? 'haiku' : 'fixture-model' });
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Check passage offsets' });
    await env.settled();
    const saved = await env.get(`/api/trees/${tree.id}`), reply = saved.messages.at(-1);
    assert.equal(saved.suggestions[0].status, 'ready');
    assert.deepEqual(saved.suggestions[0].passages, [{ text: '**mutex**', start: 5, end: 14 }, { text: '1. Frontend', start: 38, end: 49 }]);
    for (const passage of saved.suggestions[0].passages) assert.equal(reply.text.slice(passage.start, passage.end), passage.text);
  }
});

test('a saved suggestion model applies across conversations and restart; unpinning restores each provider’s cheap model', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-settings-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  assert.deepEqual(await env.get('/api/settings/suggestions'), { enabled: true, model: null });
  const model = { provider: 'claude', model: 'sonnet' };
  assert.deepEqual(JSON.parse(await env.post('/api/settings/suggestions', { model })), { enabled: true, model });
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain, suggestion model: sonnet' });
  await env.settled();
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain, suggestion model: sonnet' });
  await env.settled();
  assert.deepEqual(env.suggestionCalls().map(c => c.model), ['sonnet', 'sonnet']);
  for (const id of [a.id, b.id]) assert.equal((await env.get(`/api/trees/${id}`)).suggestions[0].status, 'ready');
  const tutor = await env.get(`/api/trees/${b.id}`);
  assert.equal(tutor.provider, 'codex');
  assert.equal(tutor.model, 'fixture-model');
  await env.close();

  env = await start(dir);
  assert.deepEqual(await env.get('/api/settings/suggestions'), { enabled: true, model });
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Continue, suggestion model: sonnet' });
  await env.settled();
  assert.equal(env.suggestionCalls()[0].model, 'sonnet');
  assert.deepEqual(JSON.parse(await env.post('/api/settings/suggestions', { model: null })), { enabled: true, model: null });
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Default Claude suggestions' });
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Default Codex suggestions' });
  await env.settled();
  assert.equal(env.suggestionCalls().at(-1).model, 'haiku');
  for (const id of [a.id, b.id]) assert.equal((await env.get(`/api/trees/${id}`)).suggestions.at(-1).status, 'ready');

  // A Codex pin also overrides a Claude conversation, with no fallback to Luna.
  await env.post('/api/settings/suggestions', { model: { provider: 'codex', model: 'fixture-alternate' } });
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Continue, suggestion model: fixture-alternate' });
  await env.settled();
  assert.equal((await env.get(`/api/trees/${a.id}`)).suggestions.at(-1).status, 'ready');
});

test('off prevents new suggestion calls, persists after restart and keeps saved suggestions; re-enabling never backfills', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-off-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post('/api/settings/suggestions', { model: { provider: 'claude', model: 'haiku' } });
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, slow suggestions' });
  assert.ok((await env.get('/api/state')).suggesting.includes(tree.id));
  assert.deepEqual(JSON.parse(await env.post('/api/settings/suggestions', { enabled: false })), { enabled: false, model: { provider: 'claude', model: 'haiku' } });
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'No suggestions for this reply' });
  await env.settled();
  const saved = (await env.get(`/api/trees/${tree.id}`)).suggestions;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'ready', 'a call already started can finish and save its usage');
  assert.equal(env.suggestionCalls().length, 1);
  const usage = (await env.get('/api/state')).usage;
  assert.deepEqual(usage, { input: 309, output: 21, cacheRead: 120, replies: 2 });
  await env.close();

  env = await start(dir);
  assert.equal((await env.get('/api/settings/suggestions')).enabled, false);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Still off after restart' });
  await env.settled();
  assert.equal(env.suggestionCalls().length, 0);
  assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).suggestions, saved);
  await env.post('/api/settings/suggestions', { enabled: true });
  await env.settled();
  assert.equal(env.suggestionCalls().length, 0);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Suggestions again' });
  await env.settled();
  assert.equal(env.suggestionCalls().length, 1);
  assert.equal((await env.get(`/api/trees/${tree.id}`)).suggestions.length, 2);
});

test('only signed-in subscription models can be pinned; stale pins fail without a provider or API-key fallback', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-auth-'));
  const connected = { claude: false, codex: true }, env = await start(dir, true, connected), fake = await fakeOpenAI(t);
  t.after(async () => { await env.close(); });
  await env.post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'suggestions-key-fixture' });
  const offered = await env.get('/api/models');
  assert.equal(offered.providers.claude.connected, false);
  assert.ok(!offered.models.some(m => m.provider === 'claude'));
  for (const body of [{ model: { provider: 'claude', model: 'haiku' } }, { model: { provider: 'openai', model: 'local-tutor' } }, { model: { provider: 'codex', model: 'missing' } }, { model: {} }, { model: 'haiku' }, { model: 1 }, { enabled: 'off' }, null]) {
    assert.equal((await env.request('/api/settings/suggestions', body)).status, 400);
    assert.deepEqual(await env.get('/api/settings/suggestions'), { enabled: true, model: null });
  }
  assert.equal((await env.request('/api/settings/suggestions', { enabled: false }, { 'X-TreeTutor-CSRF': '' })).status, 403);
  connected.claude = true;
  await env.post('/api/settings/suggestions', { model: { provider: 'claude', model: 'sonnet' } });
  connected.claude = false;
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Stale Claude pin' });
  await env.settled();
  assert.equal((await env.get(`/api/trees/${tree.id}`)).suggestions[0].status, 'failed');
  assert.equal(env.suggestionCalls().length, 0, 'signed-out Claude is never invoked');
  assert.equal(fake.calls.filter(c => c.body).length, 0, 'custom endpoint is never a fallback');
  // Off and unpin remain usable when the pinned provider is signed out.
  assert.equal((await env.request('/api/settings/suggestions', { enabled: false })).status, 200);
  assert.equal((await env.request('/api/settings/suggestions', { model: null })).status, 200);
  await env.post('/api/settings/suggestions', { enabled: true });
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'openai', model: 'local-tutor' });
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Custom endpoint conversation' });
  await env.settled();
  assert.equal((await env.get(`/api/trees/${tree.id}`)).suggestions.at(-1).status, 'failed');
  assert.equal(fake.calls.filter(c => c.body).length, 1, 'only the explicit tutor call uses the API key');
  connected.codex = false;
  assert.equal((await env.request('/api/settings/suggestions', { model: { provider: 'codex', model: 'fixture-luna' } })).status, 400);
});

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
  assert.deepEqual(input, { inheritedContext: null, question: 'Explain brackets', answer: 'Authoritative original', knownConcepts: {}, familiarity: {}, answerWords: [{ text: 'Authoritative', start: 0, end: 13 }, { text: 'original', start: 14, end: 22 }] });
  assert.deepEqual(strip(saved.suggestions), [{ message: reply.id, status: 'ready', passages: SAVED, usage: { input: 103, output: 7, cacheRead: 40 } }]);
  for (const p of saved.suggestions[0].passages) assert.equal(reply.text.slice(p.start, p.end), p.text);
  // The suggestion call's usage counts in today's total but not as a reply.
  assert.deepEqual((await env.get('/api/state')).usage, { input: 309, output: 21, cacheRead: 120, replies: 2 });

  // Isolation: a fresh tutor session replays saved history without suggestion instructions or results; so does branch compaction.
  env.store.forgetThread(tree.id);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue, no usage' });
  await env.post(`/api/trees/${tree.id}/branches`, { messageId: reply.id, ...SAVED[0], question: 'What is that?' });
  for (const call of env.calls.filter(c => !c.system.startsWith('You mark'))) {
    assert.doesNotMatch(call.system + call.input, /You mark passages|Mark every term|"suggestions"|"passages"|knownConcepts|"concepts"/);
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

const GRAPH = {
  topics: ['Concurrency', 'operating systems'],
  concepts: [{ name: 'Mutual exclusion', topics: ['Concurrency', 'operating systems'] }, { name: "Peterson's algorithm", topics: ['Concurrency'] }],
  links: [{ from: "Peterson's algorithm", to: 'Mutual exclusion', kind: 'builds on' }]
};

test('the same suggestion call fills one global knowledge graph that survives restart and reuses concepts across learning trees', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-graph-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  // One tutor call and one suggestion call: graph data adds no model call.
  assert.equal(env.calls.length, 2);
  assert.equal(env.suggestionCalls().length, 1);
  assert.deepEqual(shape(await env.get('/api/graph')), GRAPH, 'invalid concepts and links are dropped');
  assert.equal((await env.get(`/api/trees/${a.id}`)).suggestions[0].passages.length, 2);
  await env.close();

  env = await start(dir);
  assert.deepEqual(shape(await env.get('/api/graph')), GRAPH);
  // Another learning tree on another provider: the known names are sent, and the model reuses "Peterson's algorithm" instead of "Peterson lock".
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain locks again' });
  await env.settled();
  assert.equal((await env.get(`/api/trees/${b.id}`)).suggestions[0].status, 'ready');
  // A differently cased name reuses its concept; the new link joins the existing concepts.
  assert.deepEqual(shape(await env.get('/api/graph')), { ...GRAPH, links: [{ from: 'Mutual exclusion', to: "Peterson's algorithm", kind: 'related' }, ...GRAPH.links] });
  // Graph data never enters tutor history.
  env.store.forgetThread(a.id);
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Continue' });
  await env.settled();
  for (const call of env.calls.filter(c => !c.system.startsWith('You mark'))) assert.doesNotMatch(call.system + call.input, /Peterson|knownConcepts|"concepts"/);
  const sent = JSON.parse(env.suggestionCalls().at(-1).input.slice(env.suggestionCalls().at(-1).input.indexOf('\n') + 1)).knownConcepts;
  assert.deepEqual(sent, { Concurrency: ['Mutual exclusion', "Peterson's algorithm"], 'operating systems': ['Mutual exclusion'] });
});

test('state reports the concept-name list size so Settings can warn past about 2k tokens', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-graph-warn-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain many concepts' });
  await env.settled();
  assert.ok((await env.get('/api/state')).conceptNameTokens < 2000);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain more' });
  await env.settled();
  const tokens = (await env.get('/api/state')).conceptNameTokens;
  assert.ok(tokens > 2000, `${tokens} tokens`);
  await env.close();
  env = await start(dir);
  assert.equal((await env.get('/api/state')).conceptNameTokens, tokens);
});

test('branching from a suggestion marks it explored with its child at every depth; manual branches and deleted children leave it unexplored', async t => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-explore-')));
  t.after(async () => { await env.close(); });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain brackets' });
  await env.settled();
  const reply = (await env.get(`/api/trees/${tree.id}`)).messages.at(-1);
  const passages = async id => (await env.get(`/api/trees/${id}`)).suggestions[0].passages;

  // A manual highlight of the same text is a branch but does not explore the suggestion.
  const manual = JSON.parse(await env.post(`/api/trees/${tree.id}/branches`, { messageId: reply.id, ...SAVED[0], question: 'Manual' }));
  assert.deepEqual(await passages(tree.id), SAVED);
  const child = JSON.parse(await env.post(`/api/trees/${tree.id}/branches`, { messageId: reply.id, ...SAVED[0], suggestion: true, question: 'explain' }));
  assert.deepEqual([child.branch.text, child.branch.question], ['Authoritative', 'explain']);
  assert.deepEqual(await passages(tree.id), [{ ...SAVED[0], child: child.id }, SAVED[1]]);
  // A stale second suggestion branch never steals the live child reference.
  const extra = JSON.parse(await env.post(`/api/trees/${tree.id}/branches`, { messageId: reply.id, ...SAVED[0], suggestion: true, question: 'again' }));
  assert.equal((await passages(tree.id))[0].child, child.id);

  // Grandchild: the child's own reply gets suggestions and branching from one explores it there.
  await env.post(`/api/trees/${child.id}/messages`, { text: 'explain' });
  await env.settled();
  const childReply = (await env.get(`/api/trees/${child.id}`)).messages.at(-1);
  const grandchild = JSON.parse(await env.post(`/api/trees/${child.id}/branches`, { messageId: childReply.id, ...SAVED[1], suggestion: true, question: 'explain' }));
  assert.equal((await passages(child.id))[1].child, grandchild.id);
  assert.equal(grandchild.branch.parent, child.id);

  // Deleting the explored child makes the underline unexplored again.
  await env.post(`/api/trees/${tree.id}/delete`, { conversation: child.id });
  assert.deepEqual(await passages(tree.id), SAVED);
  assert.ok([manual, extra].every(Boolean));
});

test('meeting, asking about, using and ignoring a concept add evidence; familiarity follows it, corrections outrank it and the suggestion call receives it', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-evidence-'));
  let env = await start(dir);
  t.after(async () => { await env.close(); });
  const concept = async name => (await env.get('/api/graph')).concepts.find(c => c.name === name);
  const sent = () => JSON.parse(env.suggestionCalls().at(-1).input.slice(env.suggestionCalls().at(-1).input.indexOf('\n') + 1)).familiarity;
  const P = "Peterson's algorithm", M = 'Mutual exclusion';

  // Met: every concept of a saved reply, once per reply.
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  assert.deepEqual(await concept(M), { name: M, topics: ['Concurrency', 'operating systems'], familiarity: 0.1, evidence: { met: 1, asked: 0, used: 0, ignored: 0 }, correction: null });
  assert.equal((await concept(P)).familiarity, 0.1);

  // Asked: branching from the passage the call tagged with the concept.
  const reply = (await env.get(`/api/trees/${a.id}`)).messages.at(-1);
  await env.post(`/api/trees/${a.id}/branches`, { messageId: reply.id, ...SAVED[0], suggestion: true, question: 'explain' });
  assert.deepEqual([(await concept(M)).evidence.asked, (await concept(M)).familiarity], [1, 0.3]);
  // A highlight with no concept in it adds nothing.
  await env.post(`/api/trees/${a.id}/branches`, { messageId: reply.id, ...SAVED[1], question: 'explain' });
  assert.equal((await concept(P)).evidence.asked, 0);

  // Met again in another tree under another wording; its tagged underline is left unexplored.
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain locks again' });
  await env.settled();
  assert.deepEqual([(await concept(M)).evidence.met, (await concept(P)).familiarity], [2, 0.2]);

  // Used: the learner names a concept; ignored: asking on moves past the unexplored underline. The call gets the relevant familiarity.
  await env.post(`/api/trees/${b.id}/messages`, { text: `What about ${P.toLowerCase()}?` });
  await env.settled();
  assert.deepEqual((await concept(P)).evidence, { met: 2, asked: 0, used: 1, ignored: 0 });
  assert.equal((await concept(P)).familiarity, 0.5);
  assert.deepEqual((await concept(M)).evidence, { met: 2, asked: 1, used: 0, ignored: 1 });
  assert.equal((await concept(M)).familiarity, 0.45, 'an ignored underline moves familiarity only slightly');
  assert.deepEqual(sent(), { [P]: 0.5 });
  // The same ignored underline never counts twice.
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Thanks' });
  await env.settled();
  assert.equal((await concept(M)).evidence.ignored, 1);

  // A correction outranks inference, including later evidence, and survives restart; the latest correction wins.
  assert.equal(env.store.correct(M, 'known'), true);
  await env.post(`/api/trees/${a.id}/messages`, { text: `Explain ${M} once more` });
  await env.settled();
  assert.deepEqual(sent(), { [M]: 1 });
  assert.deepEqual([(await concept(M)).evidence.used, (await concept(M)).familiarity, (await concept(M)).correction], [1, 1, 'known']);
  await env.close();
  env = await start(dir);
  assert.equal((await concept(M)).familiarity, 1);
  env.store.correct(M, 'unknown');
  assert.deepEqual([(await concept(M)).familiarity, (await concept(M)).correction], [0, 'unknown']);
});

test('Knowledge and tagged passage corrections validate over HTTP, persist, and override later inference in suggestion inputs', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-corrections-'));
  let env = await start(dir);
  t.after(async () => env.close());
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  const saved = await env.get(`/api/trees/${tree.id}`);
  const { concept: name, text } = saved.suggestions[0].passages[0];
  assert.equal(name, 'Mutual exclusion');
  assert.notEqual(text, name, 'passage wording need not be the concept name');
  for (const body of [null, {}, { name, kind: 'met' }, { name: '', kind: 'known' }, { name: 1, kind: 'unknown' }]) assert.equal((await env.request('/api/graph/correct', body)).status, 400);
  assert.equal((await env.request('/api/graph/correct', { name: 'missing', kind: 'known' })).status, 404);
  assert.equal((await env.request('/api/graph/correct', { name, kind: 'known' }, { 'X-TreeTutor-CSRF': '' })).status, 403);
  const concept = async () => (await env.get('/api/graph')).concepts.find(c => c.name === name);
  const sent = () => JSON.parse(env.suggestionCalls().at(-1).input.split('\n').slice(1).join('\n')).familiarity[name];
  for (const [kind, value] of [['known', 1], ['unknown', 0]]) {
    const calls = env.suggestionCalls().length;
    assert.equal((await env.request('/api/graph/correct', { name, kind })).status, 200);
    assert.equal(env.suggestionCalls().length, calls, 'correcting adds no model call');
    assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).suggestions[0], saved.suggestions[0], 'correcting leaves saved underlines intact');
    await env.close(); env = await start(dir);
    assert.deepEqual([(await concept()).correction, (await concept()).familiarity], [kind, value]);
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Mutual exclusion locks' });
    await env.settled();
    assert.equal(sent(), value, 'explicit correction outranks additional use and ignored evidence');
    assert.equal((await concept()).familiarity, value);
  }
});

test('Knowledge merge combines cross-tree topics, evidence, links and latest correction; aliases and passages keep working after restart', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-merge-'));
  let env = await start(dir);
  t.after(async () => env.close());
  const keep = "Peterson's algorithm", from = 'Peterson lock', mutex = 'Mutual exclusion';
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' }); await env.settled();
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain duplicate locks' }); await env.settled();
  // Seed one overlapping source event and a tagged saved passage, as a model can return both names for the same reply.
  const reply = (await env.get(`/api/trees/${b.id}`)).messages.at(-1);
  env.store.addGraph({ concepts: [{ name: keep, topics: ['Concurrency'] }], links: [] }, reply.id);
  env.store.db.prepare('UPDATE suggestions SET passages=? WHERE message=?').run(JSON.stringify([{ start: 0, end: 13, text: 'Authoritative', concept: from }]), reply.id);
  await env.post(`/api/trees/${a.id}/messages`, { text: "Peterson's algorithm and Peterson lock" }); await env.settled();
  await env.post('/api/graph/correct', { name: keep, kind: 'unknown' });
  await env.post('/api/graph/correct', { name: from, kind: 'known' });
  // Move the older correction into the concept with a newer correction; insertion during merge must not reverse them.
  const merged = await env.request('/api/graph/merge', { from: keep, into: from });
  assert.equal(merged.status, 200);
  let graph = await merged.json(), c = graph.concepts.find(c => c.name === from);
  assert.equal(graph.concepts.length, 2);
  assert.deepEqual(c.topics, ['Algorithms', 'Concurrency']);
  assert.deepEqual(c.evidence, { met: 2, asked: 0, used: 1, ignored: 0 });
  assert.deepEqual([c.correction, c.familiarity], ['known', 1]);
  assert.deepEqual(graph.links, [{ from: mutex, to: from, kind: 'related' }, { from, to: mutex, kind: 'builds on' }]);
  assert.ok(graph.links.every(l => l.from !== l.to));
  await env.close(); env = await start(dir);
  assert.deepEqual(await env.get('/api/graph'), graph);
  // Merge back through a third canonical name, retaining aliases transitively and rewriting the old passage tag.
  env.store.addGraph({ concepts: [{ name: 'Peterson mutex', topics: ['Concurrency'] }], links: [] });
  await env.post('/api/graph/merge', { from, into: 'Peterson mutex' });
  assert.equal((await env.get(`/api/trees/${b.id}`)).suggestions[0].passages[0].concept, 'Peterson mutex');
  const branched = JSON.parse(await env.post(`/api/trees/${b.id}/branches`, { messageId: reply.id, start: 0, end: 13, text: 'Authoritative', question: 'Explain' }));
  assert.ok(branched.id);
  await env.post('/api/graph/correct', { name: keep, kind: 'unknown' });
  await env.post(`/api/trees/${a.id}/messages`, { text: "Peterson's algorithm and Peterson lock duplicate locks" }); await env.settled();
  graph = await env.get('/api/graph'); c = graph.concepts.find(c => c.name === 'Peterson mutex');
  assert.equal(graph.concepts.length, 2, 'old names from the next suggestion result do not recreate duplicates');
  assert.equal(c.evidence.asked, 1, 'tagged passage still adds evidence after merge');
  assert.equal(c.evidence.used, 2, 'both before and after merge, one question mentioning both names counts once');
  assert.deepEqual([c.familiarity, c.correction], [0, 'unknown']);
  const familiarity = JSON.parse(env.suggestionCalls().at(-1).input.split('\n').slice(1).join('\n')).familiarity;
  assert.equal(familiarity[keep], 0); assert.equal(familiarity[from], 0);
  const before = graph;
  for (const body of [null, {}, { from }, { from, into: from }, { from: 'Peterson mutex', into: keep }]) assert.equal((await env.request('/api/graph/merge', body)).status, 400);
  assert.equal((await env.request('/api/graph/merge', { from: 'missing', into: from })).status, 404);
  assert.equal((await env.request('/api/graph/merge', { from: mutex, into: from }, { 'X-TreeTutor-CSRF': '' })).status, 403);
  assert.deepEqual(await env.get('/api/graph'), before, 'invalid requests leave the graph unchanged');
});

test('a failed Knowledge merge rolls back evidence, topics, links, aliases and saved passage references', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-merge-rollback-')), env = await start(dir);
  t.after(async () => env.close());
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain locks' }); await env.settled();
  const graph = await env.get('/api/graph'), saved = await env.get(`/api/trees/${tree.id}`);
  env.store.db.exec('CREATE TRIGGER reject_concept_delete BEFORE DELETE ON concepts BEGIN SELECT RAISE(ABORT, \'fixture merge failure\'); END;');
  assert.equal((await env.request('/api/graph/merge', { from: "Peterson's algorithm", into: 'Mutual exclusion' })).status, 500);
  assert.deepEqual(await env.get('/api/graph'), graph);
  assert.deepEqual(await env.get(`/api/trees/${tree.id}`), saved);
  assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
  env.store.db.exec('DROP TRIGGER reject_concept_delete');
  assert.equal((await env.request('/api/graph/merge', { from: "Peterson's algorithm", into: 'Mutual exclusion' })).status, 200);
});
