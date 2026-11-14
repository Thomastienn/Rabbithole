import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

const schemas = JSON.parse(
  readFileSync(new URL('../fixtures/store-schemas.json', import.meta.url)),
);

test('every historical schema upgrades without losing saved trees; backup keeps pre-migration data', () => {
  for (const { commits, sql } of schemas) {
    const dir = mkdtempSync(join(tmpdir(), 'treetutor-upgrade-')),
      path = join(dir, 'trees.sqlite');
    const old = new DatabaseSync(path);
    // Fixture setup is one committed snapshot; keep the separate WAL write below.
    old.exec('BEGIN');
    old.exec(sql.join(';'));
    old.exec(
      "INSERT INTO trees(id,title,thread,created) VALUES('root','Saved learning tree','native-session',1),('child','Child question',NULL,2);",
    );
    const fields = {
      provider: 'claude',
      model: 'opus',
      working_model: 'sonnet',
      working_provider: 'codex',
      working_thread: 'previous-session',
      x: 23,
      y: -42,
      layout: '{"folded":["child"],"selected":"child","panel":"expanded"}',
      title_renamed: 1,
    };
    for (const { name } of old.prepare('PRAGMA table_info(trees)').all())
      if (Object.hasOwn(fields, name)) old.prepare(`UPDATE trees SET ${name}=?`).run(fields[name]);
    old.exec(
      "INSERT INTO messages(id,tree,role,text,status) VALUES('question','root','user','Original question','completed'),('answer','root','assistant','Peterson 🌲','completed'),('partial','child','assistant','Saved partial','streaming');",
    );
    if (sql.some((s) => s.startsWith('CREATE TABLE branches')))
      old.exec(
        "INSERT INTO branches VALUES('child','root','answer',0,8,'Peterson','Child question','Frozen inherited facts');",
      );
    if (sql.some((s) => s.startsWith('CREATE TABLE artifacts')))
      old.exec(
        "INSERT INTO artifacts(id,conversation,message,kind,status,title,description,source,created) VALUES('diagram','root','answer','mermaid','ready','Lock','A lock','flowchart LR; A-->B',3);",
      );
    old.exec('COMMIT');
    const before = Object.fromEntries(
      old
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map(({ name }) => [name, old.prepare(`SELECT * FROM ${name}`).all()]),
    );
    // Keep the writer open: the backup must include committed WAL data too.
    old.exec('PRAGMA journal_mode=WAL');
    old.exec(
      "INSERT INTO messages(id,tree,role,text,status) VALUES('wal','root','user','Committed in WAL','completed')",
    );
    before.messages = old.prepare('SELECT * FROM messages').all();
    const store = new Store(path);
    try {
      assert.deepEqual(
        store
          .list()
          .map((t) => t.id)
          .sort(),
        ['child', 'root'],
        commits.join(','),
      );
      assert.equal(store.tree('root').thread, 'native-session');
      assert.equal(store.tree('root').messages.at(-1).text, 'Committed in WAL');
      assert.equal(store.tree('child').messages[0].status, 'interrupted');
      for (const row of before.trees)
        for (const [name, value] of Object.entries(row)) {
          const saved =
            name === 'layout'
              ? JSON.stringify(store.list().find((t) => t.id === row.id).layout)
              : store.tree(row.id)[name];
          assert.equal(saved, value, `${commits.join(',')}: ${row.id}.${name}`);
        }
      if (before.branches)
        assert.equal(store.tree('child').branch.snapshot, 'Frozen inherited facts');
      if (before.artifacts)
        assert.equal(store.tree('root').artifacts[0].source, 'flowchart LR; A-->B');
      assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 1);
      const backups = readdirSync(dir).filter((f) => /backup-.*\.sqlite$/.test(f));
      assert.equal(backups.length, 1);
      assert.match(backups[0], /backup-\d{4}-\d{2}-\d{2}T/);
      assert.equal(statSync(join(dir, backups[0])).mode & 0o777, 0o600);
      const backup = new DatabaseSync(join(dir, backups[0]), { readOnly: true });
      try {
        assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 0);
        for (const [name, rows] of Object.entries(before))
          assert.deepEqual(backup.prepare(`SELECT * FROM ${name}`).all(), rows);
        assert.equal(
          backup.prepare("SELECT status FROM messages WHERE id='partial'").get().status,
          'streaming',
        );
      } finally {
        backup.close();
      }
    } finally {
      store.close();
      old.close();
    }
    const reopened = new Store(path);
    reopened.close();
    assert.equal(
      readdirSync(dir).filter((f) => /backup-.*\.sqlite$/.test(f)).length,
      1,
      'current schemas do not need another migration backup',
    );
  }
});

test('failed upgrade rolls back and retains its backup; newer schemas are refused without changing data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-migration-failure-')),
    path = join(dir, 'trees.sqlite');
  const old = new DatabaseSync(path);
  old.exec(schemas[0].sql.join(';'));
  old.exec(
    "INSERT INTO trees VALUES('root','Keep this tree',NULL,1); CREATE TRIGGER fail_upgrade BEFORE UPDATE ON trees BEGIN SELECT RAISE(ABORT, 'fixture migration failure'); END;",
  );
  const before = old.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
  assert.throws(() => new Store(path), /fixture migration failure/);
  assert.deepEqual(old.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(), before);
  assert.equal(old.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(old.prepare('SELECT title FROM trees').get().title, 'Keep this tree');
  assert.equal(readdirSync(dir).filter((f) => /backup-.*\.sqlite$/.test(f)).length, 1);
  old.exec('PRAGMA user_version=2');
  old.close();
  const bytes = readFileSync(path);
  assert.throws(() => new Store(path), /schema 2 is newer/);
  assert.deepEqual(readFileSync(path), bytes);
});
