import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
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
    try {
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > 1) throw new Error(`Database schema ${version} is newer than this TreeTutor supports (1). Use the newer TreeTutor version; your database was not changed.`);
      chmodSync(path, 0o600);
      if (version < 1 && this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table'").get()) {
        const backupPath = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.sqlite`;
        // SQLite copies a consistent snapshot, including committed WAL pages, before any upgrade writes.
        writeFileSync(backupPath + '.tmp', '', { mode: 0o600, flag: 'wx' });
        this.db.prepare('VACUUM INTO ?').run(backupPath + '.tmp');
        renameSync(backupPath + '.tmp', backupPath);
        this.backupPath = backupPath;
      }
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
      if (version < 1) {
        this.db.exec('BEGIN IMMEDIATE');
        try { this.migrate(); this.db.exec('PRAGMA user_version=1; COMMIT'); }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
      }
      // Additive nullable column: older TreeTutor builds still open the database.
      if (!this.db.prepare('PRAGMA table_info(messages)').all().some(c => c.name === 'usage')) this.db.exec('ALTER TABLE messages ADD COLUMN usage TEXT');
      // Additive table: suggestions live beside, never inside, tutor messages; one row per saved reply.
      this.db.exec(`CREATE TABLE IF NOT EXISTS suggestions (message TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')), passages TEXT, usage TEXT,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree))`);
      if (!this.db.prepare('PRAGMA table_info(suggestions)').all().some(c => c.name === 'nameTokens')) this.db.exec('ALTER TABLE suggestions ADD COLUMN nameTokens INTEGER');
      // Additive global tables: one knowledge graph across all learning trees; NOCASE names make a matching concept or topic reuse its row.
      this.db.exec(`CREATE TABLE IF NOT EXISTS concepts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS concept_topics (concept INTEGER NOT NULL REFERENCES concepts(id), topic INTEGER NOT NULL REFERENCES topics(id), PRIMARY KEY(concept, topic));
        CREATE TABLE IF NOT EXISTS concept_links (concept INTEGER NOT NULL REFERENCES concepts(id), target INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('related','builds on')), PRIMARY KEY(concept, target, kind), CHECK(concept <> target));`);
      this.interrupt();
    } catch (error) { error.backupPath = this.backupPath; this.db.close(); throw error; }
  }
  migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, tree TEXT NOT NULL REFERENCES trees(id), role TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_tree_seq ON messages(tree, seq);
      CREATE UNIQUE INDEX IF NOT EXISTS messages_id_tree ON messages(id, tree);
      ${ARTIFACTS}
      CREATE TABLE IF NOT EXISTS branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER NOT NULL, end INTEGER NOT NULL, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL);`);
    // Older databases gain the video kind, job columns and job statuses; SQLite cannot alter a CHECK in place.
    if (!this.db.prepare("SELECT sql FROM sqlite_master WHERE name='artifacts'").get().sql.includes("'interrupted'")) {
      const kept = this.db.prepare('PRAGMA table_info(artifacts)').all().map(c => c.name).join(',');
      this.db.exec(`ALTER TABLE artifacts RENAME TO artifacts_old;
      ${ARTIFACTS.replace('CREATE INDEX', 'DROP INDEX artifacts_conversation; CREATE INDEX')}
      INSERT INTO artifacts(${kept}) SELECT ${kept} FROM artifacts_old;
      DROP TABLE artifacts_old;`);
    }
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
  // Starting or stopping never resumes paid inference; saved partial text stays available.
  interrupt() {
    this.db.exec(`UPDATE messages SET status='interrupted' WHERE status='streaming';
      UPDATE suggestions SET status='failed' WHERE status='pending';
      UPDATE artifacts SET status='interrupted',error='Video generation was interrupted when TreeTutor stopped.' WHERE status='pending' AND kind='video';
      UPDATE artifacts SET status='failed',source=NULL,error='Diagram generation was interrupted when TreeTutor stopped.' WHERE status='pending';`);
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
      for (const conversation of deleted) this.db.prepare('DELETE FROM suggestions WHERE conversation=?').run(conversation);
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
    return tree.id && { ...tree, branch: branch ? { ...branch } : null, messages: this.db.prepare('SELECT id,role,text,status,usage FROM messages WHERE tree=? ORDER BY seq').all(id).map(({ usage, ...m }) => m.role === 'assistant' ? { ...m, usage: JSON.parse(usage) } : m), artifacts: this.db.prepare('SELECT * FROM artifacts WHERE conversation=? ORDER BY created,rowid').all(id),
      suggestions: this.db.prepare('SELECT message,status,passages,usage FROM suggestions WHERE conversation=? ORDER BY rowid').all(id).map(s => ({ ...s, passages: JSON.parse(s.passages ?? '[]'), usage: JSON.parse(s.usage) })) };
  }
  // INSERT OR IGNORE makes the run once-only per saved reply: reopening or switching providers never reruns it.
  pendingSuggestions(conversation, message, nameTokens = null) { return this.db.prepare("INSERT OR IGNORE INTO suggestions(message,conversation,status,nameTokens) SELECT ?,?,'pending',? WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND tree=? AND role='assistant' AND status='completed')").run(message, conversation, nameTokens, message, conversation).changes > 0; }
  // The latest suggestion call's concept-name list size, for the Settings cost warning.
  nameTokens() { return this.db.prepare('SELECT nameTokens FROM suggestions WHERE nameTokens IS NOT NULL ORDER BY rowid DESC LIMIT 1').get()?.nameTokens ?? 0; }
  graph() {
    const concepts = this.db.prepare("SELECT c.name, COALESCE((SELECT json_group_array(t.name) FROM (SELECT t.name FROM concept_topics ct JOIN topics t ON t.id=ct.topic WHERE ct.concept=c.id ORDER BY t.name) t),'[]') AS topics FROM concepts c ORDER BY c.name").all();
    const links = this.db.prepare('SELECT a.name AS "from", b.name AS "to", l.kind FROM concept_links l JOIN concepts a ON a.id=l.concept JOIN concepts b ON b.id=l.target ORDER BY a.name,b.name,l.kind').all();
    return { topics: this.db.prepare('SELECT name FROM topics ORDER BY name').all().map(t => t.name), concepts: concepts.map(c => ({ name: c.name, topics: JSON.parse(c.topics) })), links: links.map(l => ({ ...l })) };
  }
  // Names resolve case-insensitively to existing rows; a link needs both ends in the graph after this reply's concepts are added.
  addGraph({ concepts, links }) {
    const id = (table, name) => { this.db.prepare(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`).run(name); return this.db.prepare(`SELECT id FROM ${table} WHERE name=?`).get(name).id; };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const c of concepts) { const concept = id('concepts', c.name); for (const t of c.topics) this.db.prepare('INSERT OR IGNORE INTO concept_topics VALUES (?,?)').run(concept, id('topics', t)); }
      const find = name => this.db.prepare('SELECT id FROM concepts WHERE name=?').get(name)?.id;
      for (const l of links) { const a = find(l.from), b = find(l.to); if (a && b && a !== b) this.db.prepare('INSERT OR IGNORE INTO concept_links VALUES (?,?,?)').run(a, b, l.kind); }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  finishSuggestions(conversation, message, passages, usage) { this.db.prepare("UPDATE suggestions SET status=?,passages=?,usage=? WHERE conversation=? AND message=? AND status='pending'").run(passages ? 'ready' : 'failed', passages && JSON.stringify(passages), usage && JSON.stringify({ ...usage, at: Date.now() }), conversation, message); }
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
  // Only reported usage is saved; NULL means the provider did not report it.
  usage(id, usage) { this.db.prepare('UPDATE messages SET usage=? WHERE id=?').run(usage && JSON.stringify({ ...usage, at: Date.now() }), id); }
  usageSince(since) {
    // Suggestion calls count toward the total but not toward the reply count.
    return this.db.prepare("SELECT COALESCE(SUM(usage->>'input'),0) AS input,COALESCE(SUM(usage->>'output'),0) AS output,COALESCE(SUM(usage->>'cacheRead'),0) AS cacheRead,COALESCE(SUM(reply),0) AS replies FROM (SELECT usage,1 AS reply FROM messages UNION ALL SELECT usage,0 FROM suggestions) WHERE usage->>'at'>=?").get(since);
  }
  update(id, text, status) { this.db.prepare('UPDATE messages SET text=?,status=? WHERE id=?').run(text, status, id); }
  close() { this.db.close(); }
}
