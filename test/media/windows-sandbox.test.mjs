import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import {
    SANDBOX,
    launcherArgs,
    sandboxCommand,
    sandboxMissing,
    windowsSandbox,
    sandboxOutput,
} from '../../server/media/video-sandbox.mjs';
import { EventEmitter } from 'node:events';
import { pythonRuntime } from '../../server/media/manim.mjs';
import {
    detectPython,
    pythonSandbox,
    WINDOWS_SANDBOX_MISSING,
} from '../../server/tools/python.mjs';

const flagValues = (args, flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

test('the launcher gets the bwrap rules: the workspace, read binds and env, then the same command', () => {
    const data = mkdtempSync(join(tmpdir(), 'rabbithole-win-')),
        workspace = join(data, 'videos', 'c1', 'v1', 'a1');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, 'narration.json'), '{}');
    const command = [process.execPath, '/app/server/media/video-render.mjs', workspace, 'out.mp4'];
    const args = launcherArgs([...SANDBOX(workspace), ...command]);
    assert.deepEqual(args.slice(args.indexOf('--')), ['--', ...command]);
    assert.deepEqual(flagValues(args, '--workspace'), [workspace]);
    const reads = flagValues(args, '--read');
    assert.ok(reads.includes(process.execPath));
    assert.ok(reads.includes(join(workspace, 'narration.json')));
    assert.ok(
        !reads.includes('/') && !reads.includes(data),
        'the system root and app data are not granted',
    );
    const env = flagValues(args, '--env');
    assert.ok(env.includes(`HOME=${workspace}`));
    assert.ok(!env.some((e) => e.startsWith('PATH=')));
});

test('run_python reaches the launcher with its runtime, venv and stdin command', () => {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-win-py-'));
    mkdirSync(join(root, 'runtime', 'bin'), { recursive: true });
    mkdirSync(join(root, 'venv', 'bin'), { recursive: true });
    writeFileSync(join(root, 'runtime', 'bin', 'python3.12'), '');
    symlinkSync(join(root, 'runtime', 'bin', 'python3.12'), join(root, 'venv', 'bin', 'python'));
    const python = join(root, 'venv', 'bin', 'python'),
        workspace = join(root, 'data', 'python', 'c1');
    const args = launcherArgs(pythonSandbox(workspace, python, join(root, 'data')));
    assert.deepEqual(args.slice(args.indexOf('--')), ['--', python, '-I', '-B', '-']);
    assert.deepEqual(flagValues(args, '--workspace'), [workspace]);
    assert.deepEqual(flagValues(args, '--read'), [join(root, 'runtime'), join(root, 'venv')]);
});

test('the server picks bwrap on Linux and the launcher on Windows, which reads its install folder', () => {
    const before = process.env.RABBITHOLE_SANDBOX;
    process.env.RABBITHOLE_SANDBOX = 'C:\\Rabbithole\\rabbithole-sandbox.exe';
    try {
        const rules = ['--bind', '/w', '/w', '/node', '-e', '1'];
        assert.deepEqual(sandboxCommand(rules, 'linux'), ['bwrap', rules, {}]);
        const [program, args, env] = sandboxCommand(rules, 'win32');
        assert.equal(program, 'C:\\Rabbithole\\rabbithole-sandbox.exe');
        assert.deepEqual(args, [
            '--read',
            'C:\\Rabbithole',
            '--workspace',
            '/w',
            '--',
            '/node',
            '-e',
            '1',
        ]);
        assert.equal(env, process.env);
    } finally {
        if (before === undefined) delete process.env.RABBITHOLE_SANDBOX;
        else process.env.RABBITHOLE_SANDBOX = before;
    }
});

test('video making and run_python report unavailable on Windows until the sandbox is set up', async () => {
    const status = (code) => () => ({ status: code });
    assert.equal(sandboxMissing({ platform: 'linux', probe: status(1) }), null);
    assert.match(sandboxMissing({ platform: 'win32', launcher: undefined }), /Windows sandbox/);
    assert.match(
        sandboxMissing({ platform: 'win32', launcher: 'l.exe', probe: status(1) }),
        /Enable it in Settings/,
    );
    assert.equal(sandboxMissing({ platform: 'win32', launcher: 'l.exe', probe: status(0) }), null);

    const root = mkdtempSync(join(tmpdir(), 'rabbithole-win-detect-'));
    const checked = [];
    const check = (ok) => async (command, args) => (checked.push([command, ...args]), ok);
    assert.deepEqual(await detectPython({ root, platform: 'win32', launcher: undefined }), {
        ready: false,
        python: join(root, '.venv-python', 'Scripts', 'python.exe'),
        error: WINDOWS_SANDBOX_MISSING,
    });
    assert.equal(
        (await detectPython({ root, platform: 'win32', launcher: 'l.exe', check: check(false) }))
            .error,
        WINDOWS_SANDBOX_MISSING,
    );
    assert.deepEqual(checked, [['l.exe', '--check']]);
    assert.equal(
        (await detectPython({ root, platform: 'win32', launcher: 'l.exe', check: check(true) }))
            .ready,
        true,
    );
});

test('a Windows venv names its base interpreter folder in pyvenv.cfg', () => {
    const venv = mkdtempSync(join(tmpdir(), 'rabbithole-win-venv-'));
    writeFileSync(
        join(venv, 'pyvenv.cfg'),
        'home = C:\\uv\\python\\cpython-3.12\r\nversion = 3.12\r\n',
    );
    assert.equal(
        pythonRuntime(join(venv, 'Scripts', 'python.exe'), 'win32'),
        'C:\\uv\\python\\cpython-3.12',
    );
});

test('enabling the Windows sandbox runs the launcher setup once and reports what --check sees', async () => {
    let ready = false;
    const runs = [];
    const probe = () => ({ status: ready ? 0 : 1 });
    const run = (launcher, args, { accept }) => {
        runs.push([launcher, ...args]);
        const child = new EventEmitter();
        setImmediate(() => ((ready = accept), child.emit('close', accept ? 0 : 1)));
        return child;
    };
    const linux = windowsSandbox({ platform: 'linux', launcher: 'l.exe', probe, run });
    assert.deepEqual(await linux.enable(), { windows: false, ready: true });
    assert.deepEqual(runs, []);

    const declined = windowsSandbox({
        platform: 'win32',
        launcher: 'l.exe',
        probe,
        run: (l, a, o) => run(l, a, { ...o, accept: false }),
    });
    assert.deepEqual(declined.status(), { windows: true, ready: false });
    assert.deepEqual(await declined.enable(), { windows: true, ready: false });
    const accepted = windowsSandbox({
        platform: 'win32',
        launcher: 'l.exe',
        probe,
        run: (l, a, o) => run(l, a, { ...o, accept: true }),
    });
    assert.deepEqual(await accepted.enable(), { windows: true, ready: true });
    assert.deepEqual(runs, [
        ['l.exe', '--setup'],
        ['l.exe', '--setup'],
    ]);
});

test('sandbox output is accepted only as an ordinary file directly in the output folder', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'rabbithole-out-')),
        out = join(workspace, 'out');
    mkdirSync(out);
    writeFileSync(join(out, 'still.jpg'), 'jpg');
    writeFileSync(join(workspace, 'secret.jpg'), 'secret');
    symlinkSync(join(workspace, 'secret.jpg'), join(out, 'link.jpg'));
    assert.equal((await sandboxOutput(workspace, join(out, 'still.jpg'))).size, 3);
    assert.equal(await sandboxOutput(workspace, join(out, 'link.jpg')), null);
    assert.equal(await sandboxOutput(workspace, join(workspace, 'secret.jpg')), null);
    assert.equal(await sandboxOutput(workspace, join(out, 'missing.jpg')), null);
    // The check names the file with node:path, so Windows separators resolve; the old '/' split kept the whole path.
    assert.equal(win32.basename('C:\\data\\cut-0\\out\\still.jpg'), 'still.jpg');
});
