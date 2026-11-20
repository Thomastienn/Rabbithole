import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    readFileSync,
    cpSync,
    symlinkSync,
    writeFileSync,
    appendFileSync,
    mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIsCurrent, recordBuild } from '../../scripts/build-state.mjs';
import { launch } from '../support/startup-kit.mjs';
import { MANIM_VERSION } from '../../server/media/manim.mjs';

test('one start command builds absent or changed assets and reuses a current build', async () => {
    const checkout = mkdtempSync(join(tmpdir(), 'rabbithole-launcher-'));
    const data = mkdtempSync(join(tmpdir(), 'rabbithole-launcher-data-'));
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
    writeFileSync('dist/index.html', '<!doctype html><title>Rabbithole build fixture</title>');
    appendFileSync('builds', 'built\\n');
  `,
    );
    const env = { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: join(data, 'signed-out-claude') };
    // Manim/system-library fixtures keep launcher checks offline; native provisioning is checked separately.
    mkdirSync(join(checkout, '.venv/bin'), { recursive: true });
    writeFileSync(join(checkout, '.venv/bin/python'), `#!/bin/sh\nprintf '${MANIM_VERSION}\\n'\n`, {
        mode: 0o700,
    });
    for (const tool of ['pkg-config', 'latex', 'dvisvgm'])
        writeFileSync(join(data, tool), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    // A fresh launch never installs web search; uv fails loudly if it is tried, without network in tests.
    writeFileSync(
        join(data, 'uv'),
        '#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\necho "offline install fixture" >&2\nexit 1\n',
        { mode: 0o700 },
    );
    env.PATH = data + ':' + process.env.PATH;
    async function startAndStop() {
        const running = launch(data, 0, env, checkout, ['scripts/start.mjs', '--port', '0']);
        try {
            const [, origin] = await running.waitFor(/Rabbithole: (http:\/\/127\.0\.0\.1:\d+)/);
            assert.match(await (await fetch(origin)).text(), /Rabbithole build fixture/);
            assert.match(running.output(), /Manim ready:/);
            const search = await (await fetch(origin + '/api/settings/searxng')).json();
            assert.equal(search.ready, false);
            assert.equal(search.url, null);
            assert.match(search.error, /Web search is not downloaded/);
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
        assert.doesNotMatch(failed.output(), /Rabbithole: http/);
    } finally {
        await failed.stop();
    }
    // Missing headers, not LaTeX: a missing LaTeX would download TinyTeX, which this offline test avoids.
    writeFileSync(join(data, 'pkg-config'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    const missingHeaders = launch(data, 0, env, checkout, ['scripts/start.mjs']);
    try {
        assert.equal(await missingHeaders.exited, 1);
        assert.match(missingHeaders.output(), /sudo apt install .*libcairo2-dev/);
        assert.doesNotMatch(missingHeaders.output(), /Building|Rabbithole: http/);
    } finally {
        await missingHeaders.stop();
    }
});

test('unsupported Node gives an actionable requirement before trying to load the app', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rabbithole-old-node-'));
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
