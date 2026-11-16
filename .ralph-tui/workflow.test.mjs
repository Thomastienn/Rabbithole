import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const tracker = process.argv[2] || 'beads-resume';
const pluginPath = join(homedir(), '.config', 'ralph-tui', 'plugins', 'trackers', 'beads-resume.js');
const autoCommit = /^autoCommit\s*=\s*true\s*$/m.test(readFileSync(join(import.meta.dir, 'config.toml'), 'utf8'));
const projectSandbox = spawnSync('codex', ['sandbox', '-c', 'sandbox_mode="workspace-write"', '--', 'true'], {
  cwd: join(import.meta.dir, '..'), encoding: 'utf8',
});
assert.equal(projectSandbox.status, 0, `Actual project sandbox must start: ${projectSandbox.stderr}`);
const cwd = mkdtempSync(join(tmpdir(), 'rabbithole-ralph-test-'));
const cli = realpathSync(Bun.which('ralph-tui'));
const bd = (...args) => execFileSync('bd', args, { cwd, encoding: 'utf8' }).trim();
console.log(`Fixture directory: ${cwd}`);
execFileSync('git', ['init', '-q'], { cwd });
bd('init', '--prefix', 'workflowtest', '--quiet');
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
git('config', 'user.name', 'Workflow fixture');
git('config', 'user.email', 'workflow@example.invalid');
writeFileSync(join(cwd, '.gitignore'), '.beads/\n.beads.gate.lock\n.ralph-tui/\nfake-codex\nagent-count\n');
writeFileSync(join(cwd, 'unrelated.txt'), 'original\n');
git('add', '.gitignore', 'unrelated.txt');
git('commit', '-qm', 'Fixture baseline');
const create = (title, extra = []) => JSON.parse(bd('create', '--title', title, '--description', 'Synthetic workflow regression fixture.', '--json', ...extra)).id;
const epic = create('Fixture epic', ['--type', 'epic']);
const first = create('Incomplete first pass', ['--parent', epic]);
const second = create('Next task', ['--parent', epic]);
const blocked = create('Human decision', ['--parent', epic]);
bd('dep', 'add', second, first);
bd('update', blocked, '--status', 'blocked');
bd('export', '-o', '.beads/issues.jsonl');
git('add', '-f', '.beads/issues.jsonl');
git('commit', '-qm', 'Fixture open issues');
const baseline = git('rev-parse', 'HEAD');
writeFileSync(join(cwd, 'unrelated.txt'), 'pre-existing staged edit\n');
git('add', 'unrelated.txt');
writeFileSync(join(cwd, 'unrelated.txt'), 'pre-existing unstaged edit\n');
mkdirSync(join(cwd, '.ralph-tui'));
const fakeAgent = join(cwd, 'fake-codex');
writeFileSync(fakeAgent, `#!/usr/bin/env node
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
if (process.argv.includes('--version')) { console.log('codex-cli 0.167.0'); process.exit(0); }
if (!process.argv.includes('exec')) process.exit(91);
const countFile = ${JSON.stringify(join(cwd, 'agent-count'))};
const count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) + 1 : 1;
fs.writeFileSync(countFile, String(count));
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync('.ralph-tui/rendered-prompt.txt', prompt);
  if (count <= 2) {
    const assert = require('node:assert/strict');
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), ${JSON.stringify(baseline)}, 'Pending edits must not be committed before task completion');
    assert.equal(execFileSync('git', ['show', ':unrelated.txt'], { encoding: 'utf8' }), 'pre-existing staged edit\\n');
    assert.equal(fs.readFileSync('unrelated.txt', 'utf8'), 'pre-existing unstaged edit\\n');
  }
  // The engine runs outside this real Codex sandbox; agent Git writes stay denied.
  execFileSync('codex', ['sandbox', '-c', 'sandbox_mode="workspace-write"', '--',
    'python', '-c', 'from pathlib import Path; Path("task-result.js").write_text(' + JSON.stringify(String(count)) + ')']);
  // Follow the rendered commit instruction instead of assuming the engine commits.
  if (count > 1 && !${autoCommit}) {
    execFileSync('git', ['add', '--', 'task-result.js']);
    execFileSync('git', ['commit', '--only', '-m', 'chore: fixture task ' + count, '--', 'task-result.js']);
  }
  if (count > 1 && prompt.includes('bd export -o .beads/issues.jsonl')) {
    const id = prompt.match(/^ID: (.+)$/m)[1];
    execFileSync('bd', ['close', id, '--reason', 'Synthetic verified result']);
    execFileSync('bd', ['export', '-o', '.beads/issues.jsonl']);
  }
  console.log(JSON.stringify({ type: 'item.completed', item: {
    type: 'agent_message', text: count === 1 ? 'Partial progress; task unfinished.' : '<promise>COMPLETE</promise>'
  }}));
});
`, { mode: 0o755 });
writeFileSync(join(cwd, '.ralph-tui', 'config.toml'), `configVersion = "2.1"
agent = "codex"
tracker = "${tracker}"
command = ${JSON.stringify(fakeAgent)}
prompt_template = ${JSON.stringify(join(import.meta.dir, 'prompt.hbs'))}
maxIterations = 3
iterationDelay = 0
autoCommit = ${autoCommit}
[agentOptions]
fullAuto = false
`);
const ralph = () => spawnSync(process.execPath, [cli, 'run', '--headless', '--no-setup', '--epic', epic, '--iterations', '3', '--no-notify'], {
  cwd, encoding: 'utf8', timeout: 60000,
});
const runBase = git('rev-parse', 'HEAD');
const run = ralph();
assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
assert.ok(readdirSync(join(cwd, '.ralph-tui')).includes('iterations'),
  `Dirty staged/unstaged edits must allow agent work: ${run.stdout}\n${run.stderr}`);
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
assert.equal(git('rev-list', '--count', `${runBase}..HEAD`), '2', 'Each completed task must have a commit');
for (const sha of git('rev-list', `${runBase}..HEAD`).split('\n')) {
  const files = git('show', '--pretty=', '--name-only', sha).split('\n');
  assert.ok(files.includes('task-result.js'), 'Each completion must commit its sandboxed task change');
  if (!autoCommit) assert.deepEqual(files, ['task-result.js'], 'Agent commits must exclude unrelated edits');
}
if (autoCommit) assert.equal(git('status', '--porcelain'), '', 'Engine auto-commit stages all pending edits');
const rendered = readFileSync(join(cwd, '.ralph-tui', 'rendered-prompt.txt'), 'utf8');
assert.ok(rendered.includes(second), 'Ralph must render the selected task ID');
assert.ok(!rendered.includes('{{'), 'No unresolved template variables');
if (autoCommit) {
  const history = JSON.parse(execFileSync('bv', ['--robot-history'], { cwd, encoding: 'utf8' }));
  for (const id of [first, second]) {
    const item = history.histories[id];
    assert.equal(item?.status, 'closed', 'BV must see the closed exported issue');
    assert.ok(item.commits?.some(commit => commit.methods?.includes('co_committed') &&
      commit.files?.some(file => file.path === 'task-result.js')),
    `BV must correlate ${id} with its real Ralph code commit`);
  }
}

// A real blocker added during an iteration must prevent another attempt.
const { createBeadsTracker } = await import(join(dirname(cli), 'index.js'));
const makeTracker = tracker === 'beads' ? createBeadsTracker : (await import(pluginPath)).default;
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
if (tracker === 'beads-resume') {
  // A run that ends at its iteration limit leaves its task in_progress with uncommitted edits.
  const left = create('Left in progress by an ended run', ['--parent', epic]);
  bd('update', left, '--status', 'in_progress');
  writeFileSync(join(cwd, 'left.txt'), 'leftover\n');
  const t2 = makeTracker();
  await t2.initialize({ workingDir: cwd, epicId: epic });
  assert.equal((await t2.getNextTask())?.id, left, 'A new run must resume the unfinished task owning leftover edits');
  assert.equal(JSON.parse(bd('show', handedOff, '--json'))[0].status, 'in_progress', 'Other workers keep their claims');
  await t2.dispose();
}
console.log(`PASS: actual project sandbox starts; dirty start continues without an early commit; sandboxed agent edits produce two ${autoCommit ? 'engine auto-commits' : 'scoped agent commits'}; continuation, blockers and ownership stay enforced.`);
