import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { previewText } from '../src/markdownText.ts';

const ARTIFACTS = `CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('mermaid','video','visual')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','canceled','interrupted')),
        title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL, position INTEGER,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree));
      CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation, created);`;
const BRANCHES = `CREATE TABLE IF NOT EXISTS branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER, end INTEGER, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL, artifactId TEXT, label TEXT, explanation TEXT);`;

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
      // Why an interrupted reply stopped: 'learner' (Stop) or 'shutdown' (crash or quit); NULL on older rows, so those never offer Retry.
      if (!this.db.prepare('PRAGMA table_info(messages)').all().some(c => c.name === 'stopped')) this.db.exec('ALTER TABLE messages ADD COLUMN stopped TEXT');
      for (const name of ['effort', 'working_effort']) {
        if (!this.db.prepare('PRAGMA table_info(trees)').all().some(c => c.name === name)) this.db.exec(`ALTER TABLE trees ADD COLUMN ${name} TEXT`);
      }
      this.db.exec('CREATE TABLE IF NOT EXISTS chat_settings (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL, model TEXT NOT NULL, effort TEXT)');
      // Additive table: suggestions live beside, never inside, tutor messages; one row per saved reply.
      this.db.exec(`CREATE TABLE IF NOT EXISTS suggestions (message TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')), passages TEXT, usage TEXT,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree))`);
      if (!this.db.prepare('PRAGMA table_info(suggestions)').all().some(c => c.name === 'nameTokens')) this.db.exec('ALTER TABLE suggestions ADD COLUMN nameTokens INTEGER');
      // Durable usage: counts, time and attribution only, so deleting content never shrinks history. NULL counts = not reported.
      if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='usage_events'").get()) {
        this.db.exec(`CREATE TABLE usage_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, provider TEXT, model TEXT, task TEXT NOT NULL CHECK(task IN ('chat','suggestions','compaction','diagram','video')),
          input INTEGER, output INTEGER, cacheRead INTEGER, CHECK((input IS NULL) = (output IS NULL) AND (input IS NULL) = (cacheRead IS NULL)));
          CREATE INDEX usage_events_at ON usage_events(at);
          INSERT OR IGNORE INTO usage_events(id,at,task,input,output,cacheRead) SELECT 'chat:'||id,usage->>'at','chat',usage->>'input',usage->>'output',usage->>'cacheRead' FROM messages WHERE usage IS NOT NULL;
          INSERT OR IGNORE INTO usage_events(id,at,task,input,output,cacheRead) SELECT 'suggestions:'||message,usage->>'at','suggestions',usage->>'input',usage->>'output',usage->>'cacheRead' FROM suggestions WHERE usage IS NOT NULL;`);
      }
      this.db.exec(`CREATE TABLE IF NOT EXISTS suggestion_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), provider TEXT, model TEXT)`);
      // The suggestion row is the quick thinking role; its pinned model migrates in place and effort is additive.
      if (!this.db.prepare('PRAGMA table_info(suggestion_settings)').all().some(c => c.name === 'effort')) this.db.exec('ALTER TABLE suggestion_settings ADD COLUMN effort TEXT');
      // Smart role: a NULL model follows the chat default model; follow_effort=1 follows the chat default effort.
      this.db.exec('CREATE TABLE IF NOT EXISTS smart_settings (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT, model TEXT, follow_effort INTEGER NOT NULL CHECK(follow_effort IN (0,1)), effort TEXT)');
      // Additive global tables: one knowledge graph across all learning trees; NOCASE names make a matching concept or topic reuse its row.
      this.db.exec(`CREATE TABLE IF NOT EXISTS concepts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS concept_aliases (name TEXT PRIMARY KEY COLLATE NOCASE, concept INTEGER NOT NULL REFERENCES concepts(id));
        CREATE TABLE IF NOT EXISTS concept_topics (concept INTEGER NOT NULL REFERENCES concepts(id), topic INTEGER NOT NULL REFERENCES topics(id), PRIMARY KEY(concept, topic));
        CREATE TABLE IF NOT EXISTS concept_links (concept INTEGER NOT NULL REFERENCES concepts(id), target INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('related','builds on')), PRIMARY KEY(concept, target, kind), CHECK(concept <> target));
        CREATE TABLE IF NOT EXISTS evidence (concept INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('met','asked','used','ignored','known','unknown')), source TEXT, at INTEGER NOT NULL, UNIQUE(concept, kind, source));`);
      // Library ownership: ready videos outlive their source conversation; only title, description and timing are kept.
      // Created once, so existing ready videos migrate without generation and later library removals stay removed.
      if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='videos'").get()) {
        this.db.exec(`CREATE TABLE videos (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, duration REAL, created INTEGER NOT NULL);
          INSERT INTO videos(id,title,description,duration,created) SELECT id,title,description,duration,created FROM artifacts WHERE kind='video' AND status='ready';`);
      }
      // Visual kind and reply positions migrate in place; existing rows keep a NULL position and render after their reply.
      this.db.exec('BEGIN IMMEDIATE');
      try { this.rebuildArtifacts("'visual'"); this.db.exec('COMMIT'); }
      catch (error) { this.db.exec('ROLLBACK'); throw error; }
      // Visual passages keep their source artifact and part instead of inventing reply offsets.
      if (!this.db.prepare('PRAGMA table_info(branches)').all().some(c => c.name === 'artifactId')) {
        this.db.exec(`BEGIN IMMEDIATE; ALTER TABLE branches RENAME TO branches_old;
          ${BRANCHES}
          INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot) SELECT child,parent,messageId,start,end,text,question,snapshot FROM branches_old;
          DROP TABLE branches_old; COMMIT;`);
      }
      this.interrupt();
    } catch (error) { error.backupPath = this.backupPath; this.db.close(); throw error; }
  }
  migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, tree TEXT NOT NULL REFERENCES trees(id), role TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_tree_seq ON messages(tree, seq);
      CREATE UNIQUE INDEX IF NOT EXISTS messages_id_tree ON messages(id, tree);
      ${ARTIFACTS}
      ${BRANCHES}`);
    // Older databases gain the video kind, job columns and job statuses; SQLite cannot alter a CHECK in place.
    this.rebuildArtifacts("'interrupted'");
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
  // SQLite cannot alter a CHECK in place: rebuild the table when its definition lacks the marker, keeping every saved column.
  rebuildArtifacts(marker) {
    if (this.db.prepare("SELECT sql FROM sqlite_master WHERE name='artifacts'").get().sql.includes(marker)) return;
    const kept = this.db.prepare('PRAGMA table_info(artifacts)').all().map(c => c.name).join(',');
    this.db.exec(`ALTER TABLE artifacts RENAME TO artifacts_old;
      ${ARTIFACTS.replace('CREATE INDEX', 'DROP INDEX artifacts_conversation; CREATE INDEX')}
      INSERT INTO artifacts(${kept}) SELECT ${kept} FROM artifacts_old;
      DROP TABLE artifacts_old;`);
  }
  // Starting or stopping never resumes paid inference; saved partial text stays available.
  interrupt() {
    this.db.exec(`UPDATE messages SET status='interrupted',stopped='shutdown' WHERE status='streaming';
      UPDATE suggestions SET status='failed' WHERE status='pending';
      UPDATE artifacts SET status='interrupted',error='Video generation was interrupted when TreeTutor stopped.' WHERE status='pending' AND kind='video';
      UPDATE artifacts SET status='failed',source=NULL,error=(CASE kind WHEN 'visual' THEN 'Visual' ELSE 'Diagram' END)||' generation was interrupted when TreeTutor stopped.' WHERE status='pending';`);
  }
  list() {
    return this.db.prepare('SELECT t.id,t.title,t.created,t.x,t.y,t.layout,b.parent,b.messageId,b.start,b.end,b.text AS passage,b.artifactId,b.label,b.explanation FROM trees t LEFT JOIN branches b ON b.child=t.id ORDER BY t.created DESC,t.rowid DESC').all()
      .map(({ artifactId, label, explanation, ...t }) => { const visual = artifactId ? { artifactId, label, explanation } : {}; try { return { ...t, ...visual, layout: JSON.parse(t.layout) }; } catch { return { ...t, ...visual, layout: null }; } });
  }
  // Title-only, newest first; saved conversation text is never scanned.
  search(query) {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [];
    return this.db.prepare('SELECT id AS root,title FROM trees WHERE id NOT IN (SELECT child FROM branches) ORDER BY created DESC,rowid DESC').all()
      .filter(t => t.title.toLocaleLowerCase().includes(q));
  }
  suggestionSettings() {
    const row = this.db.prepare('SELECT enabled,provider,model,effort FROM suggestion_settings WHERE id=1').get();
    return { enabled: row ? !!row.enabled : true, model: row?.model ? { provider: row.provider, model: row.model } : null, effort: row?.model ? row.effort ?? null : null };
  }
  smartSettings() {
    const row = this.db.prepare('SELECT provider,model,follow_effort,effort FROM smart_settings WHERE id=1').get();
    return { model: row?.model ? { provider: row.provider, model: row.model } : null, followEffort: row ? !!row.follow_effort : true, effort: row && !row.follow_effort ? row.effort ?? null : null };
  }
  saveSmartSettings({ model, followEffort, effort }) {
    this.db.prepare('INSERT INTO smart_settings(id,provider,model,follow_effort,effort) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,follow_effort=excluded.follow_effort,effort=excluded.effort').run(model?.provider ?? null, model?.model ?? null, +followEffort, followEffort ? null : effort);
    return this.smartSettings();
  }
  chatSettings() { return this.db.prepare('SELECT provider,model,effort FROM chat_settings WHERE id=1').get() ?? null; }
  saveChatSettings({ provider, model, effort }) {
    this.db.prepare('INSERT INTO chat_settings(id,provider,model,effort) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,effort=excluded.effort').run(provider, model, effort);
    return this.chatSettings();
  }
  saveSuggestionSettings({ enabled, model, effort }) {
    this.db.prepare('INSERT INTO suggestion_settings(id,enabled,provider,model,effort) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,provider=excluded.provider,model=excluded.model,effort=excluded.effort').run(+enabled, model?.provider ?? null, model?.model ?? null, model ? effort ?? null : null);
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
    const savedBranch = this.db.prepare('SELECT parent,messageId,start,end,text,question,snapshot,artifactId,label,explanation FROM branches WHERE child=?').get(id);
    const { artifactId, label, explanation, ...branch } = savedBranch ?? {};
    return tree.id && { ...tree, branch: savedBranch ? { ...branch, ...(artifactId && { artifactId, label, explanation }) } : null, messages: this.db.prepare('SELECT id,role,text,status,stopped,usage FROM messages WHERE tree=? ORDER BY seq').all(id).map(({ usage, stopped, ...m }) => m.role === 'assistant' ? { ...m, ...(stopped && { stopped }), usage: JSON.parse(usage) } : m), artifacts: this.db.prepare('SELECT * FROM artifacts WHERE conversation=? ORDER BY created,rowid').all(id),
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
  finishSuggestions(conversation, message, passages, usage, selection) {
    const at = Date.now();
    if (this.db.prepare("UPDATE suggestions SET status=?,passages=?,usage=? WHERE conversation=? AND message=? AND status='pending'").run(passages ? 'ready' : 'failed', passages && JSON.stringify(passages), usage && JSON.stringify({ ...usage, at }), conversation, message).changes) this.record(`suggestions:${message}`, 'suggestions', selection, usage, at);
  }
  artifact(conversation, id) { return this.db.prepare('SELECT * FROM artifacts WHERE conversation=? AND id=?').get(conversation, id); }
  hasArtifact(id) { return !!this.db.prepare('SELECT 1 FROM artifacts WHERE id=?').get(id); }
  // Videos keep their frozen task input and a server-issued attempt; their composition source stays in the job workspace.
  // position: offset in the stored reply text where the request block was removed; null renders after the reply.
  pendingArtifact(conversation, message, title, description, kind = 'mermaid', input = null, position = null) {
    const id = randomUUID();
    const result = this.db.prepare("INSERT INTO artifacts(id,conversation,message,kind,status,title,description,created,input,attempt,position) SELECT ?,?,?,?,'pending',?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND tree=? AND role='assistant')").run(id, conversation, message, kind, title, description, Date.now(), input, kind === 'video' ? randomUUID() : null, position, message, conversation);
    if (!result.changes) throw new Error('Artifact message does not belong to this conversation.');
    return this.artifact(conversation, id);
  }
  finishArtifact(conversation, id, source, error = null) {
    this.db.prepare("UPDATE artifacts SET status=?,source=?,error=? WHERE conversation=? AND id=? AND kind IN ('mermaid','visual') AND status='pending'").run(error ? 'failed' : 'ready', error ? null : source, error, conversation, id);
    return this.artifact(conversation, id);
  }
  visualInput(conversation, id, input) {
    return this.db.prepare("UPDATE artifacts SET input=? WHERE conversation=? AND id=? AND kind='visual' AND status='pending'").run(input, conversation, id).changes > 0;
  }
  cancelVisuals(conversation, message) {
    this.db.prepare("UPDATE artifacts SET status='canceled',source=NULL,error=NULL WHERE conversation=? AND message=? AND kind='visual' AND status='pending'").run(conversation, message);
  }
  videoInput(conversation, id, attempt, input) {
    return this.db.prepare("UPDATE artifacts SET input=? WHERE conversation=? AND id=? AND attempt=? AND kind='video' AND status='pending'").run(input, conversation, id, attempt).changes > 0;
  }
  finishVideo(conversation, id, attempt, { description, duration } = {}, error = null) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const done = this.db.prepare("UPDATE artifacts SET status=?,description=COALESCE(?,description),duration=?,error=? WHERE conversation=? AND id=? AND attempt=? AND kind='video' AND status='pending'").run(error ? 'failed' : 'ready', error ? null : description, error ? null : duration, error, conversation, id, attempt).changes;
      if (done && !error) this.db.prepare("INSERT INTO videos(id,title,description,duration,created) SELECT id,title,description,duration,created FROM artifacts WHERE id=? ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,duration=excluded.duration").run(id);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
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
  // Retry reruns from the stored task; rows saved before tasks were stored stay failed.
  retryArtifact(conversation, id) {
    const result = this.db.prepare("UPDATE artifacts SET status='pending',source=NULL,error=NULL WHERE conversation=? AND id=? AND kind IN ('mermaid','visual') AND status='failed' AND input IS NOT NULL").run(conversation, id);
    return result.changes ? this.artifact(conversation, id) : null;
  }
  regenerateArtifact(conversation, id) {
    const artifact = this.artifact(conversation, id);
    if (artifact?.status !== 'ready' || !['visual', 'video'].includes(artifact.kind) || !artifact.input) return null;
    // A new video id leaves its previous library entry/file intact; updating the row preserves chat order.
    const next = artifact.kind === 'video' ? randomUUID() : id;
    const input = JSON.stringify({ ...JSON.parse(artifact.input), differentVersion: true });
    const result = this.db.prepare("UPDATE artifacts SET id=?,status='pending',source=NULL,error=NULL,duration=NULL,input=?,attempt=? WHERE conversation=? AND id=? AND status='ready'").run(next, input, artifact.kind === 'video' ? randomUUID() : null, conversation, id);
    return result.changes ? this.artifact(conversation, next) : null;
  }
  library() { return this.db.prepare('SELECT id,title,description,duration,created FROM videos ORDER BY created DESC,rowid DESC').all().map(v => ({ ...v })); }
  // Removes only the library entry; artifacts and usage records stay as history.
  removeLibraryVideo(id) { this.db.prepare('DELETE FROM videos WHERE id=?').run(id); }
  libraryVideo(id) { return this.db.prepare('SELECT id,title,description,duration,created FROM videos WHERE id=?').get(id); }
  forgetThread(id) { this.db.prepare('UPDATE trees SET thread=NULL,working_thread=NULL WHERE id=?').run(id); }
  create(title = 'New chat', provider = 'codex', model = null, effort = null) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO trees(id,title,created,provider,working_provider,model,working_model,effort,working_effort) VALUES(?,?,?,?,?,?,?,?,?)').run(id, title, Date.now(), provider, provider, model, model, effort, effort);
    return this.tree(id);
  }
  branch(parent, anchor, snapshot) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const child = this.create(anchor.question.trim().slice(0, 200), parent.provider, parent.model, parent.effort ?? null);
      this.db.prepare('INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot,artifactId,label,explanation) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(child.id, parent.id, anchor.messageId, anchor.start ?? null, anchor.end ?? null, anchor.text, anchor.question, snapshot, anchor.artifactId ?? null, anchor.label ?? null, anchor.explanation ?? null);
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
  model(id, model, effort = null) { this.db.prepare('UPDATE trees SET model=?,effort=? WHERE id=?').run(model, effort, id); }
  // Provider sessions are not portable: switching drops the thread so the next provider receives saved history.
  // The working provider's session is kept so a failed switch, or switching straight back, resumes it.
  switchProvider(id, provider, model, effort = null) {
    this.db.prepare(`UPDATE trees SET working_thread=CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END,
      thread=CASE WHEN ? IS COALESCE(working_provider,provider) THEN CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END END,
      provider=?,model=?,effort=? WHERE id=?`).run(provider, provider, model, effort, id);
  }
  finishModel(id, completed) {
    this.db.prepare(completed ? 'UPDATE trees SET working_model=model,working_provider=provider,working_effort=effort WHERE id=?'
      : 'UPDATE trees SET model=working_model,effort=working_effort,thread=CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END,provider=COALESCE(working_provider,provider) WHERE id=?').run(id);
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
  // One row per logical call id, so repeated finish events cannot double count; usage=null records an unreported measurement.
  record(id, task, selection, usage, at = Date.now()) {
    if (usage && !['input', 'output', 'cacheRead'].every(k => Number.isSafeInteger(usage[k]) && usage[k] >= 0)) usage = null;
    this.db.prepare('INSERT OR IGNORE INTO usage_events(id,at,provider,model,task,input,output,cacheRead) VALUES(?,?,?,?,?,?,?,?)').run(id, at, selection?.provider ?? null, selection?.model ?? null, task, usage?.input ?? null, usage?.output ?? null, usage?.cacheRead ?? null);
  }
  usageEvents(from = 0, to = Number.MAX_SAFE_INTEGER) {
    return { first: this.db.prepare('SELECT MIN(at) AS at FROM usage_events').get().at, events: this.db.prepare('SELECT at,provider,model,task,input,output,cacheRead FROM usage_events WHERE at>=? AND at<? ORDER BY at,rowid').all(from, to) };
  }
  usageSince(since) {
    // Suggestion calls count toward the total but not toward the reply count.
    return this.db.prepare("SELECT COALESCE(SUM(input),0) AS input,COALESCE(SUM(output),0) AS output,COALESCE(SUM(cacheRead),0) AS cacheRead,COUNT(CASE WHEN task='chat' THEN input END) AS replies FROM usage_events WHERE at>=?").get(since);
  }
  update(id, text, status, stopped = null) { this.db.prepare('UPDATE messages SET text=?,status=?,stopped=? WHERE id=?').run(text, status, stopped, id); }
  // Retry drops the failed reply and its artifacts; library videos live in their own table and are kept.
  discardReply(conversation, message) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM artifacts WHERE conversation=? AND message=?').run(conversation, message);
      this.db.prepare('DELETE FROM suggestions WHERE conversation=? AND message=?').run(conversation, message);
      this.db.prepare("DELETE FROM messages WHERE tree=? AND id=? AND role='assistant'").run(conversation, message);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
