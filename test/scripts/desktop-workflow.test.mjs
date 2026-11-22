import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
    new URL('../../.github/workflows/desktop-build.yml', import.meta.url),
    'utf8',
);
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
        assert.ok(steps.includes(`path: desktop/dist/${installer}`));
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

test('both installers go to one draft release', () => {
    const release = job('release');
    assert.match(release, /needs: \[linux, windows\]/);
    assert.match(release, /gh release create .* installers\/\*/);
    assert.match(release, /--draft/);
});
