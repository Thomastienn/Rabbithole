// Providers (synthetic or native with --live), app server and agent-browser helpers for verify-visual-workers.mjs.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from '../../../server/store.mjs';
import { createApp } from '../../../server/app.mjs';
import { Claude } from '../../../server/providers/claude.mjs';
import { Codex } from '../../../server/providers/codex.mjs';
import { Auth } from '../../../server/providers/auth.mjs';
import lockfile from 'proper-lockfile';

const live = process.argv.includes('--live'),
  providerName = live ? process.argv.at(-1) : 'claude';
const prediction = process.argv.includes('--check-yourself');
const evidenceName = prediction
  ? live
    ? 'check-yourself-native-' + providerName
    : 'check-yourself'
  : live
    ? 'visual-native-' + providerName
    : 'visual-workers';
if (live)
  assert.ok(
    process.env.TREETUTOR_LIVE_VISUAL === '1' && ['claude', 'codex'].includes(providerName),
    'Native smoke requires TREETUTOR_LIVE_VISUAL=1 and --live claude|codex. No provider fallback.',
  );
process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-visual-workers-')),
  store = new Store(join(dir, 'trees.sqlite'));
const task = prediction
  ? {
      title: 'Predict the search interval',
      description:
        'Search for 12 in 2, 4, 6, 8, 10, 12, 14. The midpoint is 8. Which half remains?',
      intent:
        'A predict-then-reveal check: ask which half remains; reveal the right half with a brief reason.',
      excerpt: 'Keep 10, 12, 14 because target 12 is greater than midpoint 8.',
    }
  : {
      title: 'Winners advance',
      description: 'Two winners meet in the final.',
      intent: 'Show two winners meeting.',
      excerpt: 'Winners advance.',
    };
const block = (title) => '\n```treetutor-visual\n' + JSON.stringify({ ...task, title }) + '\n```';
const source = prediction
  ? `<style>p{margin-block:var(--spacing-3)}summary{font-family:Archivo,sans-serif;cursor:pointer;color:var(--color-accent)}summary:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}code{white-space:normal}</style><p>Search for 12: <code>2, 4, 6, <strong>8</strong>, 10, 12, 14</code></p><p>The midpoint is 8. Which half remains?</p><details><summary>Reveal answer</summary><p id="prediction-result" data-visual-label="Remaining half" data-visual-explanation="The right half remains because 12 is greater than 8.">Keep the right half: <code>10, 12, 14</code>.</p><p>Because 12 is greater than 8, the midpoint and all smaller values can be ruled out.</p></details>`
  : `<style>svg{display:block;width:100%;color:var(--color-text-primary)}button{font:inherit;color:var(--color-text-primary);background:transparent;border:1px solid var(--color-border)}button:focus-visible{outline:2px solid var(--color-accent)}</style><svg viewBox="0 0 400 100" role="img" aria-label="Two winners advancing to the final"><text x="8" y="40" fill="currentColor">Winner A → Final ← Winner B</text></svg><button type="button" id="step">Next round</button><p role="status" id="result">Round one</p><script>document.getElementById('step').onclick=()=>document.getElementById('result').textContent='Final round';</script>`;
// Toggled by the journey; an object because imported bindings are read-only.
const flags = { good: false, holdWorkers: false };
let chatRelease;
const workerReleases = [],
  workerCalls = [],
  launches = [];
const complete = (emit, text) => {
  emit({ type: 'item', item: 'a', text });
  emit({ type: 'status', status: 'completed' });
};
const models = async () => [
  { model: 'fixture', label: 'Fixture model', isDefault: true, efforts: ['low'] },
];
const tutor = {
  models,
  generate: async (_tree, text, emit) => {
    if (text === 'More steps') {
      emit({
        type: 'item',
        item: 'a',
        text:
          'Read this while the visuals generate.' +
          Array.from({ length: 5 }, (_, i) => block('Step ' + i)).join('') +
          '\n\nReading continues below the visuals.',
      });
      await new Promise((r) => {
        chatRelease = r;
      });
    } else
      complete(
        emit,
        (prediction ? 'Compare the target with the midpoint.' : 'Winners advance in rounds.') +
          block(task.title) +
          (prediction ? '\n\nContinue whenever you like.' : '\n\nThe final decides the winner.'),
      );
  },
};
const launch = (command, args, options) => {
  const record = {
    args,
    apiKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY'].filter(
      (k) => k in options.env,
    ),
    requests: [],
  };
  launches.push(record);
  const child = spawn(command, args, options);
  if (command === 'codex') {
    const write = child.stdin.write.bind(child.stdin);
    child.stdin.write = (text) => {
      const { method, params } = JSON.parse(text);
      if (method === 'thread/start' || method === 'thread/resume')
        record.requests.push({
          method,
          worker: params.baseInstructions?.startsWith('You create one self-contained visual'),
          model: params.model,
          sandbox: params.sandbox,
          approvalPolicy: params.approvalPolicy,
        });
      if (method === 'turn/start')
        record.requests.push({ method, model: params.model, effort: params.effort });
      return write(text);
    };
  }
  return child;
};
let release;
const authDir =
  process.env.TREETUTOR_DATA_DIR ??
  join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
if (live && providerName === 'codex')
  release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
const smart = live
  ? providerName === 'claude'
    ? new Claude(dir, launch)
    : new Codex(new Auth(authDir), dir, launch)
  : {
      models,
      generate: async (_tree, text, emit, _save, signal) => {
        workerCalls.push({ request: JSON.parse(text).request, signal });
        if (flags.holdWorkers) await new Promise((r) => workerReleases.push(r));
        complete(emit, flags.good ? source : '<script>const = broken;</script>');
      },
    };
const app = createApp({
  store,
  providers: live ? { [providerName]: smart } : { openai: tutor, claude: smart },
  defaultProvider: live ? providerName : 'claude',
  visualTimeout: live ? 120000 : 60000,
  auth: { status: () => ({ connected: false }) },
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`,
  { csrf } = await (await fetch(origin + '/api/state')).json();
const post = (path, body = {}) =>
  fetch(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
    body: JSON.stringify(body),
  });
const run = promisify(execFile),
  session = `${evidenceName}-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 << 20 })).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression, '--timeout', '30000');
const checks = [],
  shots = join(process.cwd(), '.impeccable/review');
mkdirSync(shots, { recursive: true });
const pass = (name, detail) => {
  checks.push({ name, pass: true, ...(detail && { detail }) });
  console.log('PASS:', name);
};

export {
  live,
  providerName,
  prediction,
  evidenceName,
  store,
  block,
  source,
  flags,
  chatRelease,
  workerReleases,
  workerCalls,
  launches,
  tutor,
  release,
  smart,
  app,
  origin,
  post,
  b,
  ev,
  wait,
  checks,
  shots,
  pass,
};
