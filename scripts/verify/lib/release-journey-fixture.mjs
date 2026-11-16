// Arguments, report, server lifecycle, HTTP and agent-browser helpers for verify-release-journey-live.mjs.
import { verifyOut } from './output.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { liveProvider } from './live-provider.mjs';

process.umask(0o077);
const provider = process.argv.find((a) => a.startsWith('--provider='))?.slice(11) ?? liveProvider;
assert.ok(['claude', 'codex'].includes(provider), 'Choose --provider=claude or --provider=codex');
const out =
  process.argv.slice(2).find((a) => !a.startsWith('--')) ??
  `${verifyOut}/release-journey-results.json`;
const exec = promisify(execFile),
  session = `release-${process.pid}`;
const b = async (...args) =>
  (
    await exec('agent-browser', ['--session', session, ...args], {
      env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') },
      timeout: 240000,
    })
  ).stdout;
const ev = async (s) => JSON.parse(await b('eval', s, '--json')).data.result;
const wait = (s, ms = 240000) => b('wait', '--fn', s, '--timeout', String(ms));
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const data = mkdtempSync(join(tmpdir(), 'rabbithole-release-'));
const report = {
  date: new Date().toISOString(),
  data,
  provider,
  route:
    provider === 'claude'
      ? 'native Claude Code login'
      : 'existing app-owned ChatGPT consent; isolated Codex app-server',
  checks: [],
};
const ok = (name, detail) => {
  report.checks.push({ name, result: 'PASS', ...(detail && { detail }) });
  console.error(`ok - ${name}`);
};
const CODE = 'AMBER-HERON-42';
// The root titles itself from this first question.
const ROOT = `My bracket codename is ${CODE}; remember it. In three short sentences, explain how a tournament tree finds the minimum of eight numbers.`;

let server, origin, csrf;
async function start(port = 0) {
  server = spawn(
    process.execPath,
    provider === 'claude'
      ? ['server/main.mjs']
      : [
          join(import.meta.dirname, 'release-journey-server.mjs'),
          '--serve',
          data,
          String(port),
          '--provider=codex',
        ],
    {
      env:
        provider === 'claude'
          ? { ...process.env, RABBITHOLE_DATA_DIR: data, RABBITHOLE_PORT: String(port) }
          : process.env,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  server.on('exit', (code, signal) => console.error('server exit', code, signal));
  origin = await new Promise((done, fail) => {
    const timer = setTimeout(() => {
      server.kill();
      fail(new Error('Server startup timed out'));
    }, 15000);
    server.stdout.on('data', (d) => {
      const m = String(d).match(/http:\/\/[^\s]+/);
      if (m) {
        clearTimeout(timer);
        done(m[0]);
      }
    });
    server.once('error', (error) => {
      clearTimeout(timer);
      fail(error);
    });
    server.once('exit', (code) => {
      clearTimeout(timer);
      fail(new Error(`Native ${provider} server exited during startup: ${code}`));
    });
  });
  csrf = (await (await fetch(origin + '/api/state')).json()).csrf;
  return server.pid;
}
async function stop() {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise((r) => server.once('exit', r));
  server.kill('SIGTERM');
  await exited;
}
const get = async (path) => {
  const r = await fetch(origin + path);
  seen.push([path, await r.clone().text()]);
  return r.json();
};
const post = (path, body) =>
  fetch(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
    body: JSON.stringify(body),
  });
const seen = []; // every browser-visible response body, scanned for credentials at the end
async function ask(id, text) {
  const r = await post(`/api/trees/${id}/messages`, { text });
  assert.equal(r.status, 200);
  const body = await r.text();
  seen.push([`stream ${id}`, body]);
  const done = body
    .split('\n\n')
    .filter((f) => f.startsWith('data: '))
    .map((f) => JSON.parse(f.slice(6)))
    .find((e) => e.type === 'done');
  const reply = (await get(`/api/trees/${id}`)).messages.at(-1);
  assert.equal(done?.status, 'completed', reply.text);
  assert.equal(reply.status, 'completed');
  return reply;
}
async function branch(parent, question) {
  const source = parent.messages.findLast((m) => m.role === 'assistant');
  const end = source.text.indexOf(' ', 40) > 0 ? source.text.indexOf(' ', 40) : source.text.length; // exact passage, word boundary
  const r = await post(`/api/trees/${parent.id}/branches`, {
    messageId: source.id,
    start: 0,
    end,
    text: source.text.slice(0, end),
    question,
  });
  assert.equal(r.status, 201, await r.clone().text());
  const child = await r.json();
  assert.equal(child.provider, parent.provider);
  assert.equal(child.branch.messageId, source.id);
  assert.equal(child.branch.text, source.text.slice(child.branch.start, child.branch.end));
  assert.ok(child.branch.snapshot.trim().length > 0 && child.branch.snapshot.length <= 12000);
  assert.deepEqual(
    (await get(`/api/trees/${parent.id}`)).messages,
    parent.messages,
    'compaction preserves original parent history',
  );
  (report.branches ??= []).push({
    title: child.title,
    source: source.text,
    anchor: child.branch,
    compaction: 'native; inspect summary against source and ancestor context',
  });
  return child;
}
const loopback = (pid) => {
  const rows = execFileSync('ss', ['-Hltnp'], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.includes(`pid=${pid},`));
  assert.ok(rows.length >= 1, 'server listener found');
  const addrs = rows.map((l) => l.trim().split(/\s+/)[3]);
  assert.ok(
    addrs.every((a) => a.startsWith('127.0.0.1:')),
    `loopback only: ${addrs}`,
  );
  return addrs;
};
const node = (id) => `!!document.querySelector('.react-flow__node[data-id="${id}"]')`;
const h2 = `document.querySelector('.focused-chat h2')?.textContent`;
const chatShown = `getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`;
const view = () => ev('document.querySelector(".react-flow__viewport").style.transform');
async function settledView() {
  for (;;) {
    const a = await view();
    await new Promise((r) => setTimeout(r, 300));
    if (a === (await view())) return a;
  }
}
const flush = async () => {
  await ev('__layoutMinute()');
  await wait('window.__layoutInFlight === 0');
};
async function openTree(name) {
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await click(name);
}
// Everything the PRD says must survive a restart: messages, anchors, frozen snapshots, positions, layout, provider/session.
async function snapshot() {
  const state = await get('/api/state');
  return Object.fromEntries(
    await Promise.all(
      state.trees.map(async (t) => [t.title, { list: t, tree: await get(`/api/trees/${t.id}`) }]),
    ),
  );
}

export {
  provider,
  out,
  session,
  b,
  ev,
  wait,
  click,
  hash,
  data,
  report,
  ok,
  CODE,
  ROOT,
  server,
  origin,
  start,
  stop,
  get,
  post,
  seen,
  ask,
  branch,
  loopback,
  node,
  h2,
  chatShown,
  view,
  settledView,
  flush,
  openTree,
  snapshot,
};
