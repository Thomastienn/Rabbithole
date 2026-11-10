// Explicit native-provider check. Synthetic learning data; existing sign-ins stay in place.
// Stop the app first so its ChatGPT refresh token is not used concurrently.
// Usage: node scripts/verify-break-down-live.mjs [out.json] [--codex-only|--claude-only]
// --claude-only needs no ChatGPT token, so TREETUTOR_DATA_DIR may point at an empty dir while the app runs.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import { Auth } from '../server/auth.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-break-down-'));
const authDir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
const release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
const auth = new Auth(authDir), calls = [], checks = [];
const report = { issue: 'TreeTutor-5ut.10', date: new Date().toISOString(), data: dir, route: 'Native Claude CLI and Codex app-server over existing app-owned subscription sign-ins; isolated SQLite; no API-key fallback', checks, providers: {} };
const providers = process.argv.includes('--codex-only') ? ['codex'] : process.argv.includes('--claude-only') ? ['claude'] : ['claude', 'codex'];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, ...(detail !== undefined && { detail }) });
  console.error(`${pass ? 'ok' : 'FAIL'} - ${name}`);
};
const spy = (provider, adapter) => {
  const generate = adapter.generate.bind(adapter);
  adapter.generate = async (tree, text, emit, ...rest) => {
    const call = { provider, model: tree.model, suggestion: tree.instructions?.startsWith('You mark') ?? false, fresh: !tree.thread, input: text, context: JSON.stringify(tree), output: '' };
    calls.push(call);
    try {
      await generate(tree, text, event => { if (event.type === 'item') call.output = event.text; if (event.type === 'status') call.status = event.status; emit(event); }, ...rest);
    } catch (error) { call.error = error.message; throw error; }
  };
  return adapter;
};
let store = new Store(join(dir, 'trees.sqlite')), app;
let origin, csrf;
const get = async path => (await fetch(origin + path)).json();
const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
const serve = async () => {
  app = createApp({ store, auth, dir, providers: { claude: spy('claude', new Claude(dir)), codex: spy('codex', new Codex(auth, dir)) }, defaultProvider: 'claude', suggestions: true });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${app.server.address().port}`;
  ({ csrf } = await get('/api/state'));
};
const ask = async (id, text) => {
  const response = await post(`/api/trees/${id}/messages`, { text });
  assert.equal(response.status, 200, await response.clone().text());
  const events = (await response.text()).split('\n\n').filter(f => f.startsWith('data: ')).map(f => JSON.parse(f.slice(6)));
  const end = Date.now() + 150000;
  while ((await get('/api/state')).suggesting.length && Date.now() < end) await new Promise(r => setTimeout(r, 100));
  assert.equal((await get('/api/state')).suggesting.length, 0, 'suggestions settled within deadline');
  return { status: events.find(e => e.type === 'done')?.status, error: events.find(e => e.type === 'error')?.error, tree: await get(`/api/trees/${id}`) };
};
try {
  await serve();
  const catalog = await get('/api/models');
  report.catalog = catalog.models?.map(({ provider, model, isDefault }) => ({ provider, model, isDefault }));
  for (const provider of providers) {
    const result = report.providers[provider] = {};
    try {
      const model = provider === 'claude' ? 'haiku' : catalog.models?.find(m => m.provider === provider && m.isDefault)?.model;
      assert.ok(model, `${provider} model available`);
      result.tutorModel = model;
      const root = await (await post('/api/trees', {})).json();
      const switched = await post(`/api/trees/${root.id}/model`, { provider, model });
      assert.equal(switched.status, 200, await switched.clone().text());
      const before = calls.length;
      const turn = await ask(root.id, 'I am a beginner who does not know how websites work. In two short numbered sections titled Frontend and Backend, explain what HTML, CSS, HTTP and a database do. Use at most 90 words.');
      result.root = { id: root.id, status: turn.status, error: turn.error ?? null, reply: turn.tree.messages.at(-1), suggestions: turn.tree.suggestions };
      check(`${provider}: native tutor reply completes with reported usage`, turn.status === 'completed' && !!result.root.reply.usage, turn.error);
      // A native quota/auth failure cannot be repaired by seeding a reply or changing credentials.
      if (turn.status !== 'completed') continue;
      const suggestion = turn.tree.suggestions.at(-1);
      const worker = calls.slice(before).find(c => c.suggestion);
      result.suggestionModel = worker?.model;
      result.suggestionError = worker?.error ?? null;
      result.suggestionOutput = worker?.output;
      check(`${provider}: one isolated default suggestion call completes with usage and passages`, calls.slice(before).filter(c => c.suggestion).length === 1 && worker?.fresh && suggestion?.status === 'ready' && !!suggestion.usage && suggestion.passages.length > 0);
      check(`${provider}: cheap default model`, provider === 'claude' ? worker?.model === 'haiku' : /luna/i.test(worker?.model ?? ''), worker?.model);
      const graph = await get('/api/graph');
      const met = graph.concepts.filter(c => c.evidence.met > 0);
      result.graphAfterReply = graph;
      check(`${provider}: same native call updates global concepts, topics and evidence`, met.length > 0 && graph.topics.length > 0 && calls.slice(before).length === 2);
      const passage = suggestion?.passages.find(p => p.concept) ?? suggestion?.passages[0];
      if (!passage) continue;
      const parentBefore = JSON.stringify(turn.tree.messages);
      const branched = await post(`/api/trees/${root.id}/branches`, { messageId: suggestion.message, start: passage.start, end: passage.end, text: passage.text, suggestion: true, question: 'explain' });
      result.branchStatus = branched.status;
      assert.equal(branched.status, 201, await branched.clone().text());
      const child = await branched.json();
      result.child = { id: child.id, branch: child.branch };
      check(`${provider}: native compaction creates child with exact passage and fixed inherited context`, child.branch.text === passage.text && !!child.branch.snapshot && child.branch.question === 'explain');
      const parent = await get(`/api/trees/${root.id}`);
      check(`${provider}: suggestion explored only after save; parent messages unchanged`, parent.suggestions.at(-1).passages.some(p => p.child === child.id) && JSON.stringify(parent.messages) === parentBefore);
      const childTurn = await ask(child.id, 'In at most two sentences, explain this passage for a beginner, using the website context.');
      result.childTurn = { status: childTurn.status, error: childTurn.error ?? null, reply: childTurn.tree.messages.at(-1), suggestions: childTurn.tree.suggestions };
      check(`${provider}: child continues natively and gets its own suggestions`, childTurn.status === 'completed' && childTurn.tree.suggestions.at(-1)?.status === 'ready');
      const graphAfter = await get('/api/graph');
      result.graphAfterBranch = graphAfter;
      check(`${provider}: branch records asked evidence`, !passage.concept || graphAfter.concepts.some(c => c.name === passage.concept && c.evidence.asked > 0));
      const tutors = calls.slice(before).filter(c => !c.suggestion);
      check(`${provider}: suggestion instructions and structured outputs stay out of tutor/compaction history`, tutors.every(c => !c.context.includes('You mark passages') && !c.input.includes('"knownConcepts"') && !c.input.includes('"suggestions":')));
      const saved = JSON.stringify([await get(`/api/trees/${root.id}`), await get(`/api/trees/${child.id}`), await get('/api/graph')]);
      const count = calls.length;
      await app.stop(); store.close(); store = new Store(join(dir, 'trees.sqlite')); await serve();
      check(`${provider}: app/provider/store reopen restores replies, usage, suggestions and graph with no inference`, JSON.stringify([await get(`/api/trees/${root.id}`), await get(`/api/trees/${child.id}`), await get('/api/graph')]) === saved && calls.length === count);
      result.pass = checks.filter(c => c.name.startsWith(`${provider}:`)).every(c => c.pass);
    } catch (error) { result.error = error.message; check(`${provider}: native journey`, false, error.message); }
  }
  report.dailyUsage = (await get('/api/state')).usage;
} catch (error) { check('native setup', false, error.message); }
finally { await app?.stop(); store.close(); await release(); }
report.calls = calls.map(({ provider, model, suggestion, fresh, status, error }) => ({ provider, model, suggestion, fresh, status, ...(error && { error }) }));
report.pass = checks.length > 0 && checks.every(c => c.pass) && providers.every(p => report.providers[p]?.pass);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.pass ? 0 : 1;
