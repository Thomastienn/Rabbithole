// Fails when a hand-written code file in src, server, scripts or test is over 550 lines.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LIMIT = 550;
const DIRS = ['src', 'server', 'scripts', 'test'];
const CODE = /\.(m?js|tsx?|css)$/;
// Astryx theme build output and test fixtures; keep in step with .prettierignore.
const GENERATED = /^src\/themes\/[^/]+\/[^/]+\.(js|css|d\.ts|doc\.mjs)$|^test\/fixtures\//;

export function checkSize(root) {
    const problems = [];
    for (const dir of DIRS) {
        for (const file of readdirSync(join(root, dir), { recursive: true, withFileTypes: true })) {
            const path = join(file.parentPath, file.name)
                .slice(root.length + 1)
                .replaceAll('\\', '/');
            if (!file.isFile() || !CODE.test(path) || GENERATED.test(path)) continue;
            const source = readFileSync(join(root, path), 'utf8');
            const count = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
            if (count > LIMIT) problems.push(`${path}: ${count} lines`);
        }
    }
    return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const problems = checkSize(process.cwd());
    if (problems.length) {
        console.error(
            `Files over ${LIMIT} lines:\n${problems.join('\n')}\n` +
                'Deepen a module or split by concept: see "File size cap" in docs/agents/testing.md.',
        );
        process.exit(1);
    }
}
