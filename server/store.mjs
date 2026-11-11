import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { previewText, plainText } from '../src/markdownText.ts';

const ARTIFACTS = `CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('mermaid','video')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','canceled','interrupted')),
        title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree));
      CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation, created);`;

const WEIGHTS = { met: 0.1, asked: 0.2, used: 0.3, ignored: 0.05 };
// Whole-word, case-insensitive name match.
const mentions = (text, name) => new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(text);

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
      this.db.exec(`CREATE TABLE IF NOT EXISTS suggestion_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), provider TEXT, model TEXT)`);
      // Additive global tables: one knowledge graph across all learning trees; NOCASE names make a matching concept or topic reuse its row.
      this.db.exec(`CREATE TABLE IF NOT EXISTS concepts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS concept_aliases (name TEXT PRIMARY KEY COLLATE NOCASE, concept INTEGER NOT NULL REFERENCES concepts(id));
        CREATE TABLE IF NOT EXISTS concept_topics (concept INTEGER NOT NULL REFERENCES concepts(id), topic INTEGER NOT NULL REFERENCES topics(id), PRIMARY KEY(concept, topic));
        CREATE TABLE IF NOT EXISTS concept_links (concept INTEGER NOT NULL REFERENCES concepts(id), target INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('related','builds on')), PRIMARY KEY(concept, target, kind), CHECK(concept <> target));
        CREATE TABLE IF NOT EXISTS evidence (concept INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('met','asked','used','ignored','known','unknown')), source TEXT, at INTEGER NOT NULL, UNIQUE(concept, kind, source));`);
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
  // One result per learning tree, newest first: a title match opens the tree, otherwise its earliest matching message's conversation.
  search(query) {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [];
    const hit = (text) => text.toLocaleLowerCase().includes(q);
    const roots = this.db.prepare('SELECT id,title FROM trees WHERE id NOT IN (SELECT child FROM branches) ORDER BY created DESC,rowid DESC').all();
    const messages = this.db.prepare(`WITH RECURSIVE subtree(id) AS (SELECT ? UNION SELECT child FROM branches JOIN subtree ON parent=subtree.id)
      SELECT m.tree,m.role,m.text FROM messages m JOIN subtree ON m.tree=subtree.id ORDER BY m.seq`);
    return roots.flatMap(({ id, title }) => {
      if (hit(title)) return [{ root: id, conversation: null, snippet: null }];
      const m = messages.all(id).find(m => hit(m.text));
      if (!m) return [];
      const text = m.role === 'assistant' ? plainText(m.text) : m.text.replace(/\s+/g, ' ').trim();
      const at = Math.max(0, text.toLocaleLowerCase().indexOf(q) - 30);
      return [{ root: id, conversation: m.tree, snippet: (at ? '…' : '') + text.slice(at, at + 120) + (text.length > at + 120 ? '…' : '') }];
    });
  }
  suggestionSettings() {
    const row = this.db.prepare('SELECT enabled,provider,model FROM suggestion_settings WHERE id=1').get();
    return { enabled: row ? !!row.enabled : true, model: row?.model ? { provider: row.provider, model: row.model } : null };
  }
  saveSuggestionSettings({ enabled, model }) {
    this.db.prepare('INSERT INTO suggestion_settings(id,enabled,provider,model) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,provider=excluded.provider,model=excluded.model').run(+enabled, model?.provider ?? null, model?.model ?? null);
    return this.suggestionSettings();
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
      suggestions: this.db.prepare('SELECT message,status,passages,usage FROM suggestions WHERE conversation=? ORDER BY rowid').all(id).map(s => ({ ...s, passages: JSON.parse(s.passages ?? '[]').map(({ child, ...p }) => this.live(child) ? { ...p, child } : p), usage: JSON.parse(s.usage) })) };
  }
  // An explored suggestion whose child was deleted reads as unexplored again.
  live(child) { return !!child && !!this.db.prepare('SELECT 1 FROM trees WHERE id=?').get(child); }
  // INSERT OR IGNORE makes the run once-only per saved reply: reopening or switching providers never reruns it.
  pendingSuggestions(conversation, message, nameTokens = null) { return this.db.prepare("INSERT OR IGNORE INTO suggestions(message,conversation,status,nameTokens) SELECT ?,?,'pending',? WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND tree=? AND role='assistant' AND status='completed')").run(message, conversation, nameTokens, message, conversation).changes > 0; }
  // The latest suggestion call's concept-name list size, for the Settings cost warning.
  nameTokens() { return this.db.prepare('SELECT nameTokens FROM suggestions WHERE nameTokens IS NOT NULL ORDER BY rowid DESC LIMIT 1').get()?.nameTokens ?? 0; }
  graph() {
    const concepts = this.db.prepare("SELECT c.id, c.name, COALESCE((SELECT json_group_array(t.name) FROM (SELECT t.name FROM concept_topics ct JOIN topics t ON t.id=ct.topic WHERE ct.concept=c.id ORDER BY t.name) t),'[]') AS topics FROM concepts c ORDER BY c.name").all();
    const links = this.db.prepare('SELECT a.name AS "from", b.name AS "to", l.kind FROM concept_links l JOIN concepts a ON a.id=l.concept JOIN concepts b ON b.id=l.target ORDER BY a.name,b.name,l.kind').all();
    return { topics: this.db.prepare('SELECT name FROM topics ORDER BY name').all().map(t => t.name), concepts: concepts.map(c => ({ name: c.name, topics: JSON.parse(c.topics), ...this.familiarity(c.id) })), links: links.map(l => ({ ...l })) };
  }
  // Familiarity is derived, never stored: the latest correction outranks all inference; otherwise weighted evidence, capped at 1.
  familiarity(concept) {
    const evidence = { met: 0, asked: 0, used: 0, ignored: 0 };
    for (const r of this.db.prepare("SELECT kind, COUNT(*) AS n FROM evidence WHERE concept=? AND kind IN ('met','asked','used','ignored') GROUP BY kind").all(concept)) evidence[r.kind] = r.n;
    const correction = this.db.prepare("SELECT kind FROM evidence WHERE concept=? AND kind IN ('known','unknown') ORDER BY rowid DESC LIMIT 1").get(concept)?.kind ?? null;
    const inferred = Math.min(1, Object.entries(evidence).reduce((sum, [kind, n]) => sum + WEIGHTS[kind] * n, 0));
    return { familiarity: Math.round((correction ? +(correction === 'known') : inferred) * 100) / 100, evidence, correction };
  }
  // Familiarity for concepts named in the given text: the relevant concepts sent to the suggestion call.
  // shortcut: whole-name mentions only, so a reworded concept is missed; upgrade with the embedding pre-filter (TreeTutor-5ut.11).
  mentioned(text) {
    return Object.fromEntries(this.names().filter(c => mentions(text, c.name)).map(c => [c.name, this.familiarity(c.id).familiarity]));
  }
  names() { return this.db.prepare('SELECT id, name FROM concepts UNION ALL SELECT concept AS id, name FROM concept_aliases ORDER BY name').all(); }
  concept(name) { return this.db.prepare('SELECT id, name FROM concepts WHERE id=(SELECT id FROM concepts WHERE name=? UNION ALL SELECT concept FROM concept_aliases WHERE name=? LIMIT 1)').get(name, name); }
  evidence(concept, kind, source) { this.db.prepare('INSERT OR IGNORE INTO evidence(concept,kind,source,at) VALUES (?,?,?,?)').run(concept, kind, source, Date.now()); }
  // Repeated corrections are all kept and the latest wins.
  correct(name, kind) {
    const concept = this.concept(name)?.id;
    if (concept) this.db.prepare('INSERT INTO evidence(concept,kind,source,at) VALUES (?,?,NULL,?)').run(concept, kind, Date.now());
    return !!concept;
  }
  mergeConcepts(from, into) {
    const source = this.concept(from), target = this.concept(into);
    if (!source || !target || source.id === target.id) return false;
    const a = source.id, b = target.id;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR IGNORE INTO concept_topics SELECT ?, topic FROM concept_topics WHERE concept=?').run(b, a);
      this.db.prepare('DELETE FROM concept_topics WHERE concept=?').run(a);
      this.db.prepare('INSERT OR IGNORE INTO concept_links SELECT CASE WHEN concept=? THEN ? ELSE concept END, CASE WHEN target=? THEN ? ELSE target END, kind FROM concept_links WHERE (concept=? OR target=?) AND NOT (concept IN (?,?) AND target IN (?,?))').run(a, b, a, b, a, a, a, b, a, b);
      this.db.prepare('DELETE FROM concept_links WHERE concept=? OR target=?').run(a, a);
      // Preserve row order for corrections; only events with the same source are duplicates.
      this.db.prepare('DELETE FROM evidence WHERE concept=? AND source IS NOT NULL AND EXISTS (SELECT 1 FROM evidence kept WHERE kept.concept=? AND kept.kind=evidence.kind AND kept.source=evidence.source)').run(a, b);
      this.db.prepare('UPDATE evidence SET concept=? WHERE concept=?').run(b, a);
      for (const row of this.db.prepare("SELECT message,passages FROM suggestions WHERE passages IS NOT NULL").all()) {
        const passages = JSON.parse(row.passages);
        let changed = false;
        for (const p of passages) if (p.concept && this.concept(p.concept)?.id === a) { p.concept = target.name; changed = true; }
        if (changed) this.db.prepare('UPDATE suggestions SET passages=? WHERE message=?').run(JSON.stringify(passages), row.message);
      }
      this.db.prepare('UPDATE concept_aliases SET concept=? WHERE concept=?').run(b, a);
      this.db.prepare('INSERT INTO concept_aliases(name,concept) VALUES (?,?)').run(source.name, b);
      this.db.prepare('DELETE FROM concepts WHERE id=?').run(a);
      this.db.exec('COMMIT');
      return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  // A passage's concepts: the one the suggestion call tagged, plus concepts met in that reply whose name the passage contains.
  passageConcepts(conversation, message, passage) {
    const row = this.db.prepare("SELECT passages FROM suggestions WHERE conversation=? AND message=? AND status='ready'").get(conversation, message);
    const tagged = JSON.parse(row?.passages ?? '[]').find(p => p.start === passage.start && p.end === passage.end)?.concept;
    const met = new Set(this.db.prepare("SELECT concept FROM evidence WHERE kind='met' AND source=?").all(message).map(e => e.concept));
    const ids = this.names().filter(c => met.has(c.id) && mentions(passage.text, c.name)).map(c => c.id);
    const own = tagged && this.concept(tagged)?.id;
    return [...new Set(own ? [own, ...ids] : ids)];
  }
  // A saved question identifies each use so duplicate concepts can share one evidence event after a merge.
  questionEvidence(conversation, text, message) {
    for (const id of new Set(this.names().filter(c => mentions(text, c.name)).map(c => c.id))) this.evidence(id, 'used', message);
    const last = this.db.prepare("SELECT id FROM messages WHERE tree=? AND role='assistant' ORDER BY seq DESC LIMIT 1").get(conversation)?.id;
    const row = last && this.db.prepare("SELECT passages FROM suggestions WHERE conversation=? AND message=? AND status='ready'").get(conversation, last);
    for (const p of JSON.parse(row?.passages ?? '[]')) if (!this.live(p.child)) for (const c of this.passageConcepts(conversation, last, p)) this.evidence(c, 'ignored', last);
  }
  // Names resolve case-insensitively to existing rows; a link needs both ends in the graph after this reply's concepts are added.
  // Every concept in the reply was met there; the message id makes it count once per reply.
  addGraph({ concepts, links }, message = null) {
    const id = (table, name) => { this.db.prepare(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`).run(name); return this.db.prepare(`SELECT id FROM ${table} WHERE name=?`).get(name).id; };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const c of concepts) { const concept = this.concept(c.name)?.id ?? id('concepts', c.name); if (message) this.evidence(concept, 'met', message); for (const t of c.topics) this.db.prepare('INSERT OR IGNORE INTO concept_topics VALUES (?,?)').run(concept, id('topics', t)); }
      const find = name => this.concept(name)?.id;
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
  create(title = 'New chat', provider = 'codex', model = null) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO trees(id,title,created,provider,working_provider,model,working_model) VALUES(?,?,?,?,?,?,?)').run(id, title, Date.now(), provider, provider, model, model);
    return this.tree(id);
  }
  branch(parent, anchor, snapshot) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const child = this.create(anchor.question.trim().slice(0, 200));
      this.db.prepare('UPDATE trees SET provider=?,model=?,working_model=?,working_provider=? WHERE id=?').run(parent.provider, parent.model, parent.working_model ?? parent.model, parent.working_provider ?? parent.provider, child.id);
      this.db.prepare('INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot) VALUES(?,?,?,?,?,?,?,?)').run(child.id, parent.id, anchor.messageId, anchor.start, anchor.end, anchor.text, anchor.question, snapshot);
      // Branching from a suggestion marks it explored, in the same transaction as the saved child.
      const row = anchor.suggestion === true && this.db.prepare("SELECT passages FROM suggestions WHERE conversation=? AND message=? AND status='ready'").get(parent.id, anchor.messageId);
      const passages = row ? JSON.parse(row.passages) : [], hit = passages.find(p => p.start === anchor.start && p.end === anchor.end && !this.live(p.child));
      if (hit) { hit.child = child.id; this.db.prepare('UPDATE suggestions SET passages=? WHERE conversation=? AND message=?').run(JSON.stringify(passages), parent.id, anchor.messageId); }
      // Any branch, suggested or highlighted, asks about the passage's concepts.
      for (const c of this.passageConcepts(parent.id, anchor.messageId, anchor)) this.evidence(c, 'asked', child.id);
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
