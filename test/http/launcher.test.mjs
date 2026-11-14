import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  cpSync,
  symlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIsCurrent, recordBuild } from '../../scripts/build-state.mjs';
import { launch } from '../support/startup-kit.mjs';

test('one start command builds absent or changed assets and reuses a current build', async () => {
  const checkout = mkdtempSync(join(tmpdir(), 'treetutor-launcher-'));
  const data = mkdtempSync(join(tmpdir(), 'treetutor-launcher-data-'));
  for (const path of ['scripts', 'server', 'src'])
    cpSync(path, join(checkout, path), { recursive: true });
  for (const path of ['index.html', 'package-lock.json', 'tsconfig.json', 'vite.config.ts'])
    cpSync(path, join(checkout, path));
  symlinkSync(join(process.cwd(), 'node_modules'), join(checkout, 'node_modules'), 'dir');
  // Fixture build subprocess: launcher/server are real; full TypeScript/Vite build runs in delivery checks.
  writeFileSync(
    join(checkout, 'package.json'),
    JSON.stringify({
      type: 'module',
      scripts: {
        start: 'node scripts/start.mjs',
        build: 'node build-fixture.mjs && node scripts/build-state.mjs',
      },
    }),
  );
  writeFileSync(
    join(checkout, 'build-fixture.mjs'),
    `
    import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
    mkdirSync('dist', { recursive: true });
    writeFileSync('dist/index.html', '<!doctype html><title>TreeTutor build fixture</title>');
    appendFileSync('builds', 'built\\n');
  `,
  );
  const env = { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: join(data, 'signed-out-claude') };
  async function startAndStop() {
    const running = launch(data, 0, env, checkout, ['scripts/start.mjs', '--port', '0']);
    try {
      const [, origin] = await running.waitFor(/TreeTutor: (http:\/\/127\.0\.0\.1:\d+)/);
      assert.match(await (await fetch(origin)).text(), /TreeTutor build fixture/);
      return running.output();
    } finally {
      await running.stop();
    }
  }
  assert.match(await startAndStop(), /Building.*missing or stale/);
  assert.equal(readFileSync(join(checkout, 'builds'), 'utf8'), 'built\n');
  const previous = process.cwd();
  try {
    process.chdir(checkout);
    assert.equal(buildIsCurrent(), true);
    appendFileSync('src/shell/main.tsx', '\n// Changed source fixture\n');
    assert.equal(buildIsCurrent(), false);
    recordBuild();
    assert.equal(buildIsCurrent(), true);
    writeFileSync('dist/index.html', 'Stale output');
    assert.equal(buildIsCurrent(), false);
    recordBuild();
    assert.equal(buildIsCurrent(), true);
  } finally {
    process.chdir(previous);
  }
  writeFileSync(join(checkout, 'build-fixture.mjs'), 'process.exit(7);');
  appendFileSync(join(checkout, 'src/shell/main.tsx'), '\n// Requires another build\n');
  const failed = launch(data, 0, env, checkout, ['scripts/start.mjs']);
  try {
    assert.equal(await failed.exited, 1);
    assert.match(failed.output(), /npm run build failed.*npm start again/);
    assert.doesNotMatch(failed.output(), /TreeTutor: http/);
  } finally {
    await failed.stop();
  }
});

test('unsupported Node gives an actionable requirement before trying to load the app', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-old-node-'));
  // Runtime-version fixture; this verifies the diagnostic branch, not execution on an installed Node 22.
  const running = launch(dir, 0, {}, process.cwd(), [
    '--input-type=module',
    '-e',
    "Object.defineProperty(process.versions, 'node', { value: '22.0.0' }); await import('./scripts/start.mjs');",
  ]);
  try {
    assert.equal(await running.exited, 1);
    assert.match(running.output(), /requires Node 24 or newer; found 22.0.0/);
    assert.match(running.output(), /nodejs.org/);
    assert.match(running.output(), /npm start/);
    assert.doesNotMatch(running.output(), /ERR_UNKNOWN|node:sqlite|Building/);
  } finally {
    await running.stop();
  }
});
