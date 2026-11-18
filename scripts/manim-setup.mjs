import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  checkManimDependencies,
  detectManim,
  MANIM_VERSION,
  projectRoot,
} from '../server/media/manim.mjs';

export async function ensureManim({
  run,
  root = projectRoot,
  probe = spawnSync,
  platform = process.platform,
  log = console.log,
}) {
  let manim = detectManim({ root, probe, platform });
  if (!manim.ready) {
    checkManimDependencies({ platform, probe });
    if (probe('uv', ['--version'], { timeout: 10000 }).status !== 0)
      throw new Error('Manim setup requires uv, which downloads first. Run npm start again.');
    async function uv(args) {
      let code;
      try {
        code = await run('uv', args);
      } catch (error) {
        throw new Error(
          `Could not start uv: ${error.message}. Run npm start again after repairing uv.`,
        );
      }
      if (code)
        throw new Error(
          `Manim setup failed: uv ${args.join(' ')}. Fix the error above, then run npm start again.`,
        );
    }
    log(
      `Installing Manim ${MANIM_VERSION} in .venv with uv. Internet access may be needed on first run.`,
    );
    if (!existsSync(manim.python)) await uv(['venv', '--python', '3.12', join(root, '.venv')]);
    await uv(['pip', 'install', '--python', manim.python, `manim==${MANIM_VERSION}`]);
    manim = detectManim({ root, probe, platform });
    if (!manim.ready) throw new Error(manim.error);
  }
  log(`Manim ready: ${manim.version} (${manim.python}).`);
  return manim;
}
