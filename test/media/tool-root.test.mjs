import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    detectManim,
    MANIM_VERSION,
    projectRoot,
    pythonIn,
    pythonRuntime,
    videoBrowser,
} from '../../server/media/manim.mjs';
import { detectClips } from '../../server/media/clips.mjs';
import { manimBindings } from '../../server/media/manim-cut.mjs';
import { detectPython, pythonSandbox } from '../../server/tools/python.mjs';

const ok = () => ({ status: 0, stdout: `${MANIM_VERSION}\n` });

// Every tool path the server would use, from a fresh process with the given environment.
function toolPaths(env) {
    const url = (file) => new URL(`../../server/${file}`, import.meta.url).href;
    const script = `
        const { detectManim, texBin, uvDir, videoBrowser } = await import('${url('media/manim.mjs')}');
        const { detectClips } = await import('${url('media/clips.mjs')}');
        const { detectPython, pythonVenv } = await import('${url('tools/python.mjs')}');
        const ok = () => ({ status: 0, stdout: '' });
        console.log(JSON.stringify({
            paths: [
                uvDir(),
                texBin(),
                videoBrowser(),
                pythonVenv(),
                detectManim({ probe: ok }).python,
                detectClips({ probe: ok }).python,
                (await detectPython({ check: async () => true, platform: 'linux' })).python,
            ],
            path: process.env.PATH.split(${JSON.stringify(process.platform === 'win32' ? ';' : ':')}).slice(-2),
        }));`;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, RABBITHOLE_TOOLS_DIR: '', ...env },
        encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
}

test('the tool root defaults to the project folder; a set tool root holds every tool and the project folder none', () => {
    const before = toolPaths({});
    for (const file of [...before.paths, ...before.path])
        assert.ok(file.startsWith(projectRoot), file);

    const tools = mkdtempSync(join(tmpdir(), 'rabbithole-tools-'));
    const after = toolPaths({ RABBITHOLE_TOOLS_DIR: tools });
    for (const file of [...after.paths, ...after.path]) {
        assert.ok(file.startsWith(tools), file);
        assert.ok(!file.startsWith(projectRoot), file);
    }
});

test('Python resolves to a venv or a standalone interpreter on each OS', () => {
    const has =
        (...files) =>
        (file) =>
            files.includes(file);
    const dir = '/tools/.venv';
    assert.equal(pythonIn(dir, 'linux', has(join(dir, 'bin/python'))), join(dir, 'bin/python'));
    assert.equal(pythonIn(dir, 'linux', has(join(dir, 'bin/python3'))), join(dir, 'bin/python3'));
    assert.equal(
        pythonIn(dir, 'win32', has(join(dir, 'Scripts/python.exe'))),
        join(dir, 'Scripts/python.exe'),
    );
    assert.equal(pythonIn(dir, 'win32', has(join(dir, 'python.exe'))), join(dir, 'python.exe'));
    assert.equal(pythonIn(dir, 'linux', has()), join(dir, 'bin/python'), 'a missing one is a venv');
    // A standalone Python has no pyvenv.cfg and is its own runtime.
    const standalone = mkdtempSync(join(tmpdir(), 'rabbithole-standalone-'));
    assert.equal(pythonRuntime(join(standalone, 'python.exe'), 'win32'), standalone);
});

test('the video browser path follows the OS', () => {
    const shell = (os) =>
        join('/t/node_modules/.remotion/chrome-headless-shell', os, `chrome-headless-shell-${os}`);
    assert.equal(
        videoBrowser('/t', 'linux', 'x64'),
        join(shell('linux64'), 'chrome-headless-shell'),
    );
    assert.equal(
        videoBrowser('/t', 'win32', 'x64'),
        join(shell('win64'), 'chrome-headless-shell.exe'),
    );
});

test('a standalone Python with no venv runs Manim, clips and run_python', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-tools-py-'));
    for (const dir of ['.venv', '.venv-python']) {
        mkdirSync(join(root, dir, 'bin'), { recursive: true });
        writeFileSync(join(root, dir, 'bin', 'python3'), '');
    }
    const manim = join(root, '.venv', 'bin', 'python3'),
        offline = join(root, '.venv-python', 'bin', 'python3');
    const probed = [];
    const probe = (command, args) => (probed.push([command, ...args]), ok());
    assert.deepEqual(detectManim({ root, probe, platform: 'linux' }), {
        ready: true,
        python: manim,
        version: MANIM_VERSION,
    });
    assert.equal(detectClips({ root, probe, platform: 'linux' }).python, manim);
    assert.ok(probed.some((call) => call.join(' ') === `${manim} -m yt_dlp --version`));
    const python = await detectPython({ root, check: async () => true, platform: 'linux' });
    assert.deepEqual(python, { ready: true, python: offline });

    const binds = manimBindings(manim);
    assert.ok(binds.includes(join(root, '.venv')), 'the Manim sandbox reads the standalone Python');
    const sandbox = pythonSandbox(join(root, 'work'), offline, join(root, 'data'));
    assert.ok(sandbox.includes(join(root, '.venv-python')));
    assert.deepEqual(sandbox.slice(-4), [offline, '-I', '-B', '-']);
});
