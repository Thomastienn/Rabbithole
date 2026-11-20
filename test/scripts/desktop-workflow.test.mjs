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

test('each build job restores npm, Cargo and Tauri caches and uploads its installer', () => {
    for (const [name, os, installer] of [
        ['linux', 'ubuntu', 'appimage/*.AppImage'],
        ['windows', 'windows', 'nsis/*-setup.exe'],
    ]) {
        const steps = job(name);
        assert.match(steps, new RegExp(`runs-on: ${os}`));
        assert.match(steps, /cache: npm/);
        assert.match(steps, /Swatinem\/rust-cache/);
        assert.match(steps, /path: .*tauri\n/);
        assert.ok(steps.includes(`bundle/${installer}`));
    }
    assert.match(job('windows'), /desktop\/sandbox -> target/);
});

test('both installers go to one draft release', () => {
    const release = job('release');
    assert.match(release, /needs: \[linux, windows\]/);
    assert.match(release, /gh release create .* installers\/\*/);
    assert.match(release, /--draft/);
});
