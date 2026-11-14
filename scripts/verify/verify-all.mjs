// Builds the app, runs every fixture browser script (isolated store, synthetic providers) in a worker pool
// (VERIFY_JOBS, default min(4, cpus/2); VERIFY_JOBS=1 is serial)
// and prints a pass/fail table. Exit is non-zero only on a failure not already tracked. Usage: npm run verify
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';

// Need a live provider (native sign-in or app-owned consent); run them by hand.
const live = new Set([
  'verify-branch-compaction.mjs',
  'verify-branch-streaming-live.mjs',
  'verify-break-down-live.mjs',
  'verify-codex-history.mjs',
  'verify-diagram-live.mjs',
  'verify-diagram-steps-live.mjs',
  'verify-media-nested-live.mjs',
  'verify-narrated-video-live.mjs',
  'verify-provider-continuity-live.mjs',
  'verify-release-journey-live.mjs',
  'verify-smart-video-live.mjs',
  'verify-suggestion-phrases.mjs',
]);
// Failures already recorded in TreeTutor-cpi (one-line cause each); drop an entry when it is fixed.
const known = {
  'verify-compact-chat.mjs': 'TreeTutor-cpi: dark side panel layout assertion (savedText false)',
  'verify-different-version.mjs': 'TreeTutor-cpi: ready visual + video wait times out',
  'verify-narrated-playback.mjs': "TreeTutor-cpi: reads a past native run's deleted /tmp data dir",
  'verify-video-library.mjs':
    "TreeTutor-cpi: copies an MP4 from a past live run's deleted /tmp dir",
  'verify-visual-sandbox.mjs':
    'TreeTutor-cpi: figure.visual state wait can time out under parallel load',
  'verify-video-recovery.mjs':
    "TreeTutor-cpi: status 'Writing script and scenes…' where Creating/Rendering expected",
};
const args = { 'verify-local-delivery.mjs': (out) => [join(out, 'local-delivery-results.json')] };

const only = process.argv.slice(2);
const scripts = readdirSync(import.meta.dirname)
  .filter(
    (f) =>
      /^verify-.+\.mjs$/.test(f) && f !== 'verify-all.mjs' && (!only.length || only.includes(f)),
  )
  .sort();
if (spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }).status !== 0) process.exit(1);
const logs = mkdtempSync(join(tmpdir(), 'treetutor-verify-'));
// Children find this agent-browser wrapper first on PATH; lib/agent-browser-shim.mjs retries clicks refused as covered.
const bin = join(logs, 'bin'),
  real = spawnSync('sh', ['-c', 'command -v agent-browser'], { encoding: 'utf8' }).stdout.trim();
mkdirSync(bin);
writeFileSync(
  join(bin, 'agent-browser'),
  // Only clicks go through Node: a Node start per call slows Tab-loop scripts several-fold.
  `#!/bin/sh\ncase " $* " in *" click "*) exec "${process.execPath}" "${join(import.meta.dirname, 'lib/agent-browser-shim.mjs')}" "$@";; esac\nexec "${real}" "$@"\n`,
  { mode: 0o755 },
);
const env = {
  ...process.env,
  PATH: `${bin}:${process.env.PATH}`,
  VERIFY_REAL_AGENT_BROWSER: real,
};
const jobs = Math.max(
  1,
  Number(process.env.VERIFY_JOBS) || Math.min(4, availableParallelism() >> 1),
);
const attempt = (f, log) =>
  new Promise((done) => {
    const child = spawn(
      process.execPath,
      [join(import.meta.dirname, f), ...(args[f]?.(logs) ?? [])],
      {
        timeout: 300000,
        env,
        detached: true,
      },
    );
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => (out += `\n${e}`));
    // A helper the script forked (e.g. a fixture server) can outlive a crash and hold stderr open; end its group.
    child.on('exit', () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {}
    });
    child.on('close', (code, signal) => {
      writeFileSync(log, `${out}${signal ? `\nkilled by ${signal}` : ''}`);
      done(code === 0);
    });
  });
const runOne = async (f) => {
  if (live.has(f)) return [f, 'SKIP', 'needs a live provider'];
  const started = Date.now(),
    log = join(logs, f.replace('.mjs', '.log'));
  // One retry for unknown failures: agent-browser clicks sometimes land on a node mid-layout; a pass on retry shows as FLAKY.
  const first = await attempt(f, log),
    ok = first || (!known[f] && (await attempt(f, log))),
    secs = `${((Date.now() - started) / 1000).toFixed(0)}s`;
  const status = ok
    ? known[f]
      ? 'PASS (known fixed?)'
      : first
        ? 'PASS'
        : 'FLAKY'
    : known[f]
      ? 'KNOWN'
      : 'FAIL';
  console.log(`${f} ... ${status} (${secs})`);
  return [
    f,
    status,
    ok
      ? known[f]
        ? `${secs}; known entry may be stale (${known[f]})`
        : first
          ? secs
          : `${secs}; failed once, passed on retry`
      : `${known[f] ? `${known[f]}; ` : ''}${secs}; log ${log}`,
  ];
};
const rows = [];
let next = 0;
await Promise.all(
  Array.from({ length: jobs }, async () => {
    while (next < scripts.length) {
      const i = next++;
      rows[i] = await runOne(scripts[i]);
    }
  }),
);
const w = Math.max(...rows.map((r) => r[0].length));
console.log(`\n${'script'.padEnd(w)}  status  detail`);
for (const [f, s, d] of rows) console.log(`${f.padEnd(w)}  ${s.padEnd(6)}  ${d}`);
const count = (s) => rows.filter((r) => r[1].startsWith(s)).length;
console.log(
  `\n${count('PASS')} passed, ${count('FLAKY')} flaky, ${count('FAIL')} new failures, ${count('KNOWN')} known failures, ${count('SKIP')} skipped (live)`,
);
process.exit(count('FAIL') ? 1 : 0);
