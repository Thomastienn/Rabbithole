import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    closeSync,
    cpSync,
    mkdirSync,
    openSync,
    readdirSync,
    readFileSync,
    readSync,
    rmSync,
    statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIsCurrent } from './build-state.mjs';

// Stages the desktop resources in desktop/stage, run in place by the shell with no copy and no tool download:
// node (the official Node 24) and app (the built app with production dependencies). No tools: add-ons install on
// request into the data folder (ADR 0020). On Windows it also builds the sandbox launcher and its Codex helpers.
const root = fileURLToPath(new URL('..', import.meta.url));
const stage = join(root, 'desktop', 'stage');
const app = join(stage, 'app');
// Pinned official build; a distro or Homebrew node may link shared libraries the learner lacks.
const NODE = {
    version: '24.22.3',
    'linux-x64': '4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb',
    'win32-x64': 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f',
};
const windows = process.platform === 'win32';
// Windows needs a shell to run npm.cmd; its arguments here are fixed words.
const run = (command, args, cwd = root) =>
    execFileSync(command, args, { cwd, stdio: 'inherit', shell: windows && command === 'npm' });
// Windows' own bsdtar reads zips and C:\ paths; a Git-for-Windows GNU tar earlier on PATH does neither.
const tar = windows ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

// Every regular file below dir; readdirSync's recursive mode would also follow links.
const files = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
    });

// ELF machine numbers by Node arch; Mach-O and PE are other OSes' formats.
const ELF_MACHINE = { x64: 62, arm64: 183 };
// Native binaries the stage must not hold: other OSes' formats, and ELF for another CPU.
export function foreignBinaries(dir, platform = process.platform, arch = process.arch) {
    const found = [],
        head = Buffer.alloc(20);
    for (const file of files(dir)) {
        const fd = openSync(file, 'r');
        const size = readSync(fd, head, 0, 20, 0);
        closeSync(fd);
        if (size < 20) continue;
        const magic = head.readUInt32BE(0);
        const kind =
            magic === 0x7f454c46
                ? head.readUInt16LE(18) === ELF_MACHINE[arch]
                    ? 'linux'
                    : 'other-arch'
                : head.readUInt16BE(0) === 0x4d5a
                  ? 'win32'
                  : [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic) ||
                      // A universal Mach-O counts its CPUs next; a Java class shares the magic and has its version (45 or more) there.
                      (magic === 0xcafebabe && head.readUInt32BE(4) < 45)
                    ? 'darwin'
                    : null;
        if (kind && kind !== platform) found.push(relative(dir, file));
    }
    return found;
}

// Imported by its test for foreignBinaries; run as a script, it stages.
if (import.meta.main) {
    if (!buildIsCurrent()) run('npm', ['run', 'build']);
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(app, { recursive: true });
    for (const name of ['dist', 'server', 'scripts', 'src', 'package.json', 'package-lock.json'])
        cpSync(join(root, name), join(app, name), { recursive: true });
    run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], app);
    const target = `${process.platform}-${process.arch}`;
    if (!NODE[target])
        throw new Error(
            `The desktop app builds on linux-x64 and win32-x64 only; this is ${target}.`,
        );
    const name = `node-v${NODE.version}-${target.replace('win32', 'win')}`;
    const file = `${name}.${windows ? 'zip' : 'tar.xz'}`;
    const archive = join(stage, file);
    run('curl', [
        '-fsSL',
        '--retry',
        '3',
        '-o',
        archive,
        `https://nodejs.org/dist/v${NODE.version}/${file}`,
    ]);
    if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== NODE[target])
        throw new Error(`${file} does not match its pinned SHA-256; not bundling it.`);
    if (windows)
        run(tar, ['-xf', archive, '-C', stage, '--strip-components', '1', `${name}/node.exe`]);
    else run(tar, ['-xJf', archive, '-C', stage, '--strip-components', '2', `${name}/bin/node`]);
    rmSync(archive);
    if (windows) {
        // The Codex helpers must sit beside the launcher (desktop/sandbox/Cargo.toml).
        const bins = ['rabbithole-sandbox', 'codex-command-runner', 'codex-windows-sandbox-setup'];
        const sandbox = join(root, 'desktop', 'sandbox');
        run(
            'cargo',
            [
                'build',
                '--release',
                '-p',
                'rabbithole-sandbox',
                '-p',
                'codex-windows-sandbox',
                ...bins.flatMap((bin) => ['--bin', bin]),
            ],
            sandbox,
        );
        for (const bin of bins)
            cpSync(join(sandbox, 'target', 'release', `${bin}.exe`), join(stage, `${bin}.exe`));
    }
    // onnxruntime-node ships every OS's runtime, and GPU providers the CPU-only embedder never loads: most of its 548 MB.
    // The check below catches other packages that ship other OSes' binaries.
    const onnx = join(app, 'node_modules', 'onnxruntime-node', 'bin');
    for (const napi of readdirSync(onnx))
        for (const os of readdirSync(join(onnx, napi)))
            for (const cpu of readdirSync(join(onnx, napi, os))) {
                const dir = join(onnx, napi, os, cpu);
                if (`${os}-${cpu}` !== target) rmSync(dir, { recursive: true });
                else
                    for (const lib of readdirSync(dir))
                        if (/providers_(cuda|tensorrt)/.test(lib)) rmSync(join(dir, lib));
            }
    const foreign = foreignBinaries(stage);
    if (foreign.length)
        throw new Error(
            `The stage holds other OSes' native binaries; prune them in scripts/desktop-stage.mjs:\n${foreign.join('\n')}`,
        );
    const bytes = files(stage).reduce((sum, file) => sum + statSync(file).size, 0);
    console.log(`Staged ${stage}: ${(bytes / 2 ** 20).toFixed(0)} MiB.`);
}
