import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ensureSearxng, SEARXNG_SOURCE } from '../../scripts/searxng-setup.mjs';
import { managedSearxng } from '../../server/searxng.mjs';

const directory = () => mkdtempSync(join(tmpdir(), 'treetutor-searxng-unit-'));
const quiet = () => {};

test('first setup uses dedicated venv and pinned source; settings enable JSON and private binding', async () => {
  const dir = directory(),
    calls = [];
  let installed = false;
  const result = await ensureSearxng({
    dir,
    log: quiet,
    probe: (command) => ({ status: command === 'uv' || installed ? 0 : 1 }),
    run: async (command, args, options) => {
      calls.push([command, args]);
      assert.equal(options.cwd, join(dir, 'searxng'));
      assert.equal(options.env.SEARXNG_SETTINGS_PATH, join(dir, 'searxng/settings.yml'));
      assert.equal(options.env.TMPDIR, join(dir, 'searxng/cache'));
      if (args.includes(SEARXNG_SOURCE)) installed = true;
      return 0;
    },
  });
  const python = join(dir, 'searxng/venv/bin/python');
  assert.equal(result.ready, true);
  assert.equal(result.python, python);
  assert.deepEqual(calls, [
    ['uv', ['venv', '--python', '3.12', join(dir, 'searxng/venv')]],
    [
      'uv',
      [
        'pip',
        'install',
        '--python',
        python,
        'setuptools==84.2.1',
        'pyyaml==6.0.3',
        'msgspec==0.22.0',
        'typing-extensions==4.16.0',
      ],
    ],
    ['uv', ['pip', 'install', '--python', python, '--no-build-isolation', SEARXNG_SOURCE]],
  ]);
  const path = join(dir, 'searxng/settings.yml');
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(settings.search.formats, ['html', 'json']);
  assert.equal(settings.general.debug, false);
  assert.equal(settings.server.bind_address, '127.0.0.1');
  assert.equal(settings.server.port, 0);
  assert.equal(settings.server.limiter, false);
  assert.match(settings.server.secret_key, /^[a-f0-9]{64}$/);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const other = directory();
  await ensureSearxng({ dir: other, probe: () => ({ status: 0 }), run: assert.fail, log: quiet });
  assert.notEqual(
    JSON.parse(readFileSync(join(other, 'searxng/settings.yml'))).server.secret_key,
    settings.server.secret_key,
  );
});

test('restarts verify provenance offline, preserve secret, and ignore inherited SearXNG settings', async (t) => {
  const dir = directory();
  const path = join(dir, 'searxng/settings.yml');
  mkdirSync(join(dir, 'searxng'));
  const secret = 'a'.repeat(64);
  writeFileSync(path, JSON.stringify({ server: { secret_key: secret, bind_address: '0.0.0.0' } }), {
    mode: 0o600,
  });
  const previous = process.env.SEARXNG_BIND_ADDRESS;
  process.env.SEARXNG_BIND_ADDRESS = '0.0.0.0';
  t.after(() => {
    if (previous === undefined) delete process.env.SEARXNG_BIND_ADDRESS;
    else process.env.SEARXNG_BIND_ADDRESS = previous;
  });
  const result = await ensureSearxng({
    dir,
    log: quiet,
    run: assert.fail,
    probe: (command, args, options) => {
      assert.notEqual(command, 'uv');
      assert.ok(args[1].includes(SEARXNG_SOURCE));
      assert.equal(options.env.SEARXNG_BIND_ADDRESS, undefined);
      return { status: 0 };
    },
  });
  assert.equal(result.ready, true);
  assert.equal(JSON.parse(readFileSync(path)).server.secret_key, secret);
  assert.equal(JSON.parse(readFileSync(path)).server.bind_address, '127.0.0.1');
});

test('partial or wrong-source install repairs existing venv; failed installs retry next start', async () => {
  const dir = directory(),
    python = join(dir, 'searxng/venv/bin/python');
  mkdirSync(join(dir, 'searxng/venv/bin'), { recursive: true });
  writeFileSync(python, 'partial environment');
  let installed = false,
    runs = 0;
  const options = {
    dir,
    log: quiet,
    probe: (command) => ({ status: command === 'uv' || installed ? 0 : 1 }),
  };
  const failed = await ensureSearxng({ ...options, run: async () => 1 });
  assert.equal(failed.ready, false);
  const result = await ensureSearxng({
    ...options,
    run: async (command, args) => {
      assert.equal(args[0], 'pip');
      installed = args.includes(SEARXNG_SOURCE);
      runs++;
      return 0;
    },
  });
  assert.equal(result.ready, true);
  assert.equal(runs, 2);
});

test('missing uv, network failure, unusable install, storage failure and abort return readable reasons', async () => {
  for (const [options, reason] of [
    [{ probe: () => ({ status: 1 }), run: assert.fail }, /Install uv/],
    [
      {
        probe: (command) => ({ status: command === 'uv' ? 0 : 1 }),
        run: async () => {
          throw new Error('network offline');
        },
      },
      /network offline/,
    ],
    [
      { probe: (command) => ({ status: command === 'uv' ? 0 : 1 }), run: async () => 0 },
      /could not be imported/,
    ],
    [{ signal: AbortSignal.abort(new Error('Stopped')), run: assert.fail }, /Stopped/],
  ]) {
    const result = await ensureSearxng({ dir: directory(), log: quiet, ...options });
    assert.equal(result.ready, false);
    assert.match(result.error, reason);
    assert.match(result.error, /restart npm start/);
  }
  const dir = directory();
  writeFileSync(join(dir, 'searxng'), 'file blocks directory');
  assert.equal((await ensureSearxng({ dir, log: quiet, run: assert.fail })).ready, false);
});

function runtime() {
  const child = new EventEmitter();
  Object.assign(child, {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null,
    signalCode: null,
  });
  const timers = new Map();
  child.kill = (signal) => {
    child.signalCode = signal;
    queueMicrotask(() => child.emit('close', null, signal));
    return true;
  };
  return {
    child,
    timers,
    options: {
      setup: async () => ({ ready: true, python: '/managed/python', options: {} }),
      launch: (command, args, options) => {
        assert.equal(command, '/managed/python');
        assert.ok(args[2].includes("make_server('127.0.0.1', 0"));
        assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
        return child;
      },
      schedule: (fn, delay) => {
        timers.set(delay, fn);
        return delay;
      },
      cancel: (id) => timers.delete(id),
      log: quiet,
    },
  };
}

test('runtime reports child readiness, stops with app, and updates status if child later exits', async () => {
  for (const unexpected of [false, true]) {
    const { child, timers, options } = runtime();
    const starting = managedSearxng('/data', options);
    await Promise.resolve();
    child.stdout.write('engine log\nTREETUTOR_SEARXNG=41234\n');
    const service = await starting;
    assert.deepEqual(service.status(), { ready: true, url: 'http://127.0.0.1:41234', error: null });
    assert.equal(timers.size, 0);
    if (unexpected) {
      child.stderr.write('engine crashed');
      child.exitCode = 3;
      child.emit('close', 3, null);
      assert.equal(service.status().ready, false);
      assert.equal(service.status().url, null);
      assert.match(service.status().error, /engine crashed/);
    }
    await service.stop();
    await service.stop();
    if (!unexpected) assert.equal(child.signalCode, 'SIGTERM');
    assert.equal(timers.size, 0);
  }
});

test('startup failures and timeout return unavailable status and reap child', async () => {
  for (const failure of ['exit', 'error', 'timeout', 'spawn', 'setup']) {
    const { child, timers, options } = runtime();
    if (failure === 'spawn')
      options.launch = () => {
        throw new Error('spawn denied');
      };
    if (failure === 'setup')
      options.setup = async () => ({ ready: false, error: 'uv unavailable' });
    const starting = managedSearxng('/data', options);
    await Promise.resolve();
    if (failure === 'exit') {
      child.stderr.write('bad settings');
      child.exitCode = 1;
      child.emit('close', 1, null);
    }
    if (failure === 'error') child.emit('error', new Error('ENOENT'));
    if (failure === 'timeout') timers.get(60000)();
    const service = await starting;
    assert.equal(service.status().ready, false);
    assert.equal(service.status().url, null);
    assert.match(service.status().error, /Search is unavailable/);
    if (failure === 'error') assert.match(service.status().error, /ENOENT/);
    if (failure === 'exit') assert.match(service.status().error, /bad settings/);
    if (failure === 'timeout') assert.match(service.status().error, /60 seconds/);
    assert.equal(timers.size, 0);
  }
});

test('shutdown escalates an unresponsive child; cancelled setup never launches a service', async () => {
  const { child, timers, options } = runtime();
  const kill = child.kill;
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    if (signal === 'SIGKILL') return kill(signal);
    return true;
  };
  const starting = managedSearxng('/data', options);
  await Promise.resolve();
  child.stdout.write('TREETUTOR_SEARXNG=41234\n');
  const service = await starting;
  const stopping = service.stop();
  timers.get(5000)();
  await stopping;
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(timers.size, 0);
  const cancelled = await managedSearxng('/data', {
    ...options,
    signal: AbortSignal.abort(new Error('App stopped')),
    launch: assert.fail,
  });
  assert.equal(cancelled.status().ready, false);
  assert.match(cancelled.status().error, /App stopped/);
});
