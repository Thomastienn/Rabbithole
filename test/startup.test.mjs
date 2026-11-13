import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, statSync, cpSync, symlinkSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { Store } from '../server/store.mjs';

// Captured from the constructors of every historical store commit; no Git needed at test time.
const schemas = JSON.parse(readFileSync(new URL('./fixtures/store-schemas.json', import.meta.url)));

function launch(dir, port = 0, env = {}, cwd = process.cwd(), command = ['server/main.mjs']) {
  const child = spawn(process.execPath, command, { cwd, env: { ...process.env, PATH: dir, TREETUTOR_DATA_DIR: dir, TREETUTOR_PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  const waitFor = async pattern => {
    const deadline = Date.now() + 20000;
    while (!pattern.test(output)) {
      if (child.exitCode !== null || Date.now() > deadline) throw new Error(`Startup failed: ${output}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return output.match(pattern);
  };
  return { child, exited, waitFor, output: () => output, stop: async () => { if (child.exitCode === null) child.kill('SIGTERM'); await exited; } };
}

test('every historical schema upgrades without losing saved trees; backup keeps pre-migration data', () => {
  for (const { commits, sql } of schemas) {
    const dir = mkdtempSync(join(tmpdir(), 'treetutor-upgrade-')), path = join(dir, 'trees.sqlite');
    const old = new DatabaseSync(path);
    old.exec(sql.join(';'));
    old.exec("INSERT INTO trees(id,title,thread,created) VALUES('root','Saved learning tree','native-session',1),('child','Child question',NULL,2);");
    const fields = { provider: 'claude', model: 'opus', working_model: 'sonnet', working_provider: 'codex', working_thread: 'previous-session', x: 23, y: -42, layout: '{"folded":["child"],"selected":"child","panel":"expanded"}', title_renamed: 1 };
    for (const { name } of old.prepare('PRAGMA table_info(trees)').all()) if (Object.hasOwn(fields, name)) old.prepare(`UPDATE trees SET ${name}=?`).run(fields[name]);
    old.exec("INSERT INTO messages(id,tree,role,text,status) VALUES('question','root','user','Original question','completed'),('answer','root','assistant','Peterson 🌲','completed'),('partial','child','assistant','Saved partial','streaming');");
    if (sql.some(s => s.startsWith('CREATE TABLE branches'))) old.exec("INSERT INTO branches VALUES('child','root','answer',0,8,'Peterson','Child question','Frozen inherited facts');");
    if (sql.some(s => s.startsWith('CREATE TABLE artifacts'))) old.exec("INSERT INTO artifacts(id,conversation,message,kind,status,title,description,source,created) VALUES('diagram','root','answer','mermaid','ready','Lock','A lock','flowchart LR; A-->B',3);");
    const before = Object.fromEntries(old.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(({ name }) => [name, old.prepare(`SELECT * FROM ${name}`).all()]));
    // Keep the writer open: the backup must include committed WAL data too.
    old.exec('PRAGMA journal_mode=WAL');
    old.exec("INSERT INTO messages(id,tree,role,text,status) VALUES('wal','root','user','Committed in WAL','completed')");
    before.messages = old.prepare('SELECT * FROM messages').all();
    const store = new Store(path);
    try {
      assert.deepEqual(store.list().map(t => t.id).sort(), ['child', 'root'], commits.join(','));
      assert.equal(store.tree('root').thread, 'native-session');
      assert.equal(store.tree('root').messages.at(-1).text, 'Committed in WAL');
      assert.equal(store.tree('child').messages[0].status, 'interrupted');
      for (const row of before.trees) for (const [name, value] of Object.entries(row)) {
        const saved = name === 'layout' ? JSON.stringify(store.list().find(t => t.id === row.id).layout) : store.tree(row.id)[name];
        assert.equal(saved, value, `${commits.join(',')}: ${row.id}.${name}`);
      }
      if (before.branches) assert.equal(store.tree('child').branch.snapshot, 'Frozen inherited facts');
      if (before.artifacts) assert.equal(store.tree('root').artifacts[0].source, 'flowchart LR; A-->B');
      assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 1);
      const backups = readdirSync(dir).filter(f => /backup-.*\.sqlite$/.test(f));
      assert.equal(backups.length, 1);
      assert.match(backups[0], /backup-\d{4}-\d{2}-\d{2}T/);
      assert.equal(statSync(join(dir, backups[0])).mode & 0o777, 0o600);
      const backup = new DatabaseSync(join(dir, backups[0]), { readOnly: true });
      try {
        assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 0);
        for (const [name, rows] of Object.entries(before)) assert.deepEqual(backup.prepare(`SELECT * FROM ${name}`).all(), rows);
        assert.equal(backup.prepare("SELECT status FROM messages WHERE id='partial'").get().status, 'streaming');
      } finally { backup.close(); }
    } finally { store.close(); old.close(); }
    const reopened = new Store(path);
    reopened.close();
    assert.equal(readdirSync(dir).filter(f => /backup-.*\.sqlite$/.test(f)).length, 1, 'current schemas do not need another migration backup');
  }
});

test('one start command builds absent or changed assets and reuses a current build', async () => {
  const checkout = mkdtempSync(join(tmpdir(), 'treetutor-launcher-'));
  const data = mkdtempSync(join(tmpdir(), 'treetutor-launcher-data-'));
  for (const path of ['scripts', 'server', 'src']) cpSync(path, join(checkout, path), { recursive: true });
  for (const path of ['index.html', 'package-lock.json', 'tsconfig.json', 'vite.config.ts']) cpSync(path, join(checkout, path));
  symlinkSync(join(process.cwd(), 'node_modules'), join(checkout, 'node_modules'), 'dir');
  // Fixture build subprocess: launcher/server are real; full TypeScript/Vite build runs in delivery checks.
  writeFileSync(join(checkout, 'package.json'), JSON.stringify({ type: 'module', scripts: { start: 'node scripts/start.mjs', build: 'node build-fixture.mjs && node scripts/build-state.mjs' } }));
  writeFileSync(join(checkout, 'build-fixture.mjs'), `
    import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
    mkdirSync('dist', { recursive: true });
    writeFileSync('dist/index.html', '<!doctype html><title>TreeTutor build fixture</title>');
    appendFileSync('builds', 'built\\n');
  `);
  const env = { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: join(data, 'signed-out-claude') };
  async function startAndStop() {
    const running = launch(data, 0, env, checkout, ['scripts/start.mjs', '--port', '0']);
    try {
      const [, origin] = await running.waitFor(/TreeTutor: (http:\/\/127\.0\.0\.1:\d+)/);
      assert.match(await (await fetch(origin)).text(), /TreeTutor build fixture/);
      return running.output();
    } finally { await running.stop(); }
  }
  assert.match(await startAndStop(), /Building.*missing or stale/);
  assert.equal(readFileSync(join(checkout, 'builds'), 'utf8'), 'built\n');
  assert.doesNotMatch(await startAndStop(), /Building/);
  appendFileSync(join(checkout, 'src/main.tsx'), '\n// Changed source fixture\n');
  assert.match(await startAndStop(), /Building/);
  assert.equal(readFileSync(join(checkout, 'builds'), 'utf8'), 'built\nbuilt\n');
  writeFileSync(join(checkout, 'dist/index.html'), 'Stale output');
  assert.match(await startAndStop(), /Building/);
  assert.equal(readFileSync(join(checkout, 'builds'), 'utf8'), 'built\nbuilt\nbuilt\n');
  writeFileSync(join(checkout, 'build-fixture.mjs'), 'process.exit(7);');
  appendFileSync(join(checkout, 'src/main.tsx'), '\n// Requires another build\n');
  const failed = launch(data, 0, env, checkout, ['scripts/start.mjs']);
  try {
    assert.equal(await failed.exited, 1);
    assert.match(failed.output(), /npm run build failed.*npm start again/);
    assert.doesNotMatch(failed.output(), /TreeTutor: http/);
  } finally { await failed.stop(); }
});

test('unsupported Node gives an actionable requirement before trying to load the app', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-old-node-'));
  // Runtime-version fixture; this verifies the diagnostic branch, not execution on an installed Node 22.
  const running = launch(dir, 0, {}, process.cwd(), ['--input-type=module', '-e', "Object.defineProperty(process.versions, 'node', { value: '22.0.0' }); await import('./scripts/start.mjs');"]);
  try {
    assert.equal(await running.exited, 1);
    assert.match(running.output(), /requires Node 24 or newer; found 22.0.0/);
    assert.match(running.output(), /nodejs.org/);
    assert.match(running.output(), /npm start/);
    assert.doesNotMatch(running.output(), /ERR_UNKNOWN|node:sqlite|Building/);
  } finally { await running.stop(); }
});

test('main starts an old database without providers; busy port explains how to choose another', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-start-')), path = join(dir, 'trees.sqlite');
  const old = new DatabaseSync(path);
  old.exec(schemas[0].sql.join(';'));
  old.exec("INSERT INTO trees VALUES('saved','Saved before upgrade',NULL,1); INSERT INTO trees VALUES('empty','New chat',NULL,2); INSERT INTO messages(id,tree,role,text,status) VALUES('m1','saved','user','Question','completed')");
  old.close();
  const occupied = createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const port = occupied.address().port;
  const busy = launch(dir, port);
  try {
    assert.equal(await busy.exited, 1);
    assert.match(busy.output(), new RegExp(`Port ${port}.*already in use`));
    assert.match(busy.output(), /npm start -- --port/);
    assert.doesNotMatch(busy.output(), /Unhandled|at Server\./);
  } finally { await busy.stop(); await new Promise(resolve => occupied.close(resolve)); }
  const running = launch(dir);
  try {
    const [, origin] = await running.waitFor(/TreeTutor: (http:\/\/127\.0\.0\.1:\d+)/);
    await running.waitFor(/Saved trees remain available/);
    assert.match(running.output(), /Node.*24/);
    assert.match(running.output(), /Claude Code: not installed/);
    assert.match(running.output(), /claude.ai\/install.sh/);
    assert.match(running.output(), /Codex: not installed/);
    assert.match(running.output(), /npm install -g @openai\/codex/);
    assert.match(running.output(), /Continue with ChatGPT/);
    assert.ok(running.output().includes(dir));
    const state = await (await fetch(origin + '/api/state')).json();
    assert.equal(state.auth.connected, false);
    assert.deepEqual(state.trees.map(t => t.title), ['Saved before upgrade'], 'startup removes the tree with no messages and keeps the one with a message');
    assert.equal((await (await fetch(origin + '/api/trees/saved')).json()).id, 'saved');
    const duplicate = launch(dir);
    try {
      assert.equal(await duplicate.exited, 1);
      assert.match(duplicate.output(), /already using data directory/);
      assert.equal((await fetch(origin + '/api/state')).status, 200);
    } finally { await duplicate.stop(); }
  } finally { await running.stop(); }
  assert.equal(readdirSync(dir).filter(f => /backup-.*\.sqlite$/.test(f)).length, 1);
  const restarted = launch(dir);
  try { await restarted.waitFor(/TreeTutor: http:/); }
  finally { await restarted.stop(); }
});

test('preflight distinguishes installed sign-out from saved connections without exposing account details', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-preflight-'));
  writeFileSync(join(dir, 'codex'), '#!/bin/sh\nprintf "codex-cli fixture\\n"\n', { mode: 0o700 });
  for (const connected of [false, true]) {
    writeFileSync(join(dir, 'claude'), `#!/bin/sh\nif [ "$1" = "--version" ]; then printf 'Claude fixture'; else printf '{"loggedIn":${connected},"email":"private@example.com"}'; fi\n`, { mode: 0o700 });
    if (connected) writeFileSync(join(dir, 'chatgpt.json'), '{"email":"private@example.com"}', { mode: 0o600 });
    const running = launch(dir);
    try {
      await running.waitFor(/Saved trees remain available/);
      assert.match(running.output(), connected ? /Claude Code: installed and signed in/ : /Claude Code: installed; signed out/);
      assert.match(running.output(), connected ? /Codex: installed; ChatGPT connection saved/ : /Codex: installed; ChatGPT not connected/);
      if (!connected) assert.match(running.output(), /reload TreeTutor/);
      assert.doesNotMatch(running.output(), /private@example.com/);
    } finally { await running.stop(); }
  }
});

test('failed upgrade rolls back and retains its backup; newer schemas are refused without changing data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-migration-failure-')), path = join(dir, 'trees.sqlite');
  const old = new DatabaseSync(path);
  old.exec(schemas[0].sql.join(';'));
  old.exec("INSERT INTO trees VALUES('root','Keep this tree',NULL,1); CREATE TRIGGER fail_upgrade BEFORE UPDATE ON trees BEGIN SELECT RAISE(ABORT, 'fixture migration failure'); END;");
  const before = old.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
  assert.throws(() => new Store(path), /fixture migration failure/);
  assert.deepEqual(old.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(), before);
  assert.equal(old.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(old.prepare('SELECT title FROM trees').get().title, 'Keep this tree');
  assert.equal(readdirSync(dir).filter(f => /backup-.*\.sqlite$/.test(f)).length, 1);
  old.exec('PRAGMA user_version=2');
  old.close();
  const bytes = readFileSync(path);
  assert.throws(() => new Store(path), /schema 2 is newer/);
  assert.deepEqual(readFileSync(path), bytes);
});
