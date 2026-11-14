import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIM_VERSION = '0.22.1';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

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
    missing.push(
      'LaTeX or dvisvgm is missing. Run: ' +
        (platform === 'darwin'
          ? 'brew install --cask mactex-no-gui'
          : 'sudo apt install texlive-full'),
    );
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
