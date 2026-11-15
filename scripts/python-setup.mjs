import { existsSync } from 'node:fs';
import { projectRoot } from '../server/media/manim.mjs';
import { detectPython, PYTHON_PACKAGES, pythonVenv } from '../server/tools/python.mjs';

// Offline Python is optional: a failed setup leaves run_python hidden and start-up continues.
export async function ensurePython({
  run,
  root = projectRoot,
  check,
  log = console.log,
  warn = console.warn,
}) {
  let python = await detectPython({ root, check });
  if (python.ready) return (log(`Offline Python ready (${python.python}).`), python);
  if (python.bwrap === false) {
    warn(`Offline Python unavailable: ${python.error}`);
    return python;
  }
  log(`Installing offline Python packages in .venv-python with uv. Internet access may be needed.`);
  try {
    const venv = pythonVenv(root);
    if (!existsSync(python.python) && (await run('uv', ['venv', '--python', '3.12', venv])))
      throw new Error('uv venv failed');
    if (await run('uv', ['pip', 'install', '--python', python.python, ...PYTHON_PACKAGES]))
      throw new Error('uv pip install failed');
  } catch (error) {
    warn(
      `Offline Python setup failed (${error.message}); run_python stays hidden. Run npm start again to retry.`,
    );
    return { ready: false, python: python.python, error: error.message };
  }
  python = await detectPython({ root, check });
  if (python.ready) log(`Offline Python ready (${python.python}).`);
  else warn(`Offline Python unavailable: ${python.error}`);
  return python;
}
