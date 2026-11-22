import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { systemPackages, texBin, uvDir } from '../../server/media/manim.mjs';
import {
    ensureLatex,
    ensureSandbox,
    ensureUv,
    MANIM_TEX_PACKAGES,
    sandboxExe,
    UV_SHA256,
    UV_VERSION,
} from '../../scripts/tools-setup.mjs';

// Fake downloads: fetch answers a 4-byte archive, pinned in `hashes`; `tar` writes the given files into the -C folder.
function fixture(t, files = []) {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-tools-'));
    const fetched = [],
        reports = [],
        calls = [];
    const saved = globalThis.fetch;
    globalThis.fetch = async (url) => {
        fetched.push(url);
        return new Response('data', { headers: { 'content-length': '4' } });
    };
    t.after(() => (globalThis.fetch = saved));
    const run = async (command, args) => {
        calls.push([command, args]);
        // The Windows TinyTeX self-extractor takes -y -o<folder>.
        const sfx = args[0] === '-y';
        if (command === 'tar' || sfx) {
            const into = sfx ? args[1].slice(2) : args[args.indexOf('-C') + 1];
            for (const file of files) {
                mkdirSync(join(into, file, '..'), { recursive: true });
                writeFileSync(join(into, file), '');
            }
        }
        return 0;
    };
    const probe = (command) => ({
        status: command.startsWith(root) && existsSync(command) ? 0 : 1,
    });
    const data = createHash('sha256').update('data').digest('hex');
    const hashes = Object.fromEntries(Object.keys(UV_SHA256).map((triple) => [triple, data]));
    return { root, fetched, reports, calls, run, probe, hashes, report: (r) => reports.push(r) };
}

test('missing uv downloads its pinned official release into .tools/uv and leaves no partial files', async (t) => {
    const f = fixture(t, ['uv']);
    await ensureUv({ ...f, platform: 'linux', arch: 'x64', log: () => {} });
    assert.deepEqual(f.fetched, [
        `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz`,
    ]);
    assert.ok(existsSync(join(uvDir(f.root), 'uv')));
    assert.deepEqual(readdirSync(join(f.root, '.tools')), ['uv']);
    assert.deepEqual(f.reports.at(-1), { bytes: 4, total: 4, percent: 100 });
    // A uv already on PATH means no download.
    await ensureUv({ ...f, probe: () => ({ status: 0 }), run: assert.fail });
    assert.equal(f.fetched.length, 1);
});

test('a failed uv download asks for Retry and installs nothing', async (t) => {
    const f = fixture(t);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(
        ensureUv({ ...f, platform: 'linux', arch: 'x64', log: () => {} }),
        /uv download failed \(HTTP 503\)\. Check your connection and Retry/,
    );
    assert.equal(existsSync(uvDir(f.root)), false);
});

test('a uv download that does not match its pinned SHA-256 is refused before anything unpacks or runs', async (t) => {
    const f = fixture(t, ['uv']);
    await assert.rejects(
        ensureUv({ ...f, hashes: UV_SHA256, platform: 'linux', arch: 'x64', log: () => {} }),
        /uv download does not match its pinned SHA-256, so it was not installed\. Retry the download/,
    );
    assert.deepEqual(f.calls, []);
    assert.equal(existsSync(uvDir(f.root)), false);
    assert.equal(existsSync(`${uvDir(f.root)}.download.gz`), false);
});

test("missing LaTeX downloads TinyTeX and installs Manim's packages; Retry after tlmgr fails skips the download", async (t) => {
    const bin = 'bin/x86_64-linux';
    const f = fixture(t, [`${bin}/tlmgr`, `${bin}/latex`]);
    const tlmgr = join(texBin(f.root, 'linux', 'x64'), 'tlmgr');
    let failTlmgr = true;
    const run = async (command, args) => {
        if (command !== tlmgr) return f.run(command, args);
        f.calls.push([command, args]);
        if (failTlmgr) return 1;
        writeFileSync(join(texBin(f.root, 'linux', 'x64'), 'dvisvgm'), '');
        return 0;
    };
    const options = { ...f, run, platform: 'linux', arch: 'x64', log: () => {} };
    await assert.rejects(
        ensureLatex(options),
        /LaTeX package install failed\. Check your connection and Retry/,
    );
    assert.deepEqual(f.fetched, [
        'https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX-1-linux-x86_64.tar.xz',
    ]);
    assert.deepEqual(f.reports.at(-1), { bytes: 4, total: 4, percent: null });
    assert.ok(MANIM_TEX_PACKAGES.includes('dvisvgm'));
    assert.deepEqual(f.calls.at(-1), [tlmgr, ['install', ...MANIM_TEX_PACKAGES]]);
    failTlmgr = false;
    await ensureLatex(options);
    assert.equal(f.fetched.length, 1);
    // System latex and dvisvgm mean no download.
    await ensureLatex({ ...options, probe: () => ({ status: 0 }), run: assert.fail });
});

test('Windows gets the uv zip and the TinyTeX self-extractor, and tlmgr runs through its Perl without a shell', async (t) => {
    const f = fixture(t, [
        'uv.exe',
        'TinyTeX/tlpkg/tlperl/bin/perl.exe',
        'TinyTeX/bin/windows/latex.exe',
    ]);
    const win = { ...f, platform: 'win32', arch: 'x64', log: () => {} };
    await ensureUv(win).catch(() => {}); // the fake uv.exe cannot run here
    assert.equal(
        f.fetched[0],
        `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`,
    );
    assert.deepEqual(
        f.calls[0][1].slice(-2),
        ['-C', `${uvDir(f.root)}.part`],
        'the zip has no top folder',
    );
    assert.ok(existsSync(join(uvDir(f.root), 'uv.exe')));

    const tex = join(f.root, '.tools', 'TinyTeX'),
        perl = join(tex, 'tlpkg', 'tlperl', 'bin', 'perl.exe');
    let env;
    const run = async (command, args, given) => {
        if (command !== perl) return f.run(command, args);
        f.calls.push([command, args]);
        env = given;
        writeFileSync(join(texBin(f.root, 'win32', 'x64'), 'dvisvgm.exe'), '');
        return 0;
    };
    await ensureLatex({ ...win, run });
    assert.equal(
        f.fetched[1],
        'https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX-1-windows.exe',
    );
    assert.deepEqual(f.calls[1], [`${tex}.download.exe`, ['-y', `-o${tex}.part`]]);
    assert.deepEqual(f.calls.at(-1), [
        perl,
        [
            join(tex, 'texmf-dist', 'scripts', 'texlive', 'tlmgr.pl'),
            'install',
            ...MANIM_TEX_PACKAGES,
        ],
    ]);
    // tlmgr.pl finds kpsewhich and its modules only through what tlmgr.bat would set.
    assert.equal(env.PERL5LIB, join(tex, 'tlpkg', 'tlperl', 'lib'));
    assert.ok(env.PATH.startsWith(`${dirname(perl)};${join(tex, 'bin', 'windows')};`));
    assert.equal(texBin(f.root, 'win32', 'x64'), join(tex, 'bin', 'windows'));
    assert.deepEqual(readdirSync(join(f.root, '.tools')).sort(), ['TinyTeX', 'uv']);
});

test('the Linux line asks only for bwrap, never pkg-config or headers', () => {
    const probe = (missing) => (command) => ({ status: missing.includes(command) ? 1 : 0 });
    const linux = (missing, release = 'ID=linuxmint\nID_LIKE="ubuntu debian"\n') =>
        systemPackages({ platform: 'linux', probe: probe(missing), release });
    assert.equal(linux([]), null);
    assert.equal(linux(['pkg-config']), null);
    assert.deepEqual(linux(['bwrap', 'pkg-config']), { command: 'sudo apt install bubblewrap' });
    assert.deepEqual(linux(['bwrap'], 'ID=fedora\n'), { words: 'bubblewrap' });
    assert.equal(systemPackages({ platform: 'darwin', probe: probe(['bwrap']) }), null);
});

test('npm start on Windows downloads the pinned sandbox zip into .tools/sandbox; other systems skip it', async (t) => {
    const exes = [
        'rabbithole-sandbox.exe',
        'codex-command-runner.exe',
        'codex-windows-sandbox-setup.exe',
    ];
    const f = fixture(t, exes);
    const release = { tag: 'desktop-build-9', sha256: f.hashes['x86_64-pc-windows-msvc'] };
    await ensureSandbox({ ...f, platform: 'linux', arch: 'x64', release, run: assert.fail });
    await ensureSandbox({ ...f, platform: 'win32', arch: 'x64', release, log: () => {} });
    assert.deepEqual(f.fetched, [
        'https://github.com/Thomastienn/Rabbithole/releases/download/desktop-build-9/rabbithole-sandbox-windows-x64.zip',
    ]);
    assert.deepEqual(readdirSync(dirname(sandboxExe(f.root))).sort(), [...exes].sort());
    // Already downloaded means no second download.
    await ensureSandbox({ ...f, platform: 'win32', arch: 'x64', release, run: assert.fail });
    assert.equal(f.fetched.length, 1);
});

test('a sandbox zip that does not match its pinned SHA-256 installs nothing', async (t) => {
    const f = fixture(t, ['rabbithole-sandbox.exe']);
    await assert.rejects(
        ensureSandbox({ ...f, platform: 'win32', arch: 'x64', log: () => {} }),
        /Windows sandbox download does not match its pinned SHA-256/,
    );
    assert.equal(existsSync(sandboxExe(f.root)), false);
});
