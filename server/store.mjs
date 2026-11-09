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
      CREATE INDEX IF NOT EXISTS messages_tree_seq ON messages(tree, seq);
      CREATE TABLE IF NOT EXISTS branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER NOT NULL, end INTEGER NOT NULL, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL);
      UPDATE messages SET status='interrupted' WHERE status='streaming';`);
    const columns = this.db.prepare('PRAGMA table_info(trees)').all().map(c => c.name);
    if (!columns.includes('provider')) this.db.exec("ALTER TABLE trees ADD COLUMN provider TEXT NOT NULL DEFAULT 'codex'");
    if (!columns.includes('model')) this.db.exec('ALTER TABLE trees ADD COLUMN model TEXT');
    if (!columns.includes('working_model')) this.db.exec('ALTER TABLE trees ADD COLUMN working_model TEXT; UPDATE trees SET working_model=model');
    if (!columns.includes('x')) this.db.exec('ALTER TABLE trees ADD COLUMN x REAL');
    if (!columns.includes('y')) this.db.exec('ALTER TABLE trees ADD COLUMN y REAL');
    if (!columns.includes('layout')) this.db.exec('ALTER TABLE trees ADD COLUMN layout TEXT');
    if (!columns.includes('working_provider')) this.db.exec('ALTER TABLE trees ADD COLUMN working_provider TEXT; UPDATE trees SET working_provider=provider');
  }
  list() {
    return this.db.prepare('SELECT t.id,t.title,t.created,t.x,t.y,t.layout,EXISTS(SELECT 1 FROM messages m WHERE m.tree=t.id) AS started,b.parent,b.messageId,b.start,b.end,b.text AS passage FROM trees t LEFT JOIN branches b ON b.child=t.id ORDER BY t.created DESC,t.rowid DESC').all()
      .map(t => { try { return { ...t, layout: JSON.parse(t.layout) }; } catch { return { ...t, layout: null }; } });
  }
  previews(ids) {
    const question = this.db.prepare("SELECT seq, substr(text,1,512) AS text, length(text)>512 AS truncated FROM messages WHERE tree=? AND role='user' ORDER BY seq DESC LIMIT 1");
    const answer = this.db.prepare("SELECT substr(text,1,512) AS text, length(text)>512 AS truncated, status FROM messages WHERE tree=? AND role='assistant' AND seq>? ORDER BY seq LIMIT 1");
    return Object.fromEntries(ids.map(id => {
      const q = question.get(id);
      const a = q && answer.get(id, q.seq);
      const text = m => m ? m.text + (m.truncated ? '…' : '') : null;
      return [id, { question: text(q), answer: text(a), status: a?.status ?? null }];
    }));
  }
  layout(id, layout, positions = {}) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE trees SET layout=? WHERE id=?').run(JSON.stringify(layout), id);
      for (const [p, at] of Object.entries(positions)) this.position(p, at.x, at.y);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  position(id, x, y) { this.db.prepare('UPDATE trees SET x=?,y=? WHERE id=?').run(x, y, id); }
  tree(id) {
    const { layout, ...tree } = this.db.prepare('SELECT * FROM trees WHERE id=?').get(id) ?? {};
    const branch = this.db.prepare('SELECT parent,messageId,start,end,text,question,snapshot FROM branches WHERE child=?').get(id);
    return tree.id && { ...tree, branch: branch ? { ...branch } : null, messages: this.db.prepare('SELECT id,role,text,status FROM messages WHERE tree=? ORDER BY seq').all(id) };
  }
  create(title, provider = 'codex') {
    const id = randomUUID();
    this.db.prepare('INSERT INTO trees(id,title,created,provider,working_provider) VALUES(?,?,?,?,?)').run(id, title, Date.now(), provider, provider);
    return this.tree(id);
  }
  branch(parent, anchor, snapshot) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const child = this.create(anchor.question.trim().slice(0, 200));
      this.db.prepare('UPDATE trees SET provider=?,model=?,working_model=?,working_provider=? WHERE id=?').run(parent.provider, parent.model, parent.working_model ?? parent.model, parent.working_provider ?? parent.provider, child.id);
      this.db.prepare('INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot) VALUES(?,?,?,?,?,?,?,?)').run(child.id, parent.id, anchor.messageId, anchor.start, anchor.end, anchor.text, anchor.question, snapshot);
      this.db.exec('COMMIT');
      return this.tree(child.id);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  thread(id, thread, model) { this.db.prepare('UPDATE trees SET thread=?,model=COALESCE(?,model) WHERE id=?').run(thread, model ?? null, id); }
  model(id, model) { this.db.prepare('UPDATE trees SET model=? WHERE id=?').run(model, id); }
  // Provider sessions are not portable: switching drops the thread so the next provider receives saved history.
  switchProvider(id, provider, model) { this.db.prepare('UPDATE trees SET provider=?,model=?,thread=NULL WHERE id=?').run(provider, model, id); }
  finishModel(id, completed) {
    this.db.prepare(completed ? 'UPDATE trees SET working_model=model,working_provider=provider WHERE id=?'
      : 'UPDATE trees SET model=working_model,thread=CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE NULL END,provider=COALESCE(working_provider,provider) WHERE id=?').run(id);
  }
  message(tree, role, text, status) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO messages(id,tree,role,text,status) VALUES(?,?,?,?,?)').run(id, tree, role, text, status);
    return id;
  }
  update(id, text, status) { this.db.prepare('UPDATE messages SET text=?,status=? WHERE id=?').run(text, status, id); }
  close() { this.db.close(); }
}
