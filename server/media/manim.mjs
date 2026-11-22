import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIM_VERSION = '0.22.1';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
// Every video tool sits in the tool root with the project folder's layout; the desktop app points it at <data>/tools.
export const toolRoot = process.env.RABBITHOLE_TOOLS_DIR || projectRoot;
// Downloaded uv and TinyTeX live in the tool root's .tools; bin names follow each archive's layout.
export const uvDir = (root = toolRoot) => join(root, '.tools', 'uv');
export const texBin = (root = toolRoot, platform = process.platform, arch = process.arch) =>
    join(
        root,
        '.tools',
        'TinyTeX',
        'bin',
        platform === 'win32'
            ? 'windows'
            : platform === 'darwin'
              ? 'universal-darwin'
              : `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-linux`,
    );
// After the system PATH, so a learner's own uv or LaTeX wins over the downloads.
process.env.PATH = [process.env.PATH, uvDir(), texBin()].join(delimiter);

// The interpreter in a venv or in a standalone Python (the desktop bundle's, which has no venv); always run as `python -m`.
export function pythonIn(dir, platform = process.platform, exists = existsSync) {
    const files = (
        platform === 'win32' ? ['Scripts/python.exe', 'python.exe'] : ['bin/python', 'bin/python3']
    ).map((file) => join(dir, ...file.split('/')));
    return files.find((file) => exists(file)) ?? files[0];
}
// The venv or standalone Python folder an interpreter belongs to.
export const pythonEnv = (python) =>
    /^(bin|Scripts)$/.test(basename(dirname(python))) ? dirname(dirname(python)) : dirname(python);

// A Python's base interpreter folder, which the sandbox must let it read: uv links it on Linux, a Windows venv's
// pyvenv.cfg names it, and a standalone Python is its own.
export function pythonRuntime(python, platform = process.platform) {
    if (platform !== 'win32') return dirname(dirname(realpathSync(python)));
    const cfg = join(pythonEnv(python), 'pyvenv.cfg');
    return existsSync(cfg)
        ? /^home\s*=\s*(.+?)\s*$/m.exec(readFileSync(cfg, 'utf8'))[1]
        : pythonEnv(python);
}

// The sandbox mounts that let a Python read its runtime. uv links a venv's python through a folder link named after
// the minor version (cpython-3.12-… to cpython-3.12.16-…), so each folder on the link chain reappears as a link.
export function runtimeBinds(python, platform = process.platform) {
    const runtime = pythonRuntime(python, platform);
    const binds = ['--ro-bind', runtime, runtime];
    if (platform === 'win32') return binds;
    for (let file = python; lstatSync(file).isSymbolicLink();) {
        file = resolve(dirname(file), readlinkSync(file));
        const dir = dirname(dirname(file));
        // Only a folder that is another name for the runtime, never the venv's own bin links.
        if (!binds.includes(dir) && realpathSync(dir) === runtime)
            binds.push('--symlink', runtime, dir);
    }
    return binds;
}

// Remotion's headless browser, where its ensureBrowser puts it for this OS.
export function videoBrowser(root = toolRoot, platform = process.platform, arch = process.arch) {
    const os =
        platform === 'win32'
            ? 'win64'
            : platform === 'darwin'
              ? `mac-${arch === 'arm64' ? 'arm64' : 'x64'}`
              : arch === 'arm64'
                ? 'linux-arm64'
                : 'linux64';
    const shell = `chrome-headless-shell${platform === 'win32' ? '.exe' : ''}`;
    return join(
        root,
        'node_modules',
        '.remotion',
        'chrome-headless-shell',
        os,
        `chrome-headless-shell-${os}`,
        shell,
    );
}

function osRelease() {
    try {
        return readFileSync('/etc/os-release', 'utf8');
    } catch {
        return '';
    }
}

// First-run setup's Linux line: null when bwrap is present. Manim installs from wheels, so no headers are needed.
export function systemPackages({
    platform = process.platform,
    probe = spawnSync,
    release = osRelease(),
} = {}) {
    if (platform !== 'linux' || probe('bwrap', ['--version'], { timeout: 10000 }).status === 0)
        return null;
    return /^ID(_LIKE)?=.*\b(debian|ubuntu)\b/m.test(release)
        ? { command: 'sudo apt install bubblewrap' }
        : { words: 'bubblewrap' };
}

export function checkManimDependencies({ platform = process.platform, probe = spawnSync } = {}) {
    if (!['linux', 'darwin', 'win32'].includes(platform))
        throw new Error('Manim setup supports Linux, macOS and Windows.');
    const missing = [];
    // Windows installs pycairo and manimpango from PyPI's wheels and Linux from the project's (scripts/manim-setup.mjs), so only macOS needs system headers.
    if (
        platform === 'darwin' &&
        probe('pkg-config', ['--exists', 'cairo', 'pangocairo'], { timeout: 10000 }).status !== 0
    )
        missing.push(
            'Cairo/Pango development headers or pkg-config are missing. Run: brew install pkg-config cairo pango',
        );
    if (
        ['latex', 'dvisvgm'].some(
            (tool) => probe(tool, ['--version'], { timeout: 10000 }).status !== 0,
        )
    )
        missing.push('LaTeX or dvisvgm is missing; it downloads as TinyTeX with the video tools.');
    if (missing.length)
        throw new Error(missing.join('\n') + '\nReopen your terminal, then run npm start.');
}

// A fresh probe lets later video jobs detect a broken environment without blocking other features.
export function detectManim({
    root = toolRoot,
    probe = spawnSync,
    platform = process.platform,
} = {}) {
    const python = pythonIn(join(root, '.venv'), platform);
    try {
        checkManimDependencies({ probe, platform });
        const result = probe(python, ['-I', '-B', '-c', 'import manim; print(manim.__version__)'], {
            encoding: 'utf8',
            timeout: 15000,
        });
        if (result.status !== 0)
            throw new Error(
                result.error?.message || result.stderr?.trim() || 'Python import failed',
            );
        const version = result.stdout.trim();
        if (version !== MANIM_VERSION)
            throw new Error(`expected Manim ${MANIM_VERSION}, found ${version}`);
        return { ready: true, python, version };
    } catch (error) {
        return {
            ready: false,
            python,
            error: `Manim unavailable: ${error.message}. Run npm start to repair.`,
        };
    }
}
