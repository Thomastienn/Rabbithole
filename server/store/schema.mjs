import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const ARTIFACTS = `CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('mermaid','video','visual')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','canceled','interrupted')),
        title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL, position INTEGER,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree));
      CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation, created);`;
const BRANCHES = `CREATE TABLE IF NOT EXISTS branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER, end INTEGER, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL, artifactId TEXT, label TEXT, explanation TEXT);`;

// The Store constructor body: opens, backs up and migrates the database; called with the Store as this.
export function open(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  this.db = new DatabaseSync(path);
  try {
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1)
      throw new Error(
        `Database schema ${version} is newer than this TreeTutor supports (1). Use the newer TreeTutor version; your database was not changed.`,
      );
    chmodSync(path, 0o600);
    // A fresh database starts with no model profile and no assumed provider; existing installs keep theirs.
    const fresh = !this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table'").get();
    if (version < 1 && !fresh) {
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
      try {
        this.migrate(fresh);
        this.db.exec('PRAGMA user_version=1; COMMIT');
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    // Additive nullable column: older TreeTutor builds still open the database.
    if (
      !this.db
        .prepare('PRAGMA table_info(messages)')
        .all()
        .some((c) => c.name === 'usage')
    )
      this.db.exec('ALTER TABLE messages ADD COLUMN usage TEXT');
    // Why an interrupted reply stopped: 'learner' (Stop) or 'shutdown' (crash or quit); NULL on older rows, so those never offer Retry.
    if (
      !this.db
        .prepare('PRAGMA table_info(messages)')
        .all()
        .some((c) => c.name === 'stopped')
    )
      this.db.exec('ALTER TABLE messages ADD COLUMN stopped TEXT');
    for (const name of ['effort', 'working_effort']) {
      if (
        !this.db
          .prepare('PRAGMA table_info(trees)')
          .all()
          .some((c) => c.name === name)
      )
        this.db.exec(`ALTER TABLE trees ADD COLUMN ${name} TEXT`);
    }
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS chat_settings (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL, model TEXT NOT NULL, effort TEXT)',
    );
    // Additive table: attachment files live under the data directory; text holds their prepared text for history and compaction.
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, delivery TEXT NOT NULL, text TEXT, created INTEGER NOT NULL,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree));
      CREATE INDEX IF NOT EXISTS attachments_message ON attachments(conversation, message);`);
    // Additive table: suggestions live beside, never inside, tutor messages; one row per saved reply.
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS suggestions (message TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')), passages TEXT, usage TEXT,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree))`);
    if (
      !this.db
        .prepare('PRAGMA table_info(suggestions)')
        .all()
        .some((c) => c.name === 'nameTokens')
    )
      this.db.exec('ALTER TABLE suggestions ADD COLUMN nameTokens INTEGER');
    // Durable usage: counts, time and attribution only, so deleting content never shrinks history. NULL counts = not reported.
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='usage_events'").get()) {
      this.db
        .exec(`CREATE TABLE usage_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, provider TEXT, model TEXT, task TEXT NOT NULL CHECK(task IN ('chat','suggestions','compaction','diagram','video','title')),
          input INTEGER, output INTEGER, cacheRead INTEGER, CHECK((input IS NULL) = (output IS NULL) AND (input IS NULL) = (cacheRead IS NULL)));
          CREATE INDEX usage_events_at ON usage_events(at);
          INSERT OR IGNORE INTO usage_events(id,at,task,input,output,cacheRead) SELECT 'chat:'||id,usage->>'at','chat',usage->>'input',usage->>'output',usage->>'cacheRead' FROM messages WHERE usage IS NOT NULL;
          INSERT OR IGNORE INTO usage_events(id,at,task,input,output,cacheRead) SELECT 'suggestions:'||message,usage->>'at','suggestions',usage->>'input',usage->>'output',usage->>'cacheRead' FROM suggestions WHERE usage IS NOT NULL;`);
    }
    if (
      !this.db
        .prepare('PRAGMA table_info(usage_events)')
        .all()
        .some((c) => c.name === 'message')
    ) {
      this.db
        .exec(`ALTER TABLE usage_events ADD COLUMN message TEXT REFERENCES messages(id) ON DELETE SET NULL;
        CREATE INDEX usage_events_message ON usage_events(message);
        UPDATE usage_events SET message=(SELECT message FROM artifacts a WHERE
          usage_events.id='diagram:'||a.id OR usage_events.id LIKE 'diagram:'||a.id||':%' OR
          usage_events.id LIKE 'video:'||a.attempt||':%' LIMIT 1)
          WHERE task IN ('diagram','video');`);
    }
    // Title usage widens the task check; SQLite needs a rebuild to change it.
    if (
      !this.db
        .prepare("SELECT sql FROM sqlite_master WHERE name='usage_events'")
        .get()
        .sql.includes("'title'")
    )
      this.db.exec(`BEGIN IMMEDIATE; ALTER TABLE usage_events RENAME TO usage_events_old;
          CREATE TABLE usage_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, provider TEXT, model TEXT, task TEXT NOT NULL CHECK(task IN ('chat','suggestions','compaction','diagram','video','title')),
            input INTEGER, output INTEGER, cacheRead INTEGER, message TEXT REFERENCES messages(id) ON DELETE SET NULL, CHECK((input IS NULL) = (output IS NULL) AND (input IS NULL) = (cacheRead IS NULL)));
          INSERT INTO usage_events(id,at,provider,model,task,input,output,cacheRead,message) SELECT id,at,provider,model,task,input,output,cacheRead,message FROM usage_events_old;
          DROP TABLE usage_events_old;
          CREATE INDEX usage_events_at ON usage_events(at);
          CREATE INDEX usage_events_message ON usage_events(message);
          COMMIT;`);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS suggestion_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), provider TEXT, model TEXT)`,
    );
    // The suggestion row is the quick thinking role; its pinned model migrates in place and effort is additive.
    if (
      !this.db
        .prepare('PRAGMA table_info(suggestion_settings)')
        .all()
        .some((c) => c.name === 'effort')
    )
      this.db.exec('ALTER TABLE suggestion_settings ADD COLUMN effort TEXT');
    // Tutor style: no row or NULL text means the built-in default.
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS tutor_style (id INTEGER PRIMARY KEY CHECK(id=1), text TEXT)',
    );
    // Learner-typed efforts for custom endpoint models, listed after the endpoint's advertised efforts.
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS endpoint_efforts (endpoint TEXT NOT NULL, model TEXT NOT NULL, effort TEXT NOT NULL, PRIMARY KEY(endpoint, model, effort))',
    );
    // Smart role: a NULL model follows the chat default model; follow_effort=1 follows the chat default effort.
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS smart_settings (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT, model TEXT, follow_effort INTEGER NOT NULL CHECK(follow_effort IN (0,1)), effort TEXT)',
    );
    // Model profiles: each holds the chat, smart and quick thinking roles; the old role rows seed "Default" once and stay for older builds.
    // Every existing database seeds "Default" (its trees may need a provider); a fresh one starts with none.
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='profiles'").get()) {
      this.db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, chat_provider TEXT, chat_model TEXT, chat_effort TEXT,
            smart_provider TEXT, smart_model TEXT, smart_follow_effort INTEGER NOT NULL CHECK(smart_follow_effort IN (0,1)), smart_effort TEXT, quick_provider TEXT, quick_model TEXT, quick_effort TEXT);
          CREATE TABLE active_profile (id INTEGER PRIMARY KEY CHECK(id=1), profile TEXT NOT NULL REFERENCES profiles(id));
          INSERT INTO profiles SELECT '${randomUUID()}','Default',c.provider,c.model,c.effort,s.provider,s.model,coalesce(s.follow_effort,1),s.effort,q.provider,q.model,q.effort
            FROM (SELECT 1) LEFT JOIN chat_settings c ON c.id=1 LEFT JOIN smart_settings s ON s.id=1 LEFT JOIN suggestion_settings q ON q.id=1 WHERE ${+!fresh};
          INSERT INTO active_profile SELECT 1,id FROM profiles;
          COMMIT;`);
    }
    // Additive global tables: one knowledge graph across all learning trees; NOCASE names make a matching concept or topic reuse its row.
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS concepts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS concept_aliases (name TEXT PRIMARY KEY COLLATE NOCASE, concept INTEGER NOT NULL REFERENCES concepts(id));
        CREATE TABLE IF NOT EXISTS concept_topics (concept INTEGER NOT NULL REFERENCES concepts(id), topic INTEGER NOT NULL REFERENCES topics(id), PRIMARY KEY(concept, topic));
        CREATE TABLE IF NOT EXISTS concept_links (concept INTEGER NOT NULL REFERENCES concepts(id), target INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('related','builds on')), PRIMARY KEY(concept, target, kind), CHECK(concept <> target));
        CREATE TABLE IF NOT EXISTS evidence (concept INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('met','asked','used','ignored','known','unknown')), source TEXT, at INTEGER NOT NULL, UNIQUE(concept, kind, source));`);
    // Library ownership: ready videos outlive their source conversation; only title, description and timing are kept.
    // Created once, so existing ready videos migrate without generation and later library removals stay removed.
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='videos'").get()) {
      this.db
        .exec(`CREATE TABLE videos (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, duration REAL, created INTEGER NOT NULL);
          INSERT INTO videos(id,title,description,duration,created) SELECT id,title,description,duration,created FROM artifacts WHERE kind='video' AND status='ready';`);
    }
    // Visual kind and reply positions migrate in place; existing rows keep a NULL position and render after their reply.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.rebuildArtifacts("'visual'");
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    // Visual passages keep their source artifact and part instead of inventing reply offsets.
    if (
      !this.db
        .prepare('PRAGMA table_info(branches)')
        .all()
        .some((c) => c.name === 'artifactId')
    ) {
      this.db.exec(`BEGIN IMMEDIATE; ALTER TABLE branches RENAME TO branches_old;
          ${BRANCHES}
          INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot) SELECT child,parent,messageId,start,end,text,question,snapshot FROM branches_old;
          DROP TABLE branches_old; COMMIT;`);
    }
    // Trees on a fresh database may have no provider; older databases keep assuming the default provider.
    this.assumesProvider = !!this.db
      .prepare('PRAGMA table_info(trees)')
      .all()
      .find((c) => c.name === 'provider').notnull;
    this.interrupt();
  } catch (error) {
    error.backupPath = this.backupPath;
    this.db.close();
    throw error;
  }
}

export const schema = {
  migrate(fresh) {
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, tree TEXT NOT NULL REFERENCES trees(id), role TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_tree_seq ON messages(tree, seq);
      CREATE UNIQUE INDEX IF NOT EXISTS messages_id_tree ON messages(id, tree);
      ${ARTIFACTS}
      ${BRANCHES}`);
    // Older databases gain the video kind, job columns and job statuses; SQLite cannot alter a CHECK in place.
    this.rebuildArtifacts("'interrupted'");
    const columns = this.db
      .prepare('PRAGMA table_info(trees)')
      .all()
      .map((c) => c.name);
    if (!columns.includes('provider'))
      this.db.exec(
        fresh
          ? 'ALTER TABLE trees ADD COLUMN provider TEXT'
          : "ALTER TABLE trees ADD COLUMN provider TEXT NOT NULL DEFAULT 'codex'",
      );
    if (!columns.includes('model')) this.db.exec('ALTER TABLE trees ADD COLUMN model TEXT');
    if (!columns.includes('working_model'))
      this.db.exec(
        'ALTER TABLE trees ADD COLUMN working_model TEXT; UPDATE trees SET working_model=model',
      );
    if (!columns.includes('x')) this.db.exec('ALTER TABLE trees ADD COLUMN x REAL');
    if (!columns.includes('y')) this.db.exec('ALTER TABLE trees ADD COLUMN y REAL');
    if (!columns.includes('layout')) this.db.exec('ALTER TABLE trees ADD COLUMN layout TEXT');
    if (!columns.includes('working_provider'))
      this.db.exec(
        'ALTER TABLE trees ADD COLUMN working_provider TEXT; UPDATE trees SET working_provider=provider',
      );
    if (!columns.includes('working_thread'))
      this.db.exec('ALTER TABLE trees ADD COLUMN working_thread TEXT');
    if (!columns.includes('title_renamed'))
      this.db.exec('ALTER TABLE trees ADD COLUMN title_renamed INTEGER NOT NULL DEFAULT 0');
  },
  // SQLite cannot alter a CHECK in place: rebuild the table when its definition lacks the marker, keeping every saved column.
  rebuildArtifacts(marker) {
    if (
      this.db
        .prepare("SELECT sql FROM sqlite_master WHERE name='artifacts'")
        .get()
        .sql.includes(marker)
    )
      return;
    const kept = this.db
      .prepare('PRAGMA table_info(artifacts)')
      .all()
      .map((c) => c.name)
      .join(',');
    this.db.exec(`ALTER TABLE artifacts RENAME TO artifacts_old;
      ${ARTIFACTS.replace('CREATE INDEX', 'DROP INDEX artifacts_conversation; CREATE INDEX')}
      INSERT INTO artifacts(${kept}) SELECT ${kept} FROM artifacts_old;
      DROP TABLE artifacts_old;`);
  },
  // Starting or stopping never resumes paid inference; saved partial text stays available.
  interrupt() {
    this.db
      .exec(`UPDATE messages SET status='interrupted',stopped='shutdown' WHERE status='streaming';
      UPDATE suggestions SET status='failed' WHERE status='pending';
      UPDATE artifacts SET status='interrupted',error='Video generation was interrupted when TreeTutor stopped.' WHERE status='pending' AND kind='video';
      UPDATE artifacts SET status='failed',source=NULL,error=(CASE kind WHEN 'visual' THEN 'Visual' ELSE 'Diagram' END)||' generation was interrupted when TreeTutor stopped.' WHERE status='pending';`);
  },
};
