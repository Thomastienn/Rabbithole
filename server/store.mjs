import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, tree TEXT NOT NULL REFERENCES trees(id), role TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL);
      UPDATE messages SET status='interrupted' WHERE status='streaming';`);
  }
  list() { return this.db.prepare('SELECT id,title,created FROM trees ORDER BY created DESC,rowid DESC').all(); }
  tree(id) {
    const tree = this.db.prepare('SELECT * FROM trees WHERE id=?').get(id);
    return tree && { ...tree, messages: this.db.prepare('SELECT id,role,text,status FROM messages WHERE tree=? ORDER BY seq').all(id) };
  }
  create(title) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO trees(id,title,created) VALUES(?,?,?)').run(id, title, Date.now());
    return this.tree(id);
  }
  thread(id, thread) { this.db.prepare('UPDATE trees SET thread=? WHERE id=?').run(thread, id); }
  message(tree, role, text, status) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO messages(id,tree,role,text,status) VALUES(?,?,?,?,?)').run(id, tree, role, text, status);
    return id;
  }
  update(id, text, status) { this.db.prepare('UPDATE messages SET text=?,status=? WHERE id=?').run(text, status, id); }
  close() { this.db.close(); }
}
