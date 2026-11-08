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
      CREATE TABLE IF NOT EXISTS branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER NOT NULL, end INTEGER NOT NULL, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL);
      UPDATE messages SET status='interrupted' WHERE status='streaming';`);
    const columns = this.db.prepare('PRAGMA table_info(trees)').all().map(c => c.name);
    if (!columns.includes('provider')) this.db.exec("ALTER TABLE trees ADD COLUMN provider TEXT NOT NULL DEFAULT 'codex'");
    if (!columns.includes('model')) this.db.exec('ALTER TABLE trees ADD COLUMN model TEXT');
    if (!columns.includes('working_model')) this.db.exec('ALTER TABLE trees ADD COLUMN working_model TEXT; UPDATE trees SET working_model=model');
    if (!columns.includes('x')) this.db.exec('ALTER TABLE trees ADD COLUMN x REAL');
    if (!columns.includes('y')) this.db.exec('ALTER TABLE trees ADD COLUMN y REAL');
  }
  list() { return this.db.prepare('SELECT t.id,t.title,t.created,t.x,t.y,b.parent,b.messageId,b.start,b.end,b.text AS passage FROM trees t LEFT JOIN branches b ON b.child=t.id ORDER BY t.created DESC,t.rowid DESC').all(); }
  position(id, x, y) { this.db.prepare('UPDATE trees SET x=?,y=? WHERE id=?').run(x, y, id); }
  tree(id) {
    const tree = this.db.prepare('SELECT * FROM trees WHERE id=?').get(id);
    const branch = this.db.prepare('SELECT parent,messageId,start,end,text,question,snapshot FROM branches WHERE child=?').get(id);
    return tree && { ...tree, branch: branch ? { ...branch } : null, messages: this.db.prepare('SELECT id,role,text,status FROM messages WHERE tree=? ORDER BY seq').all(id) };
  }
  create(title) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO trees(id,title,created) VALUES(?,?,?)').run(id, title, Date.now());
    return this.tree(id);
  }
  branch(parent, anchor, snapshot) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const child = this.create(anchor.question.trim().slice(0, 200));
      this.db.prepare('UPDATE trees SET provider=?,model=?,working_model=? WHERE id=?').run(parent.provider, parent.model, parent.working_model ?? parent.model, child.id);
      this.db.prepare('INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot) VALUES(?,?,?,?,?,?,?,?)').run(child.id, parent.id, anchor.messageId, anchor.start, anchor.end, anchor.text, anchor.question, snapshot);
      this.db.exec('COMMIT');
      return this.tree(child.id);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  thread(id, thread, model) { this.db.prepare('UPDATE trees SET thread=?,model=COALESCE(?,model) WHERE id=?').run(thread, model ?? null, id); }
  model(id, model) { this.db.prepare('UPDATE trees SET model=? WHERE id=?').run(model, id); }
  finishModel(id, completed) { this.db.prepare(completed ? 'UPDATE trees SET working_model=model WHERE id=?' : 'UPDATE trees SET model=working_model WHERE id=?').run(id); }
  message(tree, role, text, status) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO messages(id,tree,role,text,status) VALUES(?,?,?,?,?)').run(id, tree, role, text, status);
    return id;
  }
  update(id, text, status) { this.db.prepare('UPDATE messages SET text=?,status=? WHERE id=?').run(text, status, id); }
  close() { this.db.close(); }
}
