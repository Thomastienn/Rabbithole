import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cwd = mkdtempSync(join(tmpdir(), 'treetutor-git-sandbox-'));
const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
git('init', '-q');
git('config', 'user.name', 'Sandbox fixture');
git('config', 'user.email', 'sandbox@example.invalid');
writeFileSync(join(cwd, 'unrelated.txt'), 'original\n');
git('add', 'unrelated.txt');
git('commit', '-qm', 'Fixture baseline');
writeFileSync(join(cwd, 'unrelated.txt'), 'unrelated staged edit\n');
git('add', 'unrelated.txt');
writeFileSync(join(cwd, 'task.txt'), 'task change\n');
const roots = readFileSync(new URL('../.codex/config.toml', import.meta.url), 'utf8')
  .match(/^writable_roots\s*=\s*(.+)$/m)?.[1];
assert.ok(roots, 'Project must explicitly allow Git metadata writes');
const sandbox = (...args) => spawnSync('codex', [
  'sandbox', '-c', 'sandbox_mode="workspace-write"', ...args,
], { cwd, encoding: 'utf8' });
const denied = sandbox('--', 'git', 'add', '--', 'task.txt');
assert.notEqual(denied.status, 0, 'Default workspace sandbox must reproduce the reported Git failure');
assert.match(denied.stderr, /index.lock.*(?:Read-only|Permission denied)/i);
const run = (...args) => {
  const result = sandbox('-c', `sandbox_workspace_write.writable_roots=${roots}`, '--', ...args);
  assert.equal(result.status, 0, result.stderr);
};
run('git', 'add', '--', 'task.txt');
run('git', 'commit', '--only', '-m', 'chore: scoped sandbox fixture', '--', 'task.txt');
assert.equal(git('show', '--pretty=', '--name-only', 'HEAD'), 'task.txt');
assert.equal(git('diff', '--cached', '--name-only'), 'unrelated.txt');
console.log('PASS: default sandbox reproduces index.lock denial; project Git root permits scoped commit and preserves unrelated staged work.');
