// Builds the app, runs the smoke browser scripts (isolated store, synthetic providers) in a worker pool
// (VERIFY_JOBS, default min(4, cpus/2); VERIFY_JOBS=1 is serial)
// and prints a pass/fail table. Exit is non-zero on any failure. Usage: npm run verify
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
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

const only = process.argv.slice(2);
const scripts = readdirSync(import.meta.dirname)
  .filter(
    (f) =>
      /^verify-.+\.mjs$/.test(f) && f !== 'verify-all.mjs' && (!only.length || only.includes(f)),
  )
  .sort();
if (spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }).status !== 0) process.exit(1);
const logs = mkdtempSync(join(tmpdir(), 'rabbithole-verify-'));
const jobs = Math.max(
  1,
  Number(process.env.VERIFY_JOBS) || Math.min(4, availableParallelism() >> 1),
);
const attempt = (f, log) =>
  new Promise((done) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, f)], {
      timeout: 300000,
      detached: true,
    });
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
  // One retry: agent-browser clicks sometimes land on a node mid-layout; a pass on retry shows as FLAKY.
  const first = await attempt(f, log),
    ok = first || (await attempt(f, log)),
    secs = `${((Date.now() - started) / 1000).toFixed(0)}s`;
  const status = ok ? (first ? 'PASS' : 'FLAKY') : 'FAIL';
  console.log(`${f} ... ${status} (${secs})`);
  return [
    f,
    status,
    ok ? (first ? secs : `${secs}; failed once, passed on retry`) : `${secs}; log ${log}`,
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
  `\n${count('PASS')} passed, ${count('FLAKY')} flaky, ${count('FAIL')} failures, ${count('SKIP')} skipped (live)`,
);
process.exit(count('FAIL') ? 1 : 0);
