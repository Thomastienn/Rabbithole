import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Fake CLIs only: no model calls. `work` holds the number of ready issues per epic; each Ralph run finishes one.
function fixture(work = { 'TreeTutor-7t3': 1 }) {
  const cwd = mkdtempSync(join(tmpdir(), 'treetutor-afk-'));
  for (const dir of ['scripts', '.ralph-tui', 'bin', '.config/ralph-tui/plugins/trackers']) mkdirSync(join(cwd, dir), { recursive: true });
  for (const file of ['ralph', 'ralph-codex', 'ralph-takeover.mjs', 'ralph-afk']) {
    copyFileSync(new URL(`../scripts/${file}`, import.meta.url), join(cwd, 'scripts', file));
    chmodSync(join(cwd, 'scripts', file), 0o755);
  }
  writeFileSync(join(cwd, '.config/ralph-tui/plugins/trackers/beads-resume.js'), '');
  writeFileSync(join(cwd, '.ralph-tui/epics'), '# fixture order\nTreeTutor-7t3\n\nTreeTutor-vm4\nTreeTutor-sh8\n');
  for (const [epic, n] of Object.entries(work)) writeFileSync(join(cwd, `work-${epic}`), String(n));
  const epicWork = flag => `"${cwd}/work-$(sed -n 's/.*${flag} \\([^ ]*\\).*/\\1/p' <<< "$*")"`;
  const bin = (name, body) => writeFileSync(join(cwd, 'bin', name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  bin('bd', `if [[ $1 == ready ]]; then jq -n --argjson n "$(cat ${epicWork('--parent')} 2>/dev/null || echo 0)" '[range($n)]'; else echo '[]'; fi`);
  bin('ralph-tui', `echo "$*" >> "${cwd}/runs"; f=${epicWork('--epic')}; echo $(( $(cat "$f") - 1 )) > "$f"`);
  // Limited until the first wait has passed, like a usage window that resets.
  const agent = name => bin(name, `if [[ " $FIXTURE_LIMITED " == *" ${name} "* && ! -e "${cwd}/sleeps" ]]; then echo "You've hit your usage limit" >&2; exit 1; fi; echo pong`);
  agent('claude');
  agent('codex');
  bin('sleep', `echo "$1" >> "${cwd}/sleeps"; [[ -z $FIXTURE_WAIT_ENDS_WORK ]] || rm -f "${cwd}"/work-*`);
  bin('date', `if [[ $1 == +%H ]]; then echo "\${FIXTURE_HOUR:-12}"; else exec /usr/bin/date "$@"; fi`);
  const read = name => existsSync(join(cwd, name)) ? readFileSync(join(cwd, name), 'utf8').trim().split('\n') : [];
  const run = (env = {}) => spawnSync('bash', [join(cwd, 'scripts/ralph-afk')], {
    cwd, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, HOME: cwd, PATH: `${cwd}/bin:${process.env.PATH}`, RALPH_CODEX_MODEL: 'gpt-6.1-sol', ...env },
  });
  return { run, runs: () => read('runs'), sleeps: () => read('sleeps') };
}

test('a limited Claude hands the task to Codex, which keeps the next task after Claude resets', () => {
  const f = fixture({ 'TreeTutor-7t3': 2 });
  const result = f.run({ FIXTURE_LIMITED: 'claude', RALPH_AFK_WAIT: '7' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  // The second cycle follows a wait, by which time the fixture's Claude limit has reset:
  // one task per run, and no switch back while Codex still answers.
  const codex = 'run --headless --epic TreeTutor-7t3 --agent codex --model gpt-6.1-sol --iterations 1';
  assert.deepEqual(f.runs(), [codex, codex]);
  assert.match(result.stdout, /No ready work/);
});

test('with every agent limited it waits, then starts once usage is back', () => {
  const f = fixture();
  const result = f.run({ FIXTURE_LIMITED: 'claude codex', RALPH_AFK_WAIT: '7' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.sleeps()[0], '7');
  assert.equal(f.runs().length, 1);
  assert.match(f.runs()[0], /--agent claude/);
});

test('the schedule picks the agent for the hour and runs nothing outside its windows', () => {
  const schedule = { RALPH_AFK_SCHEDULE: '00-06=codex 08-24=claude,codex' };
  const night = fixture();
  assert.equal(night.run({ ...schedule, FIXTURE_HOUR: '03' }).status, 0);
  assert.match(night.runs()[0], /--agent codex/);

  // 07:00 has no window: it must wait rather than launch.
  const gap = fixture();
  assert.equal(gap.run({ ...schedule, FIXTURE_HOUR: '07', FIXTURE_WAIT_ENDS_WORK: '1' }).status, 0);
  assert.deepEqual(gap.runs(), []);
  assert.equal(gap.sleeps().length, 1);
});

test('when an epic runs out of work it moves to the next one that has some', () => {
  const f = fixture({ 'TreeTutor-7t3': 1, 'TreeTutor-sh8': 1 });
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(f.runs().map(run => run.split(' ')[3]), ['TreeTutor-7t3', 'TreeTutor-sh8']);
});
