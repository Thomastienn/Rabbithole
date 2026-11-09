import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';

// Delivery/restart integration check. Real main process and HTTP boundary, seeded synthetic content;
// no inference, account credential access or claim of native-provider semantic continuity.
// Requires npm run build. Usage: node scripts/verify-local-delivery.mjs [report.json]
process.umask(0o077);
const out = process.argv[2] ?? 'docs/verification/local-delivery-results.json';
const data = mkdtempSync(join(tmpdir(), 'treetutor-delivery-'));
const report = { date: new Date().toISOString(), content: 'seeded synthetic fixture; no inference', checks: [] };
const ok = (name, detail) => { report.checks.push({ name, result: 'PASS', detail }); console.log(`ok - ${name}`); };
const seed = new Store(join(data, 'trees.sqlite'));
const root = seed.create('Tournament trees', 'claude'), other = seed.create('Heap comparison', 'codex');
seed.message(root.id, 'user', 'How does a tournament tree find the minimum?', 'completed');
const source = seed.message(root.id, 'assistant', 'Peterson combines two-process locks in a tournament tree. 🌲 Peterson is a different use of tournaments.', 'completed');
const child = seed.branch(seed.tree(root.id), { messageId: source, start: 0, end: 8, text: 'Peterson', question: 'What is Peterson?' }, 'Fixed fixture context about tournament trees.');
seed.message(child.id, 'user', 'What is Peterson?', 'completed');
const nestedSource = seed.message(child.id, 'assistant', 'Mutual exclusion permits one process at a time.', 'completed');
const grand = seed.branch(child, { messageId: nestedSource, start: 0, end: 16, text: 'Mutual exclusion', question: 'Why mutual exclusion?' }, 'Fixed nested fixture context; exact selected passage is Mutual exclusion.');
seed.message(other.id, 'user', 'How does a heap differ?', 'completed');
seed.message(other.id, 'assistant', 'A fixture heap answer.', 'completed');
seed.message(root.id, 'user', 'A later parent question.', 'completed');
seed.message(root.id, 'assistant', 'A later parent answer.', 'completed');
seed.close();

let server, origin, csrf;
const responses = [];
const get = async path => { const r = await fetch(origin + path); const body = await r.text(); responses.push([path, body]); return { status: r.status, body: JSON.parse(body) }; };
const post = (path, body, headers = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf, ...headers }, body: JSON.stringify(body) });
async function start(port = 0) {
  server = spawn(process.execPath, ['server/main.mjs'], { env: { ...process.env, TREETUTOR_DATA_DIR: data, TREETUTOR_PORT: String(port), CLAUDE_CONFIG_DIR: join(data, 'signed-out-claude') }, stdio: ['ignore', 'pipe', 'pipe'] });
  origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.kill(); reject(new Error('Server startup timed out')); }, 15000);
    server.stdout.on('data', d => { const m = String(d).match(/http:\/\/[^\s]+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited during startup: ${code}`)); });
  });
  csrf = (await get('/api/state')).body.csrf;
  const rows = execFileSync('ss', ['-Hltnp'], { encoding: 'utf8' }).split('\n').filter(l => l.includes(`pid=${server.pid},`));
  const addresses = rows.map(l => l.trim().split(/\s+/)[3]);
  assert.ok(addresses.length && addresses.every(a => a === new URL(origin).host));
  return { pid: server.pid, command: 'node server/main.mjs', addresses };
}
async function stop() { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exit; }
async function snapshot() {
  const { trees } = (await get('/api/state')).body;
  return { trees, conversations: await Promise.all(trees.map(async t => (await get(`/api/trees/${t.id}`)).body)) };
}
try {
  report.before = await start();
  ok('actual main-process listener is loopback only', report.before);
  const port = new URL(origin).port;
  const layouts = [
    [root.id, { folded: [child.id], selected: child.id, panel: 'expanded', viewport: { x: -120, y: 45, zoom: 0.8 }, positions: { [root.id]: { x: 12, y: 34 }, [child.id]: { x: 480, y: 200 }, [grand.id]: { x: 960, y: 360 } } }],
    [other.id, { folded: [], selected: other.id, panel: 'collapsed', viewport: { x: 75, y: -60, zoom: 1.2 }, positions: { [other.id]: { x: -40, y: 80 } } }],
  ];
  for (const [id, layout] of layouts) assert.equal((await post(`/api/trees/${id}/layout`, layout)).status, 200);
  const before = await snapshot();
  assert.deepEqual(before.conversations.find(t => t.id === grand.id).branch, grand.branch);
  ok('multiple trees and nested exact anchors, fixed snapshots, positions, folds, selection and expanded/collapsed modes saved', { roots: 2, conversations: 4 });

  for (const headers of [{ Host: 'foreign.example' }, { Origin: 'https://foreign.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const status = await new Promise((resolve, reject) => { const req = http.get(origin + '/api/state', { headers }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
    assert.equal(status, 403);
  }
  for (const headers of [{ 'X-TreeTutor-CSRF': '' }, { 'X-TreeTutor-CSRF': 'wrong' }, { 'Content-Type': 'text/plain' }, { Origin: 'https://foreign.example' }]) assert.equal((await post('/api/trees', {}, headers)).status, 403);
  assert.equal((await fetch(origin + '/auth/callback?state=invalid&code=fake', { headers: { Origin: 'https://foreign.example' } })).status, 400);
  ok('Host, Origin, cross-site, CSRF and content-type boundary rejects; invalid OAuth callback cannot exchange', { rejectedRequests: 8 });
  await stop();
  await assert.rejects(fetch(origin + '/api/state'));
  report.after = await start(port);
  assert.notEqual(report.before.pid, report.after.pid);
  assert.deepEqual(await snapshot(), before);
  ok('actual server stop/restart preserves every saved field exactly', { digest: createHash('sha256').update(JSON.stringify(before)).digest('hex'), conversations: before.conversations.length });
  assert.equal((await post('/api/trees', {}, { 'X-TreeTutor-CSRF': 'old' })).status, 403);

  await get('/api/previews?' + [root, child, grand, other].map(t => `id=${t.id}`).join('&'));
  await get('/api/models'); // isolated signed-out native providers; no inference or real account credentials
  await get('/api/trees/missing');
  responses.push(['/api/auth', await (await post('/api/auth', {})).text()]);
  const html = await (await fetch(origin)).text(); responses.push(['/', html]);
  for (const asset of readdirSync('dist/assets').filter(f => /\.(js|css)$/.test(f))) {
    const path = `/assets/${asset}`, r = await fetch(origin + path);
    assert.equal(r.status, 200); responses.push([path, await r.text()]);
  }
  const credential = /sk-ant-|\bsk-[A-Za-z0-9_-]{20,}|access_token|refresh_token|id_token|"apiKey"|ANTHROPIC_API_KEY|eyJ[\w-]{10,}\.[\w-]{10,}\./;
  assert.deepEqual(responses.filter(([, body]) => credential.test(body)).map(([path]) => path), []);
  ok('HTTP state, conversations, previews, catalog/errors and every built JS/CSS body contain no provider credential patterns', { responseBodies: responses.length, limitation: 'Pattern scan of synthetic, signed-out delivery run; live response scan remains in native journey.' });
  const file = join(data, 'trees.sqlite');
  assert.ok(statSync(file).isFile()); assert.equal(statSync(file).mode & 0o777, 0o600);
  report.saveLocation = { path: file, directoryMode: (statSync(data).mode & 0o777).toString(8), fileMode: (statSync(file).mode & 0o777).toString(8), bytes: statSync(file).size };
  ok('actual local SQLite save exists with private file/directory permissions', report.saveLocation);
  report.result = 'PASS';
} catch (error) { report.result = 'FAIL'; report.error = String(error.stack).slice(0, 1500); process.exitCode = 1; }
finally {
  if (server?.exitCode === null) await stop();
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, error: report.error?.split('\n')[0] }));
}
