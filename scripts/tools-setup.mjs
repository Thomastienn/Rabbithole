import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    createWriteStream,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
} from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { texBin, toolRoot, uvDir } from '../server/media/manim.mjs';

export const UV_VERSION = '0.13.9';
const UV_TARGETS = {
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu',
    'darwin-x64': 'x86_64-apple-darwin',
    'darwin-arm64': 'aarch64-apple-darwin',
    'win32-x64': 'x86_64-pc-windows-msvc',
    'win32-arm64': 'aarch64-pc-windows-msvc',
};
// SHA-256 of each UV_VERSION archive, from the release's .sha256 files; bump them with the version.
export const UV_SHA256 = {
    'x86_64-unknown-linux-gnu': 'a7fbaff2b9a271d85c1bdb540941090fd1ce011797b4abeb48e4dcd39c2471d5',
    'aarch64-unknown-linux-gnu': '0797542018e541a9288855df555c8077eed06f7a47d206362030480e8ecc9f3d',
    'x86_64-apple-darwin': '617a3211261b0fc739562f0071aa34e9739797c510208ede8e2977c30903d041',
    'aarch64-apple-darwin': '5aeca67f2283f75235de40d0bd9c0a5bbc5fce23b6d48b3bf9fa1b2db08382ca',
    'x86_64-pc-windows-msvc': 'edd61f7f5728a56cc62455386661860bdfc7bab65872f39b0c25bdcc1d8e1beb',
    'aarch64-pc-windows-msvc': '72eed595983a4d7d22d79f21065b0f4479cc7e5c7a89104bb410c8f47559a878',
};
// shortcut: TinyTeX's rolling "daily" bundle, because tlmgr installs from the current CTAN year anyway and a pinned older bundle stops working at the next TeX Live release.
const TINYTEX = {
    'linux-x64': 'linux-x86_64',
    'linux-arm64': 'linux-arm64',
    'darwin-x64': 'darwin',
    'darwin-arm64': 'darwin',
    'win32-x64': 'windows',
};
// Manim's documented minimal LaTeX packages (docs.manim.community, installation).
export const MANIM_TEX_PACKAGES = (
    'amsmath babel-english cbfonts-fd cm-super count1to ctex doublestroke dvisvgm everysel ' +
    'fontspec frcursive fundus-calligra gnu-freefont jknapltx latex-bin mathastext microtype ' +
    'multitoc physics preview prelim2e ragged2e relsize rsfs setspace standalone tipa wasy ' +
    'wasysym xcolor xetex xkeyval'
).split(' ');

async function download(url, file, report, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length')) || null;
    let bytes = 0;
    await pipeline(
        Readable.fromWeb(response.body),
        async function* (chunks) {
            for await (const chunk of chunks) {
                bytes += chunk.length;
                report({ bytes, total, percent: total && (bytes / total) * 100 });
                yield chunk;
            }
        },
        createWriteStream(file),
    );
    return { bytes, total };
}

// Unpacks beside the target and renames, so an interrupted download leaves no half tool behind.
// `extract` fills the part folder and returns an exit code; `inner` names the archive's top folder, if it keeps one.
// `sha256`, when given, must match the archive before anything is unpacked.
async function unpack(url, dir, { report, signal, name, extract, inner = '', sha256 }) {
    const part = `${dir}.part`,
        archive = `${dir}.download${extname(url)}`;
    rmSync(part, { recursive: true, force: true });
    mkdirSync(part, { recursive: true });
    let size;
    try {
        size = await download(url, archive, report, signal).catch((error) => {
            if (signal?.aborted) throw error;
            throw new Error(
                `${name} download failed (${error.message}). Check your connection and Retry.`,
            );
        });
        if (sha256 && createHash('sha256').update(readFileSync(archive)).digest('hex') !== sha256)
            throw new Error(
                `${name} download does not match its pinned SHA-256, so it was not installed. Retry the download.`,
            );
        if (await extract(archive, part))
            throw new Error(`${name} could not be unpacked. Retry the download.`);
    } finally {
        // Windows holds a self-extractor's file for a moment after it exits (EPERM); rmSync retries only when recursive.
        rmSync(archive, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
    rmSync(dir, { recursive: true, force: true });
    renameSync(join(part, inner), dir);
    rmSync(part, { recursive: true, force: true });
    return size;
}

// The Windows sandbox launcher and its Codex helpers (desktop/sandbox), zipped by the desktop build's release.
export const SANDBOX_RELEASE = {
    tag: 'desktop-build-9',
    sha256: '2b0f5b4f4e0d29624e8330e2bbb0ca847d0383f3b49094bd4c50007136b4544b',
};
export const sandboxExe = (root = toolRoot) =>
    join(root, '.tools', 'sandbox', 'rabbithole-sandbox.exe');

const untar = (run, strip) => (archive, part) =>
    run('tar', ['-xf', archive, '-C', part, ...(strip ? ['--strip-components', '1'] : [])]);

const target = (table, platform, arch, name) => {
    const found = table[`${platform}-${arch}`];
    if (!found)
        throw new Error(`${name} downloads support Linux, macOS and Windows on x64 or arm64.`);
    return found;
};
const found = (probe, command) => probe(command, ['--version'], { timeout: 10000 }).status === 0;

export const uvReady = ({ probe = spawnSync } = {}) => found(probe, 'uv');
export const latexReady = ({ probe = spawnSync } = {}) =>
    found(probe, 'latex') && found(probe, 'dvisvgm');

// uv from its official release, into .tools/uv, when none is on PATH.
export async function ensureUv({
    run,
    root = toolRoot,
    probe = spawnSync,
    platform = process.platform,
    arch = process.arch,
    report = () => {},
    signal,
    log = console.log,
    hashes = UV_SHA256,
}) {
    if (uvReady({ probe })) return;
    const windows = platform === 'win32',
        triple = target(UV_TARGETS, platform, arch, 'uv');
    // The Windows zip holds uv.exe at its root; the tarballs keep one top folder.
    const asset = `uv-${triple}.${windows ? 'zip' : 'tar.gz'}`;
    log(`Downloading uv ${UV_VERSION}. Internet access is needed.`);
    const dir = uvDir(root);
    mkdirSync(dirname(dir), { recursive: true });
    await unpack(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset}`, dir, {
        report,
        signal,
        name: 'uv',
        extract: untar(run, !windows),
        sha256: hashes[triple],
    });
    if (!found(probe, join(dir, 'uv')))
        throw new Error('Downloaded uv does not run. Retry the download.');
}

// TinyTeX plus Manim's LaTeX packages, into .tools/TinyTeX, when latex or dvisvgm is missing.
export async function ensureLatex({
    run,
    root = toolRoot,
    probe = spawnSync,
    platform = process.platform,
    arch = process.arch,
    report = () => {},
    signal,
    log = console.log,
}) {
    if (latexReady({ probe })) return;
    const bin = texBin(root, platform, arch),
        dir = dirname(dirname(bin)),
        windows = platform === 'win32';
    // Windows tlmgr is a .bat, which spawn cannot run without a shell, so call the Perl script it wraps.
    const [tlmgr, tlmgrArgs] = windows
        ? [
              join(dir, 'tlpkg', 'tlperl', 'bin', 'perl.exe'),
              [join(dir, 'texmf-dist', 'scripts', 'texlive', 'tlmgr.pl')],
          ]
        : [join(bin, 'tlmgr'), []];
    // The environment tlmgr.bat sets: tlmgr.pl finds kpsewhich on PATH and its Perl modules on PERL5LIB.
    // On Windows the env key match is case-insensitive and the first in sorted order wins, so PATH beats Path.
    const env = windows
        ? {
              ...process.env,
              PERL5LIB: join(dir, 'tlpkg', 'tlperl', 'lib'),
              PATH: [dirname(tlmgr), bin, process.env.PATH].join(';'),
          }
        : undefined;
    // A bundle already unpacked only needs its packages, so Retry after a failed tlmgr skips the download.
    if (!existsSync(tlmgr)) {
        const bundle = `TinyTeX-1-${target(TINYTEX, platform, arch, 'LaTeX')}.${windows ? 'exe' : 'tar.xz'}`;
        log('Downloading LaTeX (TinyTeX). Internet access is needed.');
        mkdirSync(dirname(dir), { recursive: true });
        const size = await unpack(
            `https://github.com/rstudio/tinytex-releases/releases/download/daily/${bundle}`,
            dir,
            {
                report,
                signal,
                name: 'LaTeX',
                // The Windows bundle is a 7-Zip self-extractor holding one TinyTeX folder.
                extract: windows
                    ? (archive, part) => run(archive, ['-y', `-o${part}`])
                    : untar(run, true),
                inner: windows ? 'TinyTeX' : '',
            },
        );
        // Package installs report no bytes, so the bar turns indeterminate while tlmgr runs.
        report({ ...size, percent: null });
    }
    log("Installing Manim's LaTeX packages with tlmgr.");
    if (await run(tlmgr, [...tlmgrArgs, 'install', ...MANIM_TEX_PACKAGES], env))
        throw new Error('LaTeX package install failed. Check your connection and Retry.');
    if (
        !['latex', 'dvisvgm'].every((tool) => existsSync(join(bin, windows ? `${tool}.exe` : tool)))
    )
        throw new Error('LaTeX install is incomplete. Retry the download.');
}

// The Windows sandbox for npm start, into .tools/sandbox; the desktop app bundles its own.
export async function ensureSandbox({
    run,
    root = toolRoot,
    platform = process.platform,
    arch = process.arch,
    report = () => {},
    signal,
    log = console.log,
    release = SANDBOX_RELEASE,
}) {
    if (platform !== 'win32' || existsSync(sandboxExe(root))) return;
    if (arch !== 'x64') throw new Error('The Windows sandbox download supports x64 only.');
    log('Downloading the Windows sandbox. Internet access is needed.');
    const dir = dirname(sandboxExe(root));
    mkdirSync(dirname(dir), { recursive: true });
    await unpack(
        `https://github.com/Thomastienn/Rabbithole/releases/download/${release.tag}/rabbithole-sandbox-windows-x64.zip`,
        dir,
        {
            report,
            signal,
            name: 'Windows sandbox',
            extract: untar(run, false),
            sha256: release.sha256,
        },
    );
}
