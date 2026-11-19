import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIM_VERSION = '0.22.1';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
// Downloaded uv and TinyTeX live in the project's .tools; bin names follow each archive's layout.
export const uvDir = (root = projectRoot) => join(root, '.tools', 'uv');
export const texBin = (root = projectRoot, platform = process.platform, arch = process.arch) =>
  join(
    root,
    '.tools',
    'TinyTeX',
    'bin',
    platform === 'darwin' ? 'universal-darwin' : `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-linux`,
  );
// After the system PATH, so a learner's own uv or LaTeX wins over the downloads.
process.env.PATH = [process.env.PATH, uvDir(), texBin()].join(delimiter);

// A venv's base interpreter folder, which the sandbox must let it read: uv links it on Linux, pyvenv.cfg names it on Windows.
export const pythonRuntime = (python, platform = process.platform) =>
  platform === 'win32'
    ? /^home\s*=\s*(.+?)\s*$/m.exec(
        readFileSync(join(dirname(dirname(python)), 'pyvenv.cfg'), 'utf8'),
      )[1]
    : dirname(dirname(realpathSync(python)));

export const LINUX_PACKAGES =
  'sudo apt install bubblewrap libcairo2-dev libpango1.0-dev pkg-config python3-dev build-essential';

function osRelease() {
  try {
    return readFileSync('/etc/os-release', 'utf8');
  } catch {
    return '';
  }
}

// First-run setup's Linux line: null when bwrap, pkg-config and the Cairo/Pango headers are present.
export function systemPackages({
  platform = process.platform,
  probe = spawnSync,
  release = osRelease(),
} = {}) {
  if (platform !== 'linux') return null;
  const ok = (command, args) => probe(command, args, { timeout: 10000 }).status === 0;
  if (ok('bwrap', ['--version']) && ok('pkg-config', ['--exists', 'cairo', 'pangocairo']))
    return null;
  return /^ID(_LIKE)?=.*\b(debian|ubuntu)\b/m.test(release)
    ? { command: LINUX_PACKAGES }
    : {
        words:
          'bubblewrap, pkg-config, the Cairo and Pango development headers, the Python 3 development headers and the C build tools',
      };
}

export function checkManimDependencies({ platform = process.platform, probe = spawnSync } = {}) {
  if (!['linux', 'darwin'].includes(platform))
    throw new Error('Manim setup supports Linux (apt) and macOS (Homebrew).');
  const missing = [];
  if (probe('pkg-config', ['--exists', 'cairo', 'pangocairo'], { timeout: 10000 }).status !== 0)
    missing.push(
      'Cairo/Pango development headers or pkg-config are missing. Run: ' +
        (platform === 'darwin'
          ? 'brew install pkg-config cairo pango'
          : 'sudo apt install build-essential python3-dev pkg-config libcairo2-dev libpango1.0-dev'),
    );
  if (
    ['latex', 'dvisvgm'].some((tool) => probe(tool, ['--version'], { timeout: 10000 }).status !== 0)
  )
    missing.push('LaTeX or dvisvgm is missing; it downloads as TinyTeX with the video tools.');
  if (missing.length)
    throw new Error(missing.join('\n') + '\nReopen your terminal, then run npm start.');
}

// A fresh probe lets later video jobs detect a broken environment without blocking other features.
export function detectManim({
  root = projectRoot,
  probe = spawnSync,
  platform = process.platform,
} = {}) {
  const python = join(root, '.venv', 'bin', 'python');
  try {
    checkManimDependencies({ probe, platform });
    const result = probe(python, ['-I', '-c', 'import manim; print(manim.__version__)'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    if (result.status !== 0)
      throw new Error(result.error?.message || result.stderr?.trim() || 'Python import failed');
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
