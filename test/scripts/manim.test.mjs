import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkManimDependencies, detectManim, MANIM_VERSION } from '../../server/media/manim.mjs';
import { ensureManim } from '../../scripts/manim-setup.mjs';

// Fake wheel downloads: fetch answers `served`, and the fixture wheels pin the hash of 'wheel'.
const pin = createHash('sha256').update('wheel').digest('hex');
const wheels = { 'pycairo-fixture.whl': pin, 'manimpango-fixture.whl': pin };
let fetched = [],
    served = 'wheel',
    saved;
before(() => {
    saved = globalThis.fetch;
    globalThis.fetch = async (url) => {
        fetched.push(url);
        return new Response(served);
    };
});
after(() => (globalThis.fetch = saved));
const ensure = (options) => ensureManim({ platform: 'linux', arch: 'x64', wheels, ...options });

function probes(missing = [], version = MANIM_VERSION) {
    return (command) => ({
        status: missing.includes(command) ? 1 : 0,
        stdout: version + '\n',
        stderr: 'fixture import error',
    });
}

const latex = 'LaTeX or dvisvgm is missing; it downloads as TinyTeX';

test('darwin: dependency probes pass, or give exact commands for missing headers and LaTeX', () => {
    const platform = 'darwin',
        headers = 'Run: brew install pkg-config cairo pango';
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
                for (const command of commands) assert.ok(error.message.includes(command));
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

test('linux: missing Cairo and Pango headers never block, only LaTeX does', () => {
    assert.doesNotThrow(() =>
        checkManimDependencies({ platform: 'linux', probe: probes(['pkg-config']) }),
    );
    assert.throws(
        () => checkManimDependencies({ platform: 'linux', probe: probes(['dvisvgm']) }),
        new RegExp(latex),
    );
});

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

test('first Linux run installs pinned Manim from the verified project wheels and builds nothing; later starts need no uv', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-manim-'));
    const python = join(root, '.venv/bin/python');
    const dir = join(root, '.tools', 'wheels');
    let installed = false;
    const probe = (command) => probes(installed ? [] : [python])(command);
    const calls = [],
        logs = [];
    fetched = [];
    const result = await ensure({
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
    assert.deepEqual(fetched, [
        'https://github.com/Thomastienn/Rabbithole/releases/download/linux-wheels/pycairo-fixture.whl',
        'https://github.com/Thomastienn/Rabbithole/releases/download/linux-wheels/manimpango-fixture.whl',
    ]);
    assert.deepEqual(readdirSync(dir).sort(), ['manimpango-fixture.whl', 'pycairo-fixture.whl']);
    assert.deepEqual(calls, [
        ['uv', ['venv', '--python', '3.12', join(root, '.venv')]],
        [
            'uv',
            [
                'pip',
                'install',
                '--python',
                python,
                '--find-links',
                dir,
                '--only-binary',
                'pycairo',
                '--only-binary',
                'manimpango',
                `manim==${MANIM_VERSION}`,
            ],
        ],
    ]);
    assert.match(logs.at(-1), /Manim ready:/);
    assert.equal(
        (await ensure({ root, probe: probes(['uv']), run: assert.fail, log: () => {} })).ready,
        true,
    );
});

test('a wheel whose hash does not match is refused before uv installs anything', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-manim-hash-'));
    const python = join(root, '.venv/bin/python');
    served = 'tampered wheel';
    try {
        await assert.rejects(
            ensure({ root, probe: probes([python]), run: assert.fail, log: () => {} }),
            /pycairo-fixture\.whl does not match its pinned SHA-256, so it was not installed/,
        );
    } finally {
        served = 'wheel';
    }
    assert.equal(existsSync(join(root, '.tools', 'wheels', 'pycairo-fixture.whl')), false);
});

test('Windows setup needs no system packages: Manim installs into .venv/Scripts with only TinyTeX checked', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-manim-win-'));
    const python = join(root, '.venv', 'Scripts', 'python.exe');
    let installed = false;
    const probe = (command) => probes(installed ? ['pkg-config'] : ['pkg-config', python])(command);
    const calls = [];
    fetched = [];
    const result = await ensureManim({
        root,
        probe,
        platform: 'win32',
        log: () => {},
        run: async (command, args) => {
            calls.push([command, args]);
            if (args[0] === 'pip') installed = true;
            return 0;
        },
    });
    assert.equal(result.ready, true);
    assert.equal(result.python, python);
    assert.deepEqual(calls.at(-1), [
        'uv',
        ['pip', 'install', '--python', python, `manim==${MANIM_VERSION}`],
    ]);
    assert.deepEqual(fetched, []);
    assert.throws(
        () => checkManimDependencies({ platform: 'win32', probe: probes(['dvisvgm']) }),
        /downloads as TinyTeX/,
    );
});

test('an interrupted or wrong-version install repairs the existing environment without replacing it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-manim-repair-'));
    mkdirSync(join(root, '.venv/bin'), { recursive: true });
    writeFileSync(join(root, '.venv/bin/python'), 'existing environment fixture');
    let version = '0.19.0';
    const result = await ensure({
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
        ensure({ root, probe: probes(['latex']), run: assert.fail }),
        /downloads as TinyTeX/,
    );
    await assert.rejects(
        ensure({ root, probe: probes([python, 'uv']), run: assert.fail }),
        /requires uv, which downloads first/,
    );
    await assert.rejects(
        ensure({ root, probe: probes([python]), run: async () => 1, log: () => {} }),
        /Manim setup failed: uv venv/,
    );
    await assert.rejects(
        ensure({
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
        ensure({ root, probe: probes([python]), run: async () => 0, log: () => {} }),
        /Manim unavailable: fixture import error/,
    );
});
