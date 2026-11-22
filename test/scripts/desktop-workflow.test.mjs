import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
    new URL('../../.github/workflows/desktop-build.yml', import.meta.url),
    'utf8',
);
const builder = JSON.parse(
    readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8'),
).build;
const job = (name) => workflow.split(/^ {2}(?=\w)/m).find((part) => part.startsWith(`${name}:`));

test('the desktop build runs only when the owner triggers it', () => {
    const on = workflow.match(/^on:\n((?: .*\n)+)/m)[1];
    assert.deepEqual(on.trim().split('\n'), ['workflow_dispatch:']);
});

test('each build job restores npm and Electron caches and uploads its installer', () => {
    for (const [name, os, installer] of [
        ['linux', 'ubuntu', '*.AppImage'],
        ['windows', 'windows', '*-setup.exe'],
    ]) {
        const steps = job(name);
        assert.match(steps, new RegExp(`runs-on: ${os}`));
        assert.match(steps, /cache: npm/);
        assert.match(steps, /desktop\/package-lock\.json/);
        assert.match(steps, /electron-builder/);
        assert.ok(steps.includes(`path: |\n            desktop/dist/${installer}\n`));
    }
    // Only the Windows sandbox launcher is Rust.
    assert.match(job('windows'), /workspaces: desktop\/sandbox -> target/);
});

test('each build job smoke-tests its own installer output before uploading it', () => {
    for (const [name, opens] of [
        ['linux', /desktop\/dist\/\*\.AppImage --appimage-extract/],
        ['windows', /desktop\/dist\/\*-setup\.exe\)\.FullName -ArgumentList '\/S'/],
    ]) {
        const steps = job(name);
        assert.match(steps, opens);
        const smoke = steps.indexOf('node scripts/desktop-smoke.mjs');
        assert.ok(
            steps.indexOf('npm run desktop:build') < smoke,
            `${name} smoke-tests after building`,
        );
        assert.ok(smoke < steps.indexOf('upload-artifact'), `${name} uploads only a passing build`);
    }
    assert.match(job('linux'), /apt-get install -y bubblewrap/);
});

test('the Windows build also uploads the sandbox zip that npm start downloads', () => {
    const steps = job('windows');
    assert.match(
        steps,
        /Compress-Archive -Path \$bins -DestinationPath rabbithole-sandbox-windows-x64\.zip/,
    );
    assert.match(steps, /path: rabbithole-sandbox-windows-x64\.zip/);
});

test('each build job stamps the version 1.0.<run_number> before building', () => {
    for (const name of ['linux', 'windows']) {
        const steps = job(name);
        const stamp = steps.search(
            /working-directory: desktop\n\s+run: npm version "1\.0\.\$\{\{ github\.run_number \}\}" --no-git-tag-version/,
        );
        assert.ok(stamp >= 0 && stamp < steps.indexOf('npm run desktop:build'), name);
    }
});

test('each build job uploads the updater metadata and blockmaps with its installer', () => {
    // electron-builder writes latest*.yml only with a publish provider; the AppImage embeds its blockmap.
    assert.deepEqual(builder.publish, {
        provider: 'github',
        owner: 'Thomastienn',
        repo: 'Rabbithole',
    });
    assert.ok(job('linux').includes('desktop/dist/latest-linux.yml'));
    assert.ok(job('windows').includes('desktop/dist/latest.yml'));
    assert.ok(job('windows').includes('desktop/dist/*-setup.exe.blockmap'));
});

test('the installers are built under the fixed names the README links to', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    for (const [config, name] of [
        [builder.linux, 'Rabbithole-linux-x86_64.AppImage'],
        [builder.nsis, 'Rabbithole-windows-x64-setup.exe'],
    ]) {
        assert.equal(config.artifactName.replace('${ext}', name.split('.').pop()), name);
        assert.ok(readme.includes(`releases/latest/download/${name}`), name);
    }
});

test('the Linux wheels workflow runs only by hand or from the Desktop build run', () => {
    const wheels = readFileSync(
        new URL('../../.github/workflows/linux-wheels.yml', import.meta.url),
        'utf8',
    );
    const on = wheels.match(/^on:\n((?: .*\n)+)/m)[1];
    assert.deepEqual(
        on
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        ['workflow_dispatch:', 'workflow_call:'],
    );
});
