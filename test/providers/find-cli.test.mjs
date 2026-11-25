import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCli, cliPath, launchArgs } from '../../server/providers/findCli.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';

const home = '/home/learner';
const find = (name, files, { PATH = '/usr/bin:/bin', npm = '/opt/npm/bin', ...env } = {}) =>
    findCli(name, {
        env: { PATH, ...env },
        home,
        exists: (p) => files.includes(p),
        npm: () => npm,
    });

test('detection checks PATH before the usual Linux install folders', () => {
    assert.equal(find('claude', ['/bin/claude', `${home}/.local/bin/claude`]), '/bin/claude');
    assert.equal(find('claude', [`${home}/.local/bin/claude`]), `${home}/.local/bin/claude`);
    assert.equal(find('claude', [`${home}/.claude/local/claude`]), `${home}/.claude/local/claude`);
    assert.equal(find('codex', ['/opt/npm/bin/codex']), '/opt/npm/bin/codex');
    assert.equal(
        find('codex', ['/home/linuxbrew/.linuxbrew/bin/codex']),
        '/home/linuxbrew/.linuxbrew/bin/codex',
    );
    assert.equal(
        find('codex', ['/brew/bin/codex'], { HOMEBREW_PREFIX: '/brew' }),
        '/brew/bin/codex',
    );
    assert.equal(find('codex', [], { npm: null }), null);
});

// npm's cmd-shim output for a script bin and for a native bin.
const shim = (target, viaNode) =>
    [
        '@ECHO off',
        'GOTO start',
        ':find_dp0',
        'SET dp0=%~dp0',
        'EXIT /b',
        ':start',
        'SETLOCAL',
        'CALL :find_dp0',
        viaNode
            ? `IF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n)\n` +
              `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${target}" %*`
            : `"%dp0%\\${target}"   %*`,
    ].join('\r\n');

test('Windows detection checks PATH, %LOCALAPPDATA%, %APPDATA%\\npm and %USERPROFILE%\\.local\\bin, and resolves npm shims', () => {
    const env = {
        PATH: 'C:\\Windows\\system32;C:\\Tools',
        LOCALAPPDATA: 'C:\\Users\\L\\AppData\\Local',
        APPDATA: 'C:\\Users\\L\\AppData\\Roaming',
        USERPROFILE: 'C:\\Users\\L',
    };
    const npm = 'C:\\Users\\L\\AppData\\Roaming\\npm';
    const shims = {
        [`${npm}\\codex.cmd`]: shim('node_modules\\@openai\\codex\\bin\\codex.js', true),
        [`${npm}\\claude.cmd`]: shim(
            'node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe',
            false,
        ),
    };
    const win = (name, files) =>
        findCli(name, {
            env,
            platform: 'win32',
            exists: (p) => files.includes(p) || p in shims,
            read: (p) => shims[p],
            npm: assert.fail,
        });
    const script = `${npm}\\node_modules\\@openai\\codex\\bin\\codex.js`;
    const native = `${npm}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`;
    assert.equal(win('codex', [script]), script);
    assert.equal(win('claude', [native]), native);
    assert.equal(win('claude', ['C:\\Tools\\claude.exe', native]), 'C:\\Tools\\claude.exe');
    assert.equal(
        win('claude', ['C:\\Users\\L\\.local\\bin\\claude.exe']),
        'C:\\Users\\L\\.local\\bin\\claude.exe',
    );
    assert.equal(
        win('codex', ['C:\\Users\\L\\AppData\\Local\\codex.exe']),
        'C:\\Users\\L\\AppData\\Local\\codex.exe',
    );
    const installer = 'C:\\Users\\L\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe';
    const files = [];
    const codex = cliPath(
        'codex',
        (name) => win(name, files),
        (path) => files.includes(path),
    );
    assert.equal(codex(), null);
    files.push(installer);
    assert.equal(codex(), installer, "Codex's Windows installer folder is found on the next check");
    assert.equal(win('codex', []), null, 'a shim whose target is gone is not found');
    // A script runs under this server's own Node; an executable runs directly.
    assert.deepEqual(launchArgs(script, ['app-server']), [
        process.execPath,
        [script, 'app-server'],
    ]);
    assert.deepEqual(launchArgs(native, ['-p']), [native, ['-p']]);
});

test('a missing CLI is found once installed, and a found path is remembered', () => {
    const files = [];
    let looks = 0;
    const bin = cliPath(
        'claude',
        (name) => (looks++, find(name, files)),
        (p) => files.includes(p),
    );
    assert.equal(bin(), null);
    files.push(`${home}/.local/bin/claude`);
    assert.equal(bin(), `${home}/.local/bin/claude`, 'Check again re-detects without a restart');
    assert.equal(bin(), `${home}/.local/bin/claude`);
    assert.equal(looks, 2, 'a found path is not searched again');
});

test('Windows detection keeps looking when an installer removes a shim during lookup', () => {
    const fallback = 'C:\\Fallback\\claude.exe';
    const options = {
        env: { PATH: 'C:\\Tools;C:\\Fallback' },
        platform: 'win32',
        exists: (path) => path === 'C:\\Tools\\claude.cmd' || path === fallback,
        read: () => {
            throw Object.assign(new Error('Shim moved'), { code: 'ENOENT' });
        },
    };
    assert.equal(findCli('claude', options), fallback);
    assert.equal(findCli('claude', { ...options, env: { PATH: 'C:\\Tools' } }), null);
});

const child = (reply) => {
    const c = new EventEmitter();
    c.stdout = new PassThrough();
    c.stderr = new PassThrough();
    c.kill = () => {};
    c.stdin = { end: () => reply(c), write: () => {} };
    return c;
};

test('Claude replies and auth checks use the found path; a missing CLI is not connected', async () => {
    const commands = [];
    const path = `${home}/.local/bin/claude`;
    let bin = path;
    const claude = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-cli-')),
        (cmd) => {
            commands.push(cmd);
            return child((c) => {
                c.stdout.end(
                    JSON.stringify({ type: 'result', is_error: false, result: 'Hi' }) + '\n',
                );
                c.stdout.on('end', () => c.emit('close', 0));
            });
        },
        (cmd, _args, _opts, cb) => (commands.push(cmd), cb(null, '{"loggedIn":true}')),
        () => bin,
    );
    assert.deepEqual(await claude.status(), { connected: true, email: null });
    await claude.generate(
        { model: 'sonnet', thread: 's', messages: [] },
        'Hello',
        () => {},
        () => {},
        new AbortController().signal,
    );
    assert.deepEqual(commands, [path, path]);
    bin = null;
    assert.equal(claude.installed(), false);
    assert.deepEqual(await claude.status(), { connected: false, email: null });
    await assert.rejects(claude.models(), /not signed in/);
    assert.equal(commands.length, 2, 'nothing runs without a CLI');
});

test('Claude reuses a signed-in check for 30 seconds; a sign-in check or a signed-out answer is never reused', async (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    let runs = 0,
        loggedIn = true;
    const claude = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-claude-auth-')),
        () => {},
        (_cmd, _args, _opts, cb) => (runs++, cb(null, JSON.stringify({ loggedIn }))),
        () => '/bin/claude',
    );
    await claude.models();
    await claude.models();
    assert.equal(runs, 1);
    t.mock.timers.tick(30_000);
    await claude.models();
    assert.equal(runs, 2);
    loggedIn = false;
    assert.equal((await claude.status()).connected, false);
    await assert.rejects(claude.models(), /not signed in/);
    loggedIn = true;
    await claude.models();
    assert.equal(runs, 5);
});

test('Claude sign-in returns the address the CLI prints and joins a running sign-in; one that exits first needs a terminal', async () => {
    const launches = [];
    const claude = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-claude-login-')),
        (cmd, args) => {
            const c = child(() => {});
            launches.push([cmd, args, c]);
            return c;
        },
        null,
        () => '/bin/claude',
    );
    const started = claude.login();
    assert.ok(claude.login() === started, 'a second press joins the running sign-in');
    const [[cmd, args, c]] = launches;
    assert.deepEqual([cmd, args], ['/bin/claude', ['auth', 'login']]);
    c.stdout.write('Opening browser to sign in…\nIf the browser did not open, visit:\n');
    c.stdout.write('\x1b]8;;https://claude.ai/oauth/authorize?abc\x07https://claude.ai/oauth/');
    assert.deepEqual(await started, { url: 'https://claude.ai/oauth/authorize?abc' });
    c.emit('close', 0);

    const again = claude.login();
    assert.equal(launches.length, 2, 'a finished sign-in can start again');
    launches[1][2].stderr.write('Error: Raw mode is not supported\n');
    launches[1][2].emit('close', 1);
    assert.equal(await again, null);
});

test('Claude sign-in that prints no address for 20 seconds is stopped and needs a terminal', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let killed = false;
    const claude = new Claude(
        mkdtempSync(join(tmpdir(), 'tt-claude-login-')),
        () => {
            const c = child(() => {});
            c.kill = () => ((killed = true), c.emit('close', null));
            return c;
        },
        null,
        () => '/bin/claude',
    );
    const started = claude.login();
    t.mock.timers.tick(20_000);
    assert.equal(await started, null);
    assert.ok(killed);
});

test('Codex launches the found path; a missing CLI fails its model list', async () => {
    const commands = [];
    let bin = null;
    const codex = new Codex(
        { token: async () => 't' },
        mkdtempSync(join(tmpdir(), 'tt-cli-')),
        (cmd) => {
            commands.push(cmd);
            const c = child(() => {});
            // Answers initialize so no RPC timer is left running.
            c.stdin.write = (line) => {
                const { id } = JSON.parse(line);
                if (id) c.stdout.write(JSON.stringify({ id, result: {} }) + '\n');
            };
            return c;
        },
        null,
        () => bin,
    );
    assert.equal(codex.installed(), false);
    await assert.rejects(codex.models(), /Codex is not installed/);
    bin = '/opt/npm/bin/codex';
    await codex.ready();
    codex.close();
    bin = 'C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js';
    await codex.ready();
    codex.close();
    assert.deepEqual(
        commands,
        ['/opt/npm/bin/codex', process.execPath],
        'a resolved npm script runs under Node, not a shell',
    );
});
