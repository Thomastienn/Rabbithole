import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { previewText } from '../src/markdownText.ts';

const ARTIFACTS = `CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('mermaid','video')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','canceled','interrupted')),
        title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree));
      CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation, created);`;

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
      CREATE UNIQUE INDEX IF NOT EXISTS messages_id_tree ON messages(id, tree);
      ${ARTIFACTS}
      CREATE TABLE IF NOT EXISTS branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER NOT NULL, end INTEGER NOT NULL, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL);
      UPDATE messages SET status='interrupted' WHERE status='streaming';`);
    // Older databases gain the video kind, job columns and job statuses; SQLite cannot alter a CHECK in place.
    if (!this.db.prepare("SELECT sql FROM sqlite_master WHERE name='artifacts'").get().sql.includes("'interrupted'")) {
      const kept = this.db.prepare('PRAGMA table_info(artifacts)').all().map(c => c.name).join(',');
      this.db.exec(`BEGIN;
      ALTER TABLE artifacts RENAME TO artifacts_old;
      ${ARTIFACTS.replace('CREATE INDEX', 'DROP INDEX artifacts_conversation; CREATE INDEX')}
      INSERT INTO artifacts(${kept}) SELECT ${kept} FROM artifacts_old;
      DROP TABLE artifacts_old;
      COMMIT;`);
    }
    // Restart never resumes paid inference: unfinished videos wait for an explicit retry.
    this.db.exec(`UPDATE artifacts SET status='interrupted',error='Video generation was interrupted when TreeTutor stopped.' WHERE status='pending' AND kind='video';
      UPDATE artifacts SET status='failed',source=NULL,error='Diagram generation was interrupted when TreeTutor stopped.' WHERE status='pending';`);
    const columns = this.db.prepare('PRAGMA table_info(trees)').all().map(c => c.name);
    if (!columns.includes('provider')) this.db.exec("ALTER TABLE trees ADD COLUMN provider TEXT NOT NULL DEFAULT 'codex'");
    if (!columns.includes('model')) this.db.exec('ALTER TABLE trees ADD COLUMN model TEXT');
    if (!columns.includes('working_model')) this.db.exec('ALTER TABLE trees ADD COLUMN working_model TEXT; UPDATE trees SET working_model=model');
    if (!columns.includes('x')) this.db.exec('ALTER TABLE trees ADD COLUMN x REAL');
    if (!columns.includes('y')) this.db.exec('ALTER TABLE trees ADD COLUMN y REAL');
    if (!columns.includes('layout')) this.db.exec('ALTER TABLE trees ADD COLUMN layout TEXT');
    if (!columns.includes('working_provider')) this.db.exec('ALTER TABLE trees ADD COLUMN working_provider TEXT; UPDATE trees SET working_provider=provider');
    if (!columns.includes('working_thread')) this.db.exec('ALTER TABLE trees ADD COLUMN working_thread TEXT');
    if (!columns.includes('title_renamed')) this.db.exec('ALTER TABLE trees ADD COLUMN title_renamed INTEGER NOT NULL DEFAULT 0');
  }
  list() {
    return this.db.prepare('SELECT t.id,t.title,t.created,t.x,t.y,t.layout,b.parent,b.messageId,b.start,b.end,b.text AS passage FROM trees t LEFT JOIN branches b ON b.child=t.id ORDER BY t.created DESC,t.rowid DESC').all()
      .map(t => { try { return { ...t, layout: JSON.parse(t.layout) }; } catch { return { ...t, layout: null }; } });
  }
  // Strip reply syntax before truncation; the stored messages remain the canonical source.
  previews(ids) {
    const messages = this.db.prepare('SELECT id, role, text, status FROM messages WHERE tree=? ORDER BY seq');
    const artifacts = this.db.prepare('SELECT id,message,kind,title,status FROM artifacts WHERE conversation=? ORDER BY created,rowid');
    return Object.fromEntries(ids.map(id => {
      const byMessage = new Map();
      for (const { message, ...artifact } of artifacts.all(id)) {
        if (!byMessage.has(message)) byMessage.set(message, []);
        byMessage.get(message).push(artifact);
      }
      return [id, messages.all(id).map(m => ({ ...m, text: previewText(m.text, m.role), ...(byMessage.has(m.id) && { artifacts: byMessage.get(m.id) }) }))];
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
  rename(id, title) { this.db.prepare('UPDATE trees SET title=?,title_renamed=1 WHERE id=?').run(title, id); }
  descendants(id) {
    return this.db.prepare(`WITH RECURSIVE subtree(id) AS (SELECT id FROM trees WHERE id=? UNION SELECT child FROM branches JOIN subtree ON parent=subtree.id) SELECT id FROM subtree`).all(id).map(t => t.id);
  }
  remove(root, id, stageFiles) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.tree(root)?.branch || !this.descendants(root).includes(id)) throw new Error('Conversation does not belong to this chat.');
      const parent = this.tree(id).branch?.parent ?? null, deleted = this.descendants(id);
      const artifacts = deleted.flatMap(conversation => this.tree(conversation).artifacts);
      for (const conversation of deleted) this.db.prepare('DELETE FROM artifacts WHERE conversation=?').run(conversation);
      for (const conversation of deleted) this.db.prepare('DELETE FROM branches WHERE child=?').run(conversation);
      for (const conversation of deleted) this.db.prepare('DELETE FROM messages WHERE tree=?').run(conversation);
      for (const conversation of deleted) this.db.prepare('DELETE FROM trees WHERE id=?').run(conversation);
      if (parent) {
        const layout = this.list().find(t => t.id === root)?.layout;
        if (layout) this.db.prepare('UPDATE trees SET layout=? WHERE id=?').run(JSON.stringify({ ...layout, folded: layout.folded.filter(f => !deleted.includes(f)), selected: deleted.includes(layout.selected) ? parent : layout.selected }), root);
      }
      stageFiles(artifacts);
      this.db.exec('COMMIT');
      return { deleted, parent };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  tree(id) {
    const { layout, ...tree } = this.db.prepare('SELECT * FROM trees WHERE id=?').get(id) ?? {};
    const branch = this.db.prepare('SELECT parent,messageId,start,end,text,question,snapshot FROM branches WHERE child=?').get(id);
    return tree.id && { ...tree, branch: branch ? { ...branch } : null, messages: this.db.prepare('SELECT id,role,text,status FROM messages WHERE tree=? ORDER BY seq').all(id), artifacts: this.db.prepare('SELECT * FROM artifacts WHERE conversation=? ORDER BY created,rowid').all(id) };
  }
  artifact(conversation, id) { return this.db.prepare('SELECT * FROM artifacts WHERE conversation=? AND id=?').get(conversation, id); }
  hasArtifact(id) { return !!this.db.prepare('SELECT 1 FROM artifacts WHERE id=?').get(id); }
  // Videos keep their frozen task input and a server-issued attempt; their composition source stays in the job workspace.
  pendingArtifact(conversation, message, title, description, kind = 'mermaid', input = null) {
    const id = randomUUID();
    const result = this.db.prepare("INSERT INTO artifacts(id,conversation,message,kind,status,title,description,created,input,attempt) SELECT ?,?,?,?,'pending',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND tree=? AND role='assistant')").run(id, conversation, message, kind, title, description, Date.now(), input, kind === 'video' ? randomUUID() : null, message, conversation);
    if (!result.changes) throw new Error('Artifact message does not belong to this conversation.');
    return this.artifact(conversation, id);
  }
  finishArtifact(conversation, id, source, error = null) {
    this.db.prepare("UPDATE artifacts SET status=?,source=?,error=? WHERE conversation=? AND id=? AND kind='mermaid' AND status='pending'").run(error ? 'failed' : 'ready', error ? null : source, error, conversation, id);
    return this.artifact(conversation, id);
  }
  finishVideo(conversation, id, attempt, { description, duration } = {}, error = null) {
    this.db.prepare("UPDATE artifacts SET status=?,description=COALESCE(?,description),duration=?,error=? WHERE conversation=? AND id=? AND attempt=? AND kind='video' AND status='pending'").run(error ? 'failed' : 'ready', error ? null : description, error ? null : duration, error, conversation, id, attempt);
    return this.artifact(conversation, id);
  }
  cancelVideo(conversation, id) {
    this.db.prepare("UPDATE artifacts SET status='canceled',error=NULL WHERE conversation=? AND id=? AND kind='video' AND status='pending'").run(conversation, id);
    return this.artifact(conversation, id);
  }
  // A retry is a new attempt on the same row and frozen input, so late events from the old attempt cannot publish.
  retryVideo(conversation, id) {
    const result = this.db.prepare("UPDATE artifacts SET status='pending',attempt=?,error=NULL,duration=NULL WHERE conversation=? AND id=? AND kind='video' AND status!='pending'").run(randomUUID(), conversation, id);
    return result.changes ? this.artifact(conversation, id) : null;
  }
  forgetThread(id) { this.db.prepare('UPDATE trees SET thread=NULL,working_thread=NULL WHERE id=?').run(id); }
  create(title = 'New chat', provider = 'codex') {
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
  // The working provider's session is kept so a failed switch, or switching straight back, resumes it.
  switchProvider(id, provider, model) {
    this.db.prepare(`UPDATE trees SET working_thread=CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END,
      thread=CASE WHEN ? IS COALESCE(working_provider,provider) THEN CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END END,
      provider=?,model=? WHERE id=?`).run(provider, provider, model, id);
  }
  finishModel(id, completed) {
    this.db.prepare(completed ? 'UPDATE trees SET working_model=model,working_provider=provider WHERE id=?'
      : 'UPDATE trees SET model=working_model,thread=CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END,provider=COALESCE(working_provider,provider) WHERE id=?').run(id);
  }
  // The first question of an unstarted root replaces its placeholder title, using the branch-title rule.
  unstarted() { return this.db.prepare("SELECT t.id FROM trees t WHERE t.title='New chat' AND t.title_renamed=0 AND NOT EXISTS(SELECT 1 FROM branches b WHERE b.child=t.id) AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.tree=t.id) ORDER BY t.created DESC LIMIT 1").get()?.id; }
  message(tree, role, text, status) {
    const id = randomUUID();
    if (role === 'user') this.db.prepare("UPDATE trees SET title=? WHERE id=? AND title='New chat' AND title_renamed=0 AND NOT EXISTS(SELECT 1 FROM branches b WHERE b.child=trees.id) AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.tree=trees.id)").run(text.trim().slice(0, 200), tree);
    this.db.prepare('INSERT INTO messages(id,tree,role,text,status) VALUES(?,?,?,?,?)').run(id, tree, role, text, status);
    return id;
  }
  update(id, text, status) { this.db.prepare('UPDATE messages SET text=?,status=? WHERE id=?').run(text, status, id); }
  close() { this.db.close(); }
}
