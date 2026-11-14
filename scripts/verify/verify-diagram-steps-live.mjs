// Live real-example check: a complex question through a signed-in native provider should yield small diagram steps.
// Records generated sources and screenshots in both appearances for a human readability review; syntax validity alone proves nothing about comprehension.
// Usage: TT_PROVIDER=claude|codex node scripts/verify/verify-diagram-steps-live.mjs [out.json] (needs a production build and agent-browser)
import { verifyOut } from './lib/output.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { Auth } from '../../server/providers/auth.mjs';
import lockfile from 'proper-lockfile';
import { createApp } from '../../server/app.mjs';

// TT_DIR reuses an earlier run's store to redo only the screenshots, with no new inference.
const dir = process.env.TT_DIR ?? mkdtempSync(join(tmpdir(), 'tt-diagram-steps-live-'));
const store = new Store(join(dir, 'trees.sqlite'));
const providerName = process.env.TT_PROVIDER ?? 'claude';
if (!['claude', 'codex'].includes(providerName))
  throw new Error('Choose claude or codex with TT_PROVIDER.');
let releaseAuth,
  auth = { status: () => ({ connected: false }) };
if (providerName === 'codex') {
  const authDir =
    process.env.TREETUTOR_DATA_DIR ??
    join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
  releaseAuth = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
  auth = new Auth(authDir); // Credentials stay in the original app-owned directory.
}
const launches = [];
const launch = (command, args, options) => {
  const child = spawn(command, args, options),
    record = { args, input: '' };
  const end = child.stdin.end.bind(child.stdin);
  child.stdin.end = (text) => {
    record.input = text;
    return end(text);
  };
  launches.push(record);
  return child;
};
const provider = providerName === 'claude' ? new Claude(dir, launch) : new Codex(auth, dir, launch);
const calls = [],
  generate = provider.generate.bind(provider);
provider.generate = async (tree, text, ...rest) => {
  calls.push({ tree, text });
  return generate(tree, text, ...rest);
};
const app = createApp({
  store,
  auth,
  providers: { [providerName]: provider },
  defaultProvider: providerName,
  diagramTimeout: 180000,
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const { csrf } = await (await fetch(origin + '/api/state')).json();
const reused = process.env.TT_DIR && store.list()[0];
const tree = reused || store.create('A raindrop takes a round trip', providerName);
const model =
  process.env.TT_MODEL ??
  store.tree(tree.id).model ??
  (providerName === 'claude' ? 'sonnet' : await provider.model(tree));
if (!reused) store.model(tree.id, model);
const started = Date.now();
const stream = reused
  ? ''
  : await (
      await fetch(`${origin}/api/trees/${tree.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify({
          text: 'Explain how sun, clouds, rain and rivers form the water cycle. Use several simple diagram steps alongside an accurate explanation for a curious beginner.',
        }),
      })
    ).text();
const errors = stream
  .split('\n\n')
  .filter((f) => f.startsWith('data: '))
  .map((f) => JSON.parse(f.slice(6)))
  .filter((e) => e.type === 'error')
  .map((e) => e.error);
const saved = store.tree(tree.id);
const artifacts = saved.artifacts.map(({ id, title, description, status, error, source }) => ({
  id,
  title,
  description,
  status,
  error,
  colored: !!source && /:::(?:yellow|blue|pink|green)|^\s*class\s/m.test(source),
  source,
}));
const run = promisify(execFile);
const session = `diagram-steps-live-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 }))
    .stdout;
const screenshots = [],
  checks = [];
const usage = store.usageEvents();
const check = (name, pass) => checks.push({ name, pass: !!pass });
check(
  'tutor completed with multiple ready colored steps',
  saved.messages.at(-1).status === 'completed' &&
    artifacts.length > 1 &&
    artifacts.every((a) => a.status === 'ready' && a.colored),
);
check(
  'reply retains explanatory text without directives or generated source',
  saved.messages.at(-1).text.length > 200 &&
    !/treetutor-diagram|flowchart/.test(saved.messages.at(-1).text),
);
if (!reused) {
  const workers = calls.filter((c) =>
    c.tree.instructions?.startsWith('You create one Mermaid diagram'),
  );
  check(
    'one isolated native worker call per step with no tutor thread or messages',
    workers.length === artifacts.length &&
      workers.length > 1 &&
      workers.every(
        (c) => c.tree.thread === null && !c.tree.id && !c.tree.messages && !c.tree.branch,
      ),
  );
  check(
    'each worker receives only its four-field task, without conversation id',
    workers.every(
      (c) =>
        Object.keys(JSON.parse(c.text)).sort().join() === 'description,excerpt,intent,title' &&
        !c.text.includes(tree.id),
    ),
  );
  if (providerName === 'claude') {
    check(
      'fresh Claude sessions disable tools, settings, slash commands and MCP',
      new Set(launches.map((l) => l.args[l.args.indexOf('--session-id') + 1])).size ===
        launches.length &&
        launches.every(
          (l) =>
            !l.args.includes('--resume') &&
            l.args[l.args.indexOf('--tools') + 1] === '' &&
            l.args[l.args.indexOf('--setting-sources') + 1] === '' &&
            l.args.includes('--disable-slash-commands') &&
            l.args.includes('--strict-mcp-config') &&
            l.args[l.args.indexOf('--mcp-config') + 1] === '{"mcpServers":{}}',
        ),
    );
  } else
    check(
      'native Codex app-server disables shell, patches, REPL, code, apps, skills and search',
      launches.length === 1 &&
        ['shell_tool', 'apply_patch_freeform', 'js_repl', 'code_mode', 'apps', 'skills'].every(
          (f) => launches[0].args.includes(`features.${f}=false`),
        ) &&
        launches[0].args.includes('web_search="disabled"'),
    );
}
try {
  await b('open', origin);
  await b('set', 'viewport', '1280', '1400');
  await b('eval', "localStorage.setItem('treetutor.appearance', 'system'); true");
  mkdirSync(`${verifyOut}/diagram-steps`, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    await b('set', 'media', scheme, 'reduced-motion');
    await b('reload');
    await b('wait', '--fn', `document.body.textContent.includes(${JSON.stringify(saved.title)})`);
    await b('find', 'role', 'button', 'click', '--name', saved.title, '--exact');
    await b('find', 'role', 'button', 'click', '--name', `Open ${saved.title}`, '--exact');
    await b(
      'wait',
      '--fn',
      `[...document.querySelectorAll('.diagram-card')].every(c=>c.dataset.state!=='pending' && (c.dataset.state==='failed' || c.querySelector('img')?.naturalWidth>0)) && document.querySelectorAll('.diagram-card').length===${artifacts.length}`,
    );
    const states = JSON.parse(
      await b(
        'eval',
        `[...document.querySelectorAll('.diagram-card')].map(c=>({state:c.dataset.state,alt:c.querySelector('img')?.alt,description:c.querySelector('[id$="-description"]').textContent}))`,
        '--json',
      ),
    ).data.result;
    check(
      `${scheme}: actual Mermaid images load with matching visible text alternatives`,
      states.length > 1 && states.every((s) => s.state === 'ready' && s.alt === s.description),
    );
    for (const [i, artifact] of artifacts.entries()) {
      const selector = `.diagram-card[data-artifact="${artifact.id}"]`;
      await b(
        'eval',
        `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'}); true`,
      );
      const file = resolve(`${verifyOut}/diagram-steps/${scheme}-${i + 1}.png`);
      await b('screenshot', selector, file);
      screenshots.push(file);
    }
    await b(
      'eval',
      `document.querySelector('.diagram-card')?.scrollIntoView({block:'start'}); true`,
    );
    const file = resolve(`${verifyOut}/diagram-steps/${scheme}.png`);
    await b('screenshot', '--full', file);
    screenshots.push(file);
  }
  if (reused) check('reopening saved examples starts no model generation', calls.length === 0);
} catch (error) {
  check('browser verification completed', false);
  errors.push(error.message);
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
  await releaseAuth?.();
}
const result = {
  date: new Date().toISOString(),
  dir,
  evidence:
    'Live native tutor and isolated diagram workers; real Chromium rendering. Readability is a separate review of the screenshots.',
  provider: providerName,
  model,
  reused: !!reused,
  seconds: Math.round((Date.now() - started) / 1000),
  reply: saved.messages.at(-1).text,
  artifacts,
  screenshots,
  checks,
  errors,
  usage,
  pass: checks.every((c) => c.pass),
};
console.log(JSON.stringify(result, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
process.exit(result.pass ? 0 : 1);
