import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkManimDependencies, detectManim, MANIM_VERSION } from '../../server/media/manim.mjs';
import { ensureManim } from '../../scripts/manim-setup.mjs';

function probes(missing = [], version = MANIM_VERSION) {
  return (command) => ({
    status: missing.includes(command) ? 1 : 0,
    stdout: version + '\n',
    stderr: 'fixture import error',
  });
}

for (const [platform, headers, latex] of [
  [
    'linux',
    'sudo apt install build-essential python3-dev pkg-config libcairo2-dev libpango1.0-dev',
    'sudo apt install texlive-full',
  ],
  ['darwin', 'brew install pkg-config cairo pango', 'brew install --cask mactex-no-gui'],
]) {
  test(`${platform}: dependency probes pass, or give exact commands for missing headers and LaTeX`, () => {
    assert.doesNotThrow(() => checkManimDependencies({ platform, probe: probes() }));
    for (const [missing, commands] of [
      [['pkg-config'], [headers]],
      [['latex'], [latex]],
      [['dvisvgm'], [latex]],
      [
        ['pkg-config', 'latex'],
        [headers, latex],
      ],
    ]) {
      assert.throws(
        () => checkManimDependencies({ platform, probe: probes(missing) }),
        (error) => {
          for (const command of commands) assert.ok(error.message.includes('Run: ' + command));
          assert.match(error.message, /run npm start/);
          return true;
        },
      );
    }
    assert.throws(
      () =>
        checkManimDependencies({
          platform,
          probe: () => ({ error: new Error('ENOENT'), status: null }),
        }),
      /Run:/,
    );
  });
}

test('runtime detection returns project-local Python and pinned version; broken Manim is unavailable, never thrown', () => {
  const root = '/project with spaces';
  const python = join(root, '.venv/bin/python');
  assert.deepEqual(detectManim({ root, probe: probes() }), {
    ready: true,
    python,
    version: MANIM_VERSION,
  });
  for (const probe of [probes([python]), probes([], '0.19.0'), probes(['latex'])]) {
    const result = detectManim({ root, probe });
    assert.equal(result.ready, false);
    assert.match(result.error, /Manim unavailable:[\s\S]*npm start/);
  }
});

test('first run provisions a local Python environment and pinned Manim; later starts need no uv', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rabbithole-manim-'));
  const python = join(root, '.venv/bin/python');
  let installed = false;
  const probe = (command) => probes(installed ? [] : [python])(command);
  const calls = [],
    logs = [];
  const result = await ensureManim({
    root,
    probe,
    log: (line) => logs.push(line),
    run: async (command, args) => {
      calls.push([command, args]);
      if (args[0] === 'pip') installed = true;
      return 0;
    },
  });
  assert.equal(result.ready, true);
  assert.deepEqual(calls, [
    ['uv', ['venv', '--python', '3.12', join(root, '.venv')]],
    ['uv', ['pip', 'install', '--python', python, `manim==${MANIM_VERSION}`]],
  ]);
  assert.match(logs.at(-1), /Manim ready:/);
  assert.equal(
    (await ensureManim({ root, probe: probes(['uv']), run: assert.fail, log: () => {} })).ready,
    true,
  );
});

test('an interrupted or wrong-version install repairs the existing environment without replacing it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rabbithole-manim-repair-'));
  mkdirSync(join(root, '.venv/bin'), { recursive: true });
  writeFileSync(join(root, '.venv/bin/python'), 'existing environment fixture');
  let version = '0.19.0';
  const result = await ensureManim({
    root,
    probe: (command) => probes([], version)(command),
    log: () => {},
    run: async (command, args) => {
      assert.equal(args[0], 'pip');
      version = MANIM_VERSION;
      return 0;
    },
  });
  assert.equal(result.ready, true);
});

test('startup stops for missing prerequisites, failed installation or an unusable installed Manim', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rabbithole-manim-failure-'));
  const python = join(root, '.venv/bin/python');
  await assert.rejects(
    ensureManim({ root, probe: probes(['latex']), run: assert.fail }),
    /sudo apt install texlive-full/,
  );
  await assert.rejects(
    ensureManim({ root, probe: probes([python, 'uv']), run: assert.fail }),
    /https:\/\/astral.sh\/uv\/install.sh/,
  );
  await assert.rejects(
    ensureManim({ root, platform: 'darwin', probe: probes([python, 'uv']), run: assert.fail }),
    /brew install uv/,
  );
  await assert.rejects(
    ensureManim({ root, probe: probes([python]), run: async () => 1, log: () => {} }),
    /Manim setup failed: uv venv/,
  );
  await assert.rejects(
    ensureManim({
      root,
      probe: probes([python]),
      run: async () => {
        throw new Error('uv ENOENT');
      },
      log: () => {},
    }),
    /Could not start uv: uv ENOENT/,
  );
  await assert.rejects(
    ensureManim({ root, probe: probes([python]), run: async () => 0, log: () => {} }),
    /Manim unavailable: fixture import error/,
  );
});
