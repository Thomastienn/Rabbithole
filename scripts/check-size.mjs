// Fails when a hand-written code file in src, server, scripts or test is over 500 lines.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LIMIT = 500;
const DIRS = ['src', 'server', 'scripts', 'test'];
const CODE = /\.(m?js|tsx?)$/;
// Astryx theme build output and test fixtures; keep in step with .prettierignore.
const GENERATED = /^src\/themes\/[^/]+\/[^/]+\.(js|css|d\.ts|doc\.mjs)$|^test\/fixtures\//;

// Files waiting for their split ticket; each split removes its entry.
export const OVERSIZED = ['server/app.mjs', 'src/shell/ChatPage.tsx', 'src/map/TreeOverview.tsx'];

export function checkSize(root, oversized = OVERSIZED) {
  const lines = new Map();
  for (const dir of DIRS) {
    for (const file of readdirSync(join(root, dir), { recursive: true, withFileTypes: true })) {
      const path = join(file.parentPath, file.name)
        .slice(root.length + 1)
        .replaceAll('\\', '/');
      if (!file.isFile() || !CODE.test(path) || GENERATED.test(path)) continue;
      lines.set(path, readFileSync(join(root, path), 'utf8').split('\n').length - 1);
    }
  }
  const problems = [];
  for (const [path, count] of lines) {
    if (count > LIMIT && !oversized.includes(path)) problems.push(`${path}: ${count} lines`);
  }
  for (const path of oversized) {
    if (!(lines.get(path) > LIMIT)) problems.push(`${path}: stale oversized entry, remove it`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkSize(process.cwd());
  if (problems.length) {
    console.error(`Files over ${LIMIT} lines:\n${problems.join('\n')}`);
    process.exit(1);
  }
}
