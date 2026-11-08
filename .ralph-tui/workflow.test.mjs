import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const tracker = process.argv[2] || 'treetutor-beads';
const cwd = mkdtempSync(join(tmpdir(), 'treetutor-ralph-test-'));
const cli = realpathSync(Bun.which('ralph-tui'));
const bd = (...args) => execFileSync('bd', args, { cwd, encoding: 'utf8' }).trim();
console.log(`Fixture directory: ${cwd}`);
execFileSync('git', ['init', '-q'], { cwd });
bd('init', '--prefix', 'workflowtest', '--quiet');
const create = (title, extra = []) => JSON.parse(bd('create', '--title', title, '--description', 'Synthetic workflow regression fixture.', '--json', ...extra)).id;
const epic = create('Fixture epic', ['--type', 'epic']);
const first = create('Incomplete first pass', ['--parent', epic]);
const second = create('Next task', ['--parent', epic]);
const blocked = create('Human decision', ['--parent', epic]);
bd('dep', 'add', second, first);
bd('update', blocked, '--status', 'blocked');
mkdirSync(join(cwd, '.ralph-tui'));
const fakeAgent = join(cwd, 'fake-codex');
writeFileSync(fakeAgent, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('codex-cli 0.167.0'); process.exit(0); }
if (!process.argv.includes('exec')) process.exit(91);
const countFile = ${JSON.stringify(join(cwd, 'agent-count'))};
const count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) + 1 : 1;
fs.writeFileSync(countFile, String(count));
process.stdin.resume();
process.stdin.on('end', () => console.log(JSON.stringify({ type: 'item.completed', item: {
  type: 'agent_message', text: count === 1 ? 'Partial progress; task unfinished.' : '<promise>COMPLETE</promise>'
}})));
`, { mode: 0o755 });
writeFileSync(join(cwd, '.ralph-tui', 'config.toml'), `configVersion = "2.1"
agent = "codex"
tracker = "${tracker}"
command = ${JSON.stringify(fakeAgent)}
prompt_template = ${JSON.stringify(join(import.meta.dir, 'prompt.hbs'))}
maxIterations = 3
iterationDelay = 0
autoCommit = false
[agentOptions]
fullAuto = false
`);
const run = spawnSync(process.execPath, [cli, 'run', '--headless', '--no-setup', '--epic', epic, '--iterations', '3', '--no-notify'], {
  cwd, encoding: 'utf8', timeout: 60000,
});
assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
const logsDir = join(cwd, '.ralph-tui', 'iterations');
const iterations = readdirSync(logsDir).map(file => {
  const log = readFileSync(join(logsDir, file), 'utf8');
  return {
    iteration: Number(log.match(/^# Iteration (\d+)/m)[1]),
    task: log.match(/\*\*Task ID\*\*: (.+)/)[1],
    complete: /\*\*Task Completed\*\*: Yes/.test(log),
  };
}).sort((a, b) => a.iteration - b.iteration);
console.log(JSON.stringify(iterations));
assert.equal(iterations.length, 3, 'Unfinished first pass must continue to a second iteration');
assert.deepEqual(iterations.map(i => i.task), [first, first, second]);
assert.deepEqual(iterations.map(i => i.complete), [false, true, true]);
assert.equal(JSON.parse(bd('show', blocked, '--json'))[0].status, 'blocked');

// A real blocker added during an iteration must prevent another attempt.
const { createBeadsTracker } = await import(join(dirname(cli), 'index.js'));
const makeTracker = tracker === 'beads' ? createBeadsTracker : (await import('./treetutor-beads.js')).default;
const t = makeTracker();
await t.initialize({ workingDir: cwd, epicId: epic });
const gated = create('Becomes blocked', ['--parent', epic]);
assert.equal((await t.getNextTask()).id, gated);
await t.updateTaskStatus(gated, 'in_progress');
bd('dep', 'add', gated, blocked);
assert.equal(await t.getNextTask(), undefined, 'New dependencies must stop retries');
assert.equal(JSON.parse(bd('show', blocked, '--json'))[0].status, 'blocked');
const userBlocked = create('Needs user action', ['--parent', epic]);
assert.equal((await t.getNextTask()).id, userBlocked);
bd('update', userBlocked, '--status', 'blocked');
assert.equal(await t.getNextTask(), undefined, 'Explicitly blocked issues must not be reopened');
const handedOff = create('Ownership changes', ['--parent', epic]);
assert.equal((await t.getNextTask()).id, handedOff);
bd('update', handedOff, '--status', 'in_progress', '--assignee', 'another-worker');
assert.equal(await t.getNextTask(), undefined, 'Other workers must not lose their claims');
assert.equal(JSON.parse(bd('show', handedOff, '--json'))[0].status, 'in_progress');
await t.dispose();
console.log('PASS: unfinished work continues, next task runs, blockers and ownership stay enforced.');
