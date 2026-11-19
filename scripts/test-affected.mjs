// Runs the fast test files that reach a changed or untracked path through imports; slow ones wait for the backlog gate.
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export const ALL = 'all';
const TEST = /^test\/.*\.test\.mjs$/;
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g;

// changed: repo-relative paths; tests: test files; read(path) returns source or null.
export function selectTests(changed, tests, read) {
  const changes = new Set(changed);
  if (changed.some((path) => path === 'package.json' || path.startsWith('test/support/'))) {
    return ALL;
  }
  const sources = new Map();
  const load = (path) => {
    if (!sources.has(path)) sources.set(path, read(path));
    return sources.get(path);
  };
  const reaches = (test) => {
    const seen = new Set([test]);
    for (const path of seen) {
      if (changes.has(path)) return true;
      for (const [, specifier] of (load(path) ?? '').matchAll(IMPORT)) {
        if (!/^\.{1,2}\//.test(specifier)) continue; // package imports
        const base = normalize(join(dirname(path), specifier)).replaceAll('\\', '/');
        // Same resolution as test/support/tsx.mjs; a deleted file still counts as changed.
        const target = [base, `${base}.ts`, `${base}.tsx`].find(
          (candidate) => changes.has(candidate) || load(candidate) !== null,
        );
        if (target) seen.add(target);
      }
    }
    return false;
  };
  return tests.filter((test) => reaches(test));
}

function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const git = (...args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
      .split('\n')
      .filter(Boolean);
  const changed = [
    ...git('diff', '--name-only', '--no-renames', 'HEAD'),
    ...git('ls-files', '--others', '--exclude-standard'),
  ];
  const tests = readdirSync('test', { recursive: true })
    .map((path) => `test/${path.replaceAll('\\', '/')}`)
    .filter((path) => TEST.test(path))
    .sort();
  const selected = selectTests(changed, tests, readOrNull);
  if (!selected.length) {
    console.log('No tests are affected by the current changes.');
    process.exit(0);
  }
  const files = selected === ALL ? ['test/**/*.test.mjs'] : selected;
  console.log(
    selected === ALL ? 'Running every fast test.' : `Running ${files.length} affected test files.`,
  );
  const { status } = spawnSync(
    'systemd-run',
    [
      '--user',
      '--scope',
      '-q',
      '-p',
      'MemoryHigh=5G',
      '-p',
      'MemorySwapMax=2G',
      '-p',
      'CPUQuota=200%',
      'node',
      '--import',
      './test/support/tsx.mjs',
      '--test',
      '--test-concurrency=2',
      // A leaked handle or a stuck wait must end the run with a failure, not hang it.
      '--test-force-exit',
      '--test-timeout=120000',
      ...files,
    ],
    { stdio: 'inherit' },
  );
  process.exit(status ?? 1);
}
