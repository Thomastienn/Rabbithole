import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCli, cliPath } from '../../server/providers/findCli.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';

const home = '/home/learner';
const find = (name, files, { PATH = '/usr/bin:/bin', npm = '/opt/npm/bin', ...env } = {}) =>
  findCli(name, { env: { PATH, ...env }, home, exists: (p) => files.includes(p), npm: () => npm });

test('detection checks PATH before the usual Linux install folders', () => {
  assert.equal(find('claude', ['/bin/claude', `${home}/.local/bin/claude`]), '/bin/claude');
  assert.equal(find('claude', [`${home}/.local/bin/claude`]), `${home}/.local/bin/claude`);
  assert.equal(find('claude', [`${home}/.claude/local/claude`]), `${home}/.claude/local/claude`);
  assert.equal(find('codex', ['/opt/npm/bin/codex']), '/opt/npm/bin/codex');
  assert.equal(
    find('codex', ['/home/linuxbrew/.linuxbrew/bin/codex']),
    '/home/linuxbrew/.linuxbrew/bin/codex',
  );
  assert.equal(find('codex', ['/brew/bin/codex'], { HOMEBREW_PREFIX: '/brew' }), '/brew/bin/codex');
  assert.equal(find('codex', [], { npm: null }), null);
});

test('a missing CLI is found once installed, and a found path is remembered', () => {
  const files = [];
  let looks = 0;
  const bin = cliPath(
    'claude',
    (name) => (looks++, find(name, files)),
    (p) => files.includes(p),
  );
  assert.equal(bin(), null);
  files.push(`${home}/.local/bin/claude`);
  assert.equal(bin(), `${home}/.local/bin/claude`, 'Check again re-detects without a restart');
  assert.equal(bin(), `${home}/.local/bin/claude`);
  assert.equal(looks, 2, 'a found path is not searched again');
});

const child = (reply) => {
  const c = new EventEmitter();
  c.stdout = new PassThrough();
  c.stderr = new PassThrough();
  c.kill = () => {};
  c.stdin = { end: () => reply(c), write: () => {} };
  return c;
};

test('Claude replies and auth checks use the found path; a missing CLI is not connected', async () => {
  const commands = [];
  const path = `${home}/.local/bin/claude`;
  let bin = path;
  const claude = new Claude(
    mkdtempSync(join(tmpdir(), 'tt-cli-')),
    (cmd) => {
      commands.push(cmd);
      return child((c) => {
        c.stdout.end(JSON.stringify({ type: 'result', is_error: false, result: 'Hi' }) + '\n');
        c.stdout.on('end', () => c.emit('close', 0));
      });
    },
    (cmd, _args, _opts, cb) => (commands.push(cmd), cb(null, '{"loggedIn":true}')),
    () => bin,
  );
  assert.deepEqual(await claude.status(), { connected: true, email: null });
  await claude.generate(
    { model: 'sonnet', thread: 's', messages: [] },
    'Hello',
    () => {},
    () => {},
    new AbortController().signal,
  );
  assert.deepEqual(commands, [path, path]);
  bin = null;
  assert.equal(claude.installed(), false);
  assert.deepEqual(await claude.status(), { connected: false, email: null });
  await assert.rejects(claude.models(), /not signed in/);
  assert.equal(commands.length, 2, 'nothing runs without a CLI');
});

test('Codex launches the found path; a missing CLI fails its model list', async () => {
  const commands = [];
  let bin = null;
  const codex = new Codex(
    { token: async () => 't' },
    mkdtempSync(join(tmpdir(), 'tt-cli-')),
    (cmd) => {
      commands.push(cmd);
      const c = child(() => {});
      // Answers initialize so no RPC timer is left running.
      c.stdin.write = (line) => {
        const { id } = JSON.parse(line);
        if (id) c.stdout.write(JSON.stringify({ id, result: {} }) + '\n');
      };
      return c;
    },
    null,
    () => bin,
  );
  assert.equal(codex.installed(), false);
  await assert.rejects(codex.models(), /Codex is not installed/);
  bin = '/opt/npm/bin/codex';
  await codex.ready();
  codex.close();
  assert.deepEqual(commands, ['/opt/npm/bin/codex']);
});
