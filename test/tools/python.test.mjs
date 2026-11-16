import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPython, OUTPUT_LIMIT, pythonTool, runPython } from '../../server/tools/python.mjs';
import { toolRunner } from '../../server/tools/runner.mjs';

// A fake venv whose python is a symlink, like uv's, so the sandbox can resolve its runtime.
function fakeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'rabbithole-py-'));
  mkdirSync(join(root, 'runtime', 'bin'), { recursive: true });
  mkdirSync(join(root, '.venv-python', 'bin'), { recursive: true });
  writeFileSync(join(root, 'runtime', 'bin', 'python3.12'), '');
  symlinkSync(
    join(root, 'runtime', 'bin', 'python3.12'),
    join(root, '.venv-python', 'bin', 'python'),
  );
  return root;
}

// Fake sandbox runner: records the call and lets the test drive output and exit.
function fakeSpawn(behave = (child) => child.finish(0)) {
  const calls = [];
  const spawn = (command, args) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: new PassThrough(),
      killed: null,
    });
    let code = '';
    child.stdin.on('data', (chunk) => (code += chunk));
    child.finish = (status) => {
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit('close', status));
    };
    child.kill = (signal) => {
      child.killed = signal;
      child.finish(null);
    };
    calls.push({ command, args, child, code: () => code });
    child.stdin.on('finish', () => behave(child));
    return child;
  };
  return { spawn, calls };
}

test('run_python sends code to a fresh bwrap sandbox with no network, hidden home and data, writable workspace', async () => {
  const root = fakeRoot(),
    dir = join(root, 'data');
  const { spawn, calls } = fakeSpawn((child) => {
    child.stdout.write('42\n');
    child.stderr.write('warning\n');
    child.finish(0);
  });
  const tool = pythonTool({ dir, root, check: async () => true, spawn });
  const turn = { conversation: 'c1', signal: new AbortController().signal };
  const output = await tool.run({ code: 'print(6*7)' }, turn);
  assert.equal(output, 'Exit code: 0\n--- stdout ---\n42\n\n--- stderr ---\nwarning\n');
  const [{ command, args, code }] = calls;
  assert.equal(command, 'bwrap');
  assert.equal(code(), 'print(6*7)');
  const workspace = join(dir, 'python', 'c1');
  assert.ok(existsSync(workspace));
  const pair = (flag, path) =>
    args.some((a, i) => a === flag && args[i + 1] === path && args[i + 2] === path);
  for (const [flag, path] of [
    ['--tmpfs', homedir()],
    ['--tmpfs', dir],
  ])
    assert.equal(args[args.indexOf(path) - 1], flag, path);
  assert.ok(pair('--ro-bind', '/'));
  assert.ok(pair('--bind', workspace));
  assert.ok(pair('--ro-bind', join(root, 'runtime')));
  assert.ok(pair('--ro-bind', join(root, '.venv-python')));
  // Binds after the hiding tmpfs mounts, so only the workspace and venv reappear.
  assert.ok(args.indexOf('--bind') > args.indexOf(dir));
  for (const flag of ['--unshare-all', '--die-with-parent', '--clearenv'])
    assert.ok(args.includes(flag), flag);
  assert.deepEqual(args.slice(-4), [join(root, '.venv-python', 'bin', 'python'), '-I', '-B', '-']);

  // Each call is a fresh process.
  await tool.run({ code: 'print(1)' }, turn);
  assert.equal(calls.length, 2);
});

test('run_python validates code and time limit, kills at the limit and on abort, truncates output', async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'rabbithole-pyws-'));
  const base = { workspace, python: '/usr/bin/python3', dataDir: workspace };
  const { spawn } = fakeSpawn();
  for (const [input, message] of [
    [{ code: '' }, /needs Python code/],
    [{ code: 1 }, /needs Python code/],
    [{ code: 'x', timeout: 0 }, /1 to 240/],
    [{ code: 'x', timeout: 241 }, /1 to 240/],
    [{ code: 'x', timeout: 1.5 }, /1 to 240/],
  ])
    await assert.rejects(runPython(input, { ...base, spawn }), message);

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hung = fakeSpawn(() => {});
  const running = runPython(
    { code: 'while True: pass', timeout: 5 },
    { ...base, spawn: hung.spawn },
  );
  await new Promise(setImmediate);
  t.mock.timers.tick(4999);
  assert.equal(hung.calls[0].child.killed, null);
  t.mock.timers.tick(1);
  assert.equal(hung.calls[0].child.killed, 'SIGKILL');
  t.mock.timers.reset();
  assert.match(await running, /^Stopped: the time limit of 5 seconds was reached\./);

  // Default limit is 60 seconds.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const idle = fakeSpawn(() => {});
  const waiting = runPython({ code: 'x' }, { ...base, spawn: idle.spawn });
  await new Promise(setImmediate);
  t.mock.timers.tick(59999);
  assert.equal(idle.calls[0].child.killed, null);
  t.mock.timers.tick(1);
  t.mock.timers.reset();
  assert.match(await waiting, /time limit of 60 seconds/);

  const stop = new AbortController();
  const stuck = fakeSpawn(() => stop.abort());
  await assert.rejects(
    runPython({ code: 'x' }, { ...base, spawn: stuck.spawn, signal: stop.signal }),
    { name: 'AbortError' },
  );
  assert.equal(stuck.calls[0].child.killed, 'SIGKILL');
  const stopped = fakeSpawn();
  await assert.rejects(
    runPython({ code: 'x' }, { ...base, spawn: stopped.spawn, signal: AbortSignal.abort() }),
    { name: 'AbortError' },
  );
  assert.equal(stopped.calls.length, 0);

  const loud = fakeSpawn((child) => {
    child.stdout.write('a'.repeat(OUTPUT_LIMIT - 10));
    child.stdout.write('b'.repeat(30));
    child.stderr.write('e'.repeat(OUTPUT_LIMIT + 5));
    child.finish(1);
  });
  const output = await runPython({ code: 'x' }, { ...base, spawn: loud.spawn });
  assert.ok(output.startsWith('Exit code: 1\n'));
  assert.ok(
    output.includes(
      'a'.repeat(OUTPUT_LIMIT - 10) + 'b'.repeat(10) + '\n[… output truncated: 20 more characters]',
    ),
  );
  assert.ok(
    output.endsWith('e'.repeat(OUTPUT_LIMIT) + '\n[… output truncated: 5 more characters]'),
  );
});

test('run_python is listed for every capable provider only when ready and switched on', async () => {
  let ready = false;
  const python = { status: async () => ({ ready }), run: async (input) => `ran ${input.code}` };
  const runner = toolRunner({ python });
  const names = async (provider, settings) =>
    (await runner.tools({ provider, capable: true, settings })).map((d) => d.name);
  assert.ok(!(await names('openai:1')).includes('run_python'));
  ready = true;
  for (const provider of ['claude', 'codex', 'openai:1'])
    assert.ok((await names(provider)).includes('run_python'), provider);
  assert.ok(!(await names('claude', { run_python: false })).includes('run_python'));
  assert.deepEqual(await runner.tools({ provider: 'claude', capable: false }), []);
  const [definition] = await runner.tools({ provider: 'claude', capable: true });
  assert.match(definition.description, /cannot display files, figures or images/);
  assert.equal(definition.parameters.properties.timeout.maximum, 240);
  assert.equal(await runner.run('run_python', { code: '1' }, { conversation: 'c' }), 'ran 1');
  await assert.rejects(
    toolRunner().run('run_python', { code: '1' }, {}),
    /Offline Python is unavailable/,
  );
});

test('detectPython reports missing bubblewrap or venv with setup steps', async () => {
  const root = fakeRoot();
  const missing = (bad) => async (command) => command !== bad && !command.endsWith(bad);
  const noBwrap = await detectPython({ root, check: missing('bwrap') });
  assert.equal(noBwrap.ready, false);
  assert.equal(noBwrap.bwrap, false);
  assert.match(noBwrap.error, /bubblewrap is missing.*sudo apt install bubblewrap/);
  const noVenv = await detectPython({ root, check: missing('python') });
  assert.match(noVenv.error, /Python environment is missing.*npm start/);
  assert.deepEqual(await detectPython({ root, check: async () => true }), {
    ready: true,
    python: join(root, '.venv-python', 'bin', 'python'),
  });
});
