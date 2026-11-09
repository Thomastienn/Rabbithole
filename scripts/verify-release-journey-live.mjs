import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile, execFileSync, spawn } from 'node:child_process';

// Explicit live release journey (TreeTutor-7t3.12). Requires a built app (npm run build), agent-browser and a
// native Claude Code login. Runs the real `node server/main.mjs` twice on one fresh data dir with an actual
// process restart in between. Synthetic tournament-tree questions only; writes a redacted JSON report.
// Usage: node scripts/verify-release-journey-live.mjs [report.json]
const out = process.argv[2] ?? 'docs/verification/release-journey-results.json';
const exec = promisify(execFile), session = `release-${process.pid}`;
const b = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') }, timeout: 240000 })).stdout;
const ev = async s => JSON.parse(await b('eval', s, '--json')).data.result;
const wait = (s, ms = 240000) => b('wait', '--fn', s, '--timeout', String(ms));
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 12);
const data = mkdtempSync(join(tmpdir(), 'treetutor-release-'));
const report = { date: new Date().toISOString(), data: '<tmp>/treetutor-release-*', provider: 'claude (native Claude Code login)', checks: [] };
const ok = (name, detail) => { report.checks.push({ name, result: 'PASS', ...(detail && { detail }) }); console.error(`ok - ${name}`); };
const CODE = 'AMBER-HERON-42';

let server, origin, csrf;
async function start(port = 0) {
  server = spawn(process.execPath, ['server/main.mjs'], { env: { ...process.env, TREETUTOR_DATA_DIR: data, TREETUTOR_PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  server.on('exit', (code, signal) => console.error('server exit', code, signal));
  origin = await new Promise((done, fail) => { server.stdout.on('data', d => { const m = String(d).match(/http:\/\/[^\s]+/); if (m) done(m[0]); }); server.once('exit', fail); });
  csrf = (await (await fetch(origin + '/api/state')).json()).csrf;
  return server.pid;
}
async function stop() { const exited = new Promise(r => server.once('exit', r)); server.kill('SIGTERM'); await exited; }
const get = async path => { const r = await fetch(origin + path); seen.push([path, await r.clone().text()]); return r.json(); };
const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
const seen = []; // every browser-visible response body, scanned for credentials at the end
async function ask(id, text) {
  const r = await post(`/api/trees/${id}/messages`, { text });
  assert.equal(r.status, 200);
  const body = await r.text(); seen.push([`stream ${id}`, body]);
  const done = body.split('\n\n').filter(f => f.startsWith('data: ')).map(f => JSON.parse(f.slice(6))).find(e => e.type === 'done');
  const reply = (await get(`/api/trees/${id}`)).messages.at(-1);
  assert.equal(done?.status, 'completed', reply.text); assert.equal(reply.status, 'completed');
  return reply;
}
async function branch(parent, question) {
  const source = parent.messages.findLast(m => m.role === 'assistant');
  const end = source.text.indexOf(' ', 40) > 0 ? source.text.indexOf(' ', 40) : source.text.length; // exact passage, word boundary
  const r = await post(`/api/trees/${parent.id}/branches`, { messageId: source.id, start: 0, end, text: source.text.slice(0, end), question });
  assert.equal(r.status, 201, await r.clone().text());
  return r.json();
}
const loopback = pid => {
  const rows = execFileSync('ss', ['-Hltnp'], { encoding: 'utf8' }).split('\n').filter(l => l.includes(`pid=${pid},`));
  assert.ok(rows.length >= 1, 'server listener found');
  const addrs = rows.map(l => l.trim().split(/\s+/)[3]);
  assert.ok(addrs.every(a => a.startsWith('127.0.0.1:')), `loopback only: ${addrs}`);
  return addrs;
};
const node = id => `!!document.querySelector('.react-flow__node[data-id="${id}"]')`;
const h2 = `document.querySelector('.focused-chat h2')?.textContent`;
const chatShown = `getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`;
const view = () => ev('document.querySelector(".react-flow__viewport").style.transform');
async function settledView() { for (;;) { const a = await view(); await new Promise(r => setTimeout(r, 300)); if (a === await view()) return a; } }
const flush = async () => { await ev('__layoutMinute()'); await wait('window.__layoutInFlight === 0'); };
async function openTree(name) { await click('Map menu'); await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact'); await click(name); }
// Everything the PRD says must survive a restart: messages, anchors, frozen snapshots, positions, layout, provider/session.
async function snapshot() {
  const state = await get('/api/state');
  return Object.fromEntries(await Promise.all(state.trees.map(async t => [t.title, { list: t, tree: await get(`/api/trees/${t.id}`) }])));
}

try {
  // Phase 1: first server process.
  const pid1 = await start();
  const port = new URL(origin).port;
  report.listener = { before: { pid: pid1, addresses: loopback(pid1) } };
  ok('real server process listens on loopback only', report.listener.before);
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await wait(`[...document.querySelectorAll('button')].some(e => e.getAttribute('aria-label') === 'Map menu')`);
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await b('find', 'role', 'textbox', 'fill', '--name', 'New tree name', 'Tournament trees');
  await click('Create tree');
  await wait(`document.activeElement?.textContent.trim() === 'Start conversation'`);
  assert.equal(await ev(`document.querySelectorAll('.react-flow__node').length`), 0);
  ok('new tree shows an empty map and Start conversation');
  await click('Start conversation');
  await wait(`document.activeElement?.closest('.focused-chat [role=textbox]') !== null`);
  await b('keyboard', 'type', `My bracket codename is ${CODE}; remember it. In three short sentences, explain how a tournament tree finds the minimum of eight numbers.`);
  await click('Send');
  let root = (await get('/api/state')).trees.find(t => t.title === 'Tournament trees');
  for (let i = 0; i < 480 && (root = await get(`/api/trees/${root.id}`)).messages.at(-1)?.status !== 'completed'; i++) await new Promise(r => setTimeout(r, 500));
  await wait(`${node(root.id)} && document.querySelector('.focused-chat')?.innerText.includes(${JSON.stringify(root.messages.at(-1).text.slice(0, 30))})`);
  assert.equal(root.provider, 'claude'); assert.deepEqual(root.messages.map(m => [m.role, m.status]), [['user', 'completed'], ['assistant', 'completed']]);
  ok('first question creates the root node; live Claude default reply streamed in chat', { provider: root.provider, model: root.model });

  const child = await branch(root, 'Why does each match keep only the smaller value?');
  await ask(child.id, 'Answer in two sentences: why does each match keep only the smaller value?');
  const grand = await branch(await get(`/api/trees/${child.id}`), 'How many comparisons does that take?');
  await ask(grand.id, 'In one sentence: how many comparisons does finding the minimum of eight take?');
  assert.equal((await get(`/api/trees/${grand.id}`)).branch.parent, child.id);
  ok('nested branches from exact passages (root → child → grandchild) with live replies');

  // Concurrency: two separate conversations generate at once while the browser keeps navigating.
  const second = await (await post('/api/trees', { title: 'Heap comparison' })).json();
  const t0 = Date.now();
  const both = Promise.all([ask(root.id, 'One sentence: what does the root of a tournament tree hold?'), ask(second.id, 'One sentence: how does a binary heap differ from a tournament tree?')]);
  both.catch(() => {}); // surfaced by the await below
  await new Promise(r => setTimeout(r, 1500));
  assert.deepEqual(new Set((await get('/api/state')).active), new Set([root.id, second.id]), 'both replies active simultaneously');
  await b('reload'); await wait(`!!document.querySelector('[aria-label="Map menu"]')`); await openTree('Tournament trees'); await wait(node(child.id)); await b('focus', `#open-${child.id}`); await b('press', 'Enter');
  await wait(`${h2} === ${JSON.stringify(child.title)}`);
  const [r1, r2] = await both;
  assert.notEqual(r1.id, r2.id);
  ok('two conversations generated simultaneously; navigation stayed available; each reply saved to its own conversation', { ms: Date.now() - t0 });

  // Layout: fold, move, zoom, select conversation, beside panel; one batched write on the controlled minute.
  await b('reload'); await wait(`!!document.querySelector('[aria-label="Map menu"]')`); await openTree('Tournament trees');
  await wait(node(grand.id)); // selection is unsaved until the minute batch, so reopen the child after reload
  await b('focus', `#open-${child.id}`); await b('press', 'Enter');
  await wait(`${h2} === ${JSON.stringify(child.title)} && ${chatShown}`);
  await click(`Collapse descendants of ${child.title}`);
  await wait(`!${node(grand.id)}`);
  const box = await ev(`(() => { const r=document.querySelector('.react-flow__node[data-id="${root.id}"] .conversation-box').getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.bottom-4)}; })()`);
  await b('mouse', 'move', String(box.x), String(box.y)); await b('mouse', 'down', 'left');
  await b('mouse', 'move', String(box.x + 70), String(box.y + 40), '--duration', '250', '--steps', '12'); await b('mouse', 'up', 'left');
  await click('Zoom in');
  assert.equal(await ev('window.__layoutPosts'), 0, 'no write before the minute');
  await flush();
  const posts = await ev('window.__layoutPosts');
  // One write per touched root per minute: Tournament trees, plus Heap comparison that the reload opened first.
  assert.equal(posts, 2, 'fold, drag, zoom and selection coalesced into one write per tree');
  await new Promise(r => setTimeout(r, 500)); await flush();
  assert.equal(await ev('window.__layoutPosts'), posts, 'idle layout writes nothing');
  const ui = { selected: await ev(h2), chat: await ev(chatShown), grandVisible: await ev(node(grand.id)), view: await settledView() };
  await flush();
  ok('layout changes coalesce into one controlled-minute write; idle produces none', { posts });

  const before = await snapshot();
  assert.equal(Object.keys(before).length, 4);
  assert.deepEqual(before['Tournament trees'].list.layout.folded, [child.id]);
  report.saveLocation = { path: '<tmp>/treetutor-release-*/trees.sqlite', exists: existsSync(join(data, 'trees.sqlite')), sessions: 'Claude Code sessions under the native ~/.claude config; app workspace <data>/claude-workspace' };

  // Actual restart: stop the process, confirm the port is closed, start a new process on the same port.
  await stop();
  await assert.rejects(fetch(origin + '/api/state'), 'old server gone');
  const pid2 = await start(port);
  assert.notEqual(pid2, pid1);
  report.listener.after = { pid: pid2, addresses: loopback(pid2) };
  ok('server process actually restarted on the same loopback port', { pid1, pid2 });
  const after = await snapshot();
  assert.deepEqual(after, before);
  ok('after restart: messages, exact anchors, frozen snapshots, positions, viewport, folds, selection, panel mode, provider/model/session identical', {
    trees: Object.keys(after).length, messages: Object.values(after).reduce((n, t) => n + t.tree.messages.length, 0),
    digest: hash(JSON.stringify(after)),
  });
  await b('reload'); await wait(`!!document.querySelector('[aria-label="Map menu"]')`); await openTree('Tournament trees');
  await wait(`${node(root.id)} && ${h2} === ${JSON.stringify(ui.selected)}`);
  assert.equal(await ev(chatShown), ui.chat); assert.equal(await ev(node(grand.id)), ui.grandVisible);
  assert.equal(await settledView(), ui.view, JSON.stringify(after['Tournament trees'].list.layout));
  ok('browser after restart restores selected conversation, panel mode, fold and viewport', ui);

  // Semantic continuity after restart (Claude --resume) and through the frozen branch context, run concurrently.
  const [rootRecall, grandRecall] = await Promise.all([
    ask(root.id, 'What bracket codename did I give you at the start? Reply with only the codename.'),
    ask(grand.id, 'Quote, word for word, the passage I selected to start this branch. Reply with only the quote.'),
  ]);
  assert.match(rootRecall.text, new RegExp(CODE));
  const passage = after[grand.title].tree.branch.text;
  assert.ok(grandRecall.text.replace(/\s+/g, ' ').includes(passage.slice(0, 25)), `branch passage recalled: ${grandRecall.text}`);
  ok('after restart: root continues prior discussion (codename recalled) and grandchild recalls its exact selected passage, concurrently', { root: rootRecall.text.trim().slice(0, 60) });
  const final = await snapshot();
  for (const [title, t] of Object.entries(before)) assert.deepEqual(final[title].tree.messages.slice(0, t.tree.messages.length), t.tree.messages, `${title} history unchanged`);
  assert.deepEqual(final[grand.title].tree.branch, before[grand.title].tree.branch, 'frozen snapshot unchanged by later messages');
  ok('later messages append without changing earlier history or frozen branch snapshots');

  // Credentials: no browser-visible body may contain provider secrets.
  for (const path of ['/', '/api/models']) { const r = await fetch(origin + path); seen.push([path, await r.text()]); }
  const html = seen.find(([p]) => p === '/')[1];
  for (const asset of html.match(/\/assets\/[^"]+/g) ?? []) seen.push([asset, await (await fetch(origin + asset)).text()]);
  const secret = /sk-ant-|access_token|refresh_token|id_token|"apiKey"|ANTHROPIC_API_KEY|eyJ[\w-]{10,}\.[\w-]{10,}\./;
  const leaks = seen.filter(([, body]) => secret.test(body)).map(([p]) => p);
  assert.deepEqual(leaks, []);
  ok('no provider credential patterns in any browser-visible response', { responses: seen.length });
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.error = String(error?.stack ?? error).slice(0, 2000);
  try { report.snapshot = (await b('snapshot')).slice(0, 4000); } catch {}
  process.exitCode = 1;
} finally {
  await b('close').catch(() => {});
  if (server?.exitCode === null) await stop();
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, error: report.error?.split('\n')[0] }));
}
