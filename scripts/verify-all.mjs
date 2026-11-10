// Builds the app, runs every fixture browser script (isolated store, synthetic providers) one by one
// and prints a pass/fail table. Exit is non-zero only on a failure not already tracked. Usage: npm run verify
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Need a live provider (native sign-in or app-owned consent); run them by hand.
const live = new Set(['verify-branch-compaction.mjs', 'verify-branch-streaming-live.mjs', 'verify-break-down-live.mjs',
  'verify-codex-history.mjs', 'verify-diagram-live.mjs', 'verify-media-nested-live.mjs',
  'verify-provider-continuity-live.mjs', 'verify-release-journey-live.mjs', 'verify-suggestion-phrases.mjs']);
// Failures already recorded in a bug; drop an entry when its bug is fixed.
const known = { 'verify-tree-overview.mjs': 'TreeTutor-wpc', 'verify-canvas-positions.mjs': 'TreeTutor-wpc',
  ...Object.fromEntries(['branch-streaming', 'break-down-ui', 'canvas-navigation', 'chat-management', 'chat-sidebar',
    'compact-controls', 'custom-endpoint', 'diagram-rendering', 'first-conversation', 'knowledge', 'large-map',
    'layout-restore', 'passage-corrections', 'polish', 'settings-window', 'vim-bindings'].map(n => [`verify-${n}.mjs`, 'TreeTutor-yms'])) };
const args = { 'verify-local-delivery.mjs': out => [join(out, 'local-delivery-results.json')] };

const only = process.argv.slice(2);
const scripts = readdirSync('scripts').filter(f => /^verify-.+\.mjs$/.test(f) && f !== 'verify-all.mjs' && (!only.length || only.includes(f))).sort();
if (spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }).status !== 0) process.exit(1);
const logs = mkdtempSync(join(tmpdir(), 'treetutor-verify-'));
const rows = [];
for (const f of scripts) {
  if (live.has(f)) { rows.push([f, 'SKIP', 'needs a live provider']); continue; }
  const started = Date.now();
  process.stdout.write(`${f} ... `);
  const log = join(logs, f.replace('.mjs', '.log'));
  const attempt = () => {
    const r = spawnSync(process.execPath, [join('scripts', f), ...(args[f]?.(logs) ?? [])], { encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20 });
    writeFileSync(log, `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n${r.error}` : ''}`);
    return r.status === 0;
  };
  // One retry: agent-browser clicks sometimes land on a node mid-layout; a pass on retry shows as FLAKY.
  const first = attempt(), ok = first || (!known[f] && attempt()), secs = `${((Date.now() - started) / 1000).toFixed(0)}s`;
  const status = ok ? (known[f] ? 'PASS (known fixed?)' : first ? 'PASS' : 'FLAKY') : known[f] ? 'KNOWN' : 'FAIL';
  rows.push([f, status, ok ? (known[f] ? `${secs}; ${known[f]} may be closable` : first ? secs : `${secs}; failed once, passed on retry`) : `${known[f] ? `${known[f]}; ` : ''}${secs}; log ${log}`]);
  console.log(status);
}
const w = Math.max(...rows.map(r => r[0].length));
console.log(`\n${'script'.padEnd(w)}  status  detail`);
for (const [f, s, d] of rows) console.log(`${f.padEnd(w)}  ${s.padEnd(6)}  ${d}`);
const count = s => rows.filter(r => r[1].startsWith(s)).length;
console.log(`\n${count('PASS')} passed, ${count('FLAKY')} flaky, ${count('FAIL')} new failures, ${count('KNOWN')} known failures, ${count('SKIP')} skipped (live)`);
process.exit(count('FAIL') ? 1 : 0);
