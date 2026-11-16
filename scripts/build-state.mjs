import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const stamp = 'dist/.rabbithole-build.json';
function fingerprint(paths) {
  const hash = createHash('sha256');
  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = `${path}/${entry.name}`;
      if (file === stamp) continue;
      if (entry.isDirectory()) visit(file);
      else hash.update(file).update('\0').update(readFileSync(file)).update('\0');
    }
  }
  for (const path of paths) {
    if (['src', 'public', 'dist'].includes(path)) {
      if (existsSync(path)) visit(path);
    } else hash.update(path).update('\0').update(readFileSync(path)).update('\0');
  }
  return hash.digest('hex');
}
const inputs = () =>
  fingerprint([
    'src',
    'public',
    'index.html',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'scripts/build-state.mjs',
    // The live video player bundles the video kit from server/.
    'server/media/video-kit.tsx',
    'server/media/video-stock.tsx',
  ]);
export function recordBuild() {
  writeFileSync(stamp, JSON.stringify({ inputs: inputs(), outputs: fingerprint(['dist']) }) + '\n');
}
export function buildIsCurrent() {
  try {
    const saved = JSON.parse(readFileSync(stamp, 'utf8'));
    return (
      existsSync('dist/index.html') &&
      saved.inputs === inputs() &&
      saved.outputs === fingerprint(['dist'])
    );
  } catch {
    return false;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) recordBuild();
