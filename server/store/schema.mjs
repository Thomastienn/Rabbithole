import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

const ARTIFACTS = `CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('mermaid','video','visual','discussion')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','canceled','interrupted')),
        title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL, position INTEGER, side TEXT,
        FOREIGN KEY(message, conversation) REFERENCES messages(id, tree));
      CREATE INDEX IF NOT EXISTS artifacts_conversation ON artifacts(conversation, created);`;
const BRANCHES = `CREATE TABLE IF NOT EXISTS branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER, end INTEGER, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL, artifactId TEXT, label TEXT, explanation TEXT, line INTEGER, speaker TEXT, discussion TEXT);`;

// The Store constructor body: opens, backs up and migrates the database; called with the Store as this.
export function open(path) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    const hasColumn = (table, name) =>
        this.db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name=?').get(table, name);
    try {
        const version = this.db.prepare('PRAGMA user_version').get().user_version;
        if (version > 1)
            throw new Error(
                `Database schema ${version} is newer than this Rabbithole supports (1). Use the newer Rabbithole version; your database was not changed.`,
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
            this.transaction(() => {
                this.migrate(fresh);
                this.db.exec('PRAGMA user_version=1');
            });
        }
        // Additive nullable column: older Rabbithole builds still open the database.
        if (!hasColumn('messages', 'usage'))
            this.db.exec('ALTER TABLE messages ADD COLUMN usage TEXT');
        // Why an interrupted reply stopped: 'learner' (Stop) or 'shutdown' (crash or quit); NULL on older rows, so those never offer Retry.
        if (!hasColumn('messages', 'stopped'))
            this.db.exec('ALTER TABLE messages ADD COLUMN stopped TEXT');
        // A visual's side beside the section after its position; NULL on older rows, which sit in the flow.
        if (!hasColumn('artifacts', 'side'))
            this.db.exec('ALTER TABLE artifacts ADD COLUMN side TEXT');
        for (const name of ['effort', 'working_effort']) {
            if (!hasColumn('trees', name))
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
        if (!hasColumn('suggestions', 'nameTokens'))
            this.db.exec('ALTER TABLE suggestions ADD COLUMN nameTokens INTEGER');
        // Groundwork names saved with the reply's suggestions, a JSON array; NULL reads as none.
        if (!hasColumn('suggestions', 'groundwork'))
            this.db.exec('ALTER TABLE suggestions ADD COLUMN groundwork TEXT');
        // Durable usage: counts, time and attribution only, so deleting content never shrinks history. NULL counts = not reported.
        if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='usage_events'").get()) {
            this.db
                .exec(`CREATE TABLE usage_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, provider TEXT, model TEXT, task TEXT NOT NULL CHECK(task IN ('chat','suggestions','compaction','diagram','video','title','verdict','brief')),
          input INTEGER, output INTEGER, cacheRead INTEGER, CHECK((input IS NULL) = (output IS NULL) AND (input IS NULL) = (cacheRead IS NULL)));
          CREATE INDEX usage_events_at ON usage_events(at);
          INSERT OR IGNORE INTO usage_events(id,at,task,input,output,cacheRead) SELECT 'chat:'||id,usage->>'at','chat',usage->>'input',usage->>'output',usage->>'cacheRead' FROM messages WHERE usage IS NOT NULL;
          INSERT OR IGNORE INTO usage_events(id,at,task,input,output,cacheRead) SELECT 'suggestions:'||message,usage->>'at','suggestions',usage->>'input',usage->>'output',usage->>'cacheRead' FROM suggestions WHERE usage IS NOT NULL;`);
        }
        if (!hasColumn('usage_events', 'message')) {
            this.db
                .exec(`ALTER TABLE usage_events ADD COLUMN message TEXT REFERENCES messages(id) ON DELETE SET NULL;
        CREATE INDEX usage_events_message ON usage_events(message);
        UPDATE usage_events SET message=(SELECT message FROM artifacts a WHERE
          usage_events.id='diagram:'||a.id OR usage_events.id LIKE 'diagram:'||a.id||':%' OR
          usage_events.id LIKE 'video:'||a.attempt||':%' LIMIT 1)
          WHERE task IN ('diagram','video');`);
        }
        // Title and verdict usage widen the task check; SQLite needs a rebuild to change it.
        if (
            !this.db
                .prepare("SELECT sql FROM sqlite_master WHERE name='usage_events'")
                .get()
                .sql.includes("'verdict'")
        )
            this.transaction(() =>
                this.db.exec(`ALTER TABLE usage_events RENAME TO usage_events_old;
          CREATE TABLE usage_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, provider TEXT, model TEXT, task TEXT NOT NULL CHECK(task IN ('chat','suggestions','compaction','diagram','video','title','verdict')),
            input INTEGER, output INTEGER, cacheRead INTEGER, message TEXT REFERENCES messages(id) ON DELETE SET NULL, CHECK((input IS NULL) = (output IS NULL) AND (input IS NULL) = (cacheRead IS NULL)));
          INSERT INTO usage_events(id,at,provider,model,task,input,output,cacheRead,message) SELECT id,at,provider,model,task,input,output,cacheRead,message FROM usage_events_old;
          DROP TABLE usage_events_old;
          CREATE INDEX usage_events_at ON usage_events(at);
          CREATE INDEX usage_events_message ON usage_events(message);`),
            );
        // Video calls name their stage and, for one-cut calls, the cut number; older rows keep NULL (not recorded).
        if (!hasColumn('usage_events', 'stage'))
            this.db.exec(
                'ALTER TABLE usage_events ADD COLUMN stage TEXT; ALTER TABLE usage_events ADD COLUMN cut INTEGER;',
            );
        // Brief explanation usage widens the task check again; this rebuild keeps the stage and cut columns.
        if (
            !this.db
                .prepare("SELECT sql FROM sqlite_master WHERE name='usage_events'")
                .get()
                .sql.includes("'brief'")
        )
            this.transaction(() =>
                this.db.exec(`ALTER TABLE usage_events RENAME TO usage_events_old;
          CREATE TABLE usage_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, provider TEXT, model TEXT, task TEXT NOT NULL CHECK(task IN ('chat','suggestions','compaction','diagram','video','title','verdict','brief')),
            input INTEGER, output INTEGER, cacheRead INTEGER, message TEXT REFERENCES messages(id) ON DELETE SET NULL, stage TEXT, cut INTEGER, CHECK((input IS NULL) = (output IS NULL) AND (input IS NULL) = (cacheRead IS NULL)));
          INSERT INTO usage_events SELECT id,at,provider,model,task,input,output,cacheRead,message,stage,cut FROM usage_events_old;
          DROP TABLE usage_events_old;
          CREATE INDEX usage_events_at ON usage_events(at);
          CREATE INDEX usage_events_message ON usage_events(message);`),
            );
        // Reasoning tokens are part of output, kept apart where the provider reports them; older rows keep NULL (not reported).
        if (!hasColumn('usage_events', 'reasoning'))
            this.db.exec('ALTER TABLE usage_events ADD COLUMN reasoning INTEGER');
        // Additive table: brief explanations sit beside tutor replies, keyed by reply and passage; the tutor never reads them.
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS briefs (message TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, start INTEGER NOT NULL, end INTEGER NOT NULL, text TEXT NOT NULL, concept TEXT, explanation TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(message, start, end))',
        );
        this.db.exec(
            `CREATE TABLE IF NOT EXISTS suggestion_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), provider TEXT, model TEXT)`,
        );
        // The suggestion row is the quick thinking role; its pinned model migrates in place and effort is additive.
        if (!hasColumn('suggestion_settings', 'effort'))
            this.db.exec('ALTER TABLE suggestion_settings ADD COLUMN effort TEXT');
        // Tutor style: no row or NULL text means the built-in default.
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS tutor_style (id INTEGER PRIMARY KEY CHECK(id=1), text TEXT)',
        );
        // Memory note: one learner-editable markdown text sent whole with every chat prompt.
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS memory_note (id INTEGER PRIMARY KEY CHECK(id=1), text TEXT NOT NULL)',
        );
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS searxng_settings (id INTEGER PRIMARY KEY CHECK(id=1), url TEXT)',
        );
        // Video mode: no row means Quality.
        this.db.exec(
            "CREATE TABLE IF NOT EXISTS video_mode (id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL CHECK(mode IN ('quality','saving')))",
        );
        // Learner-typed efforts for custom endpoint models, listed after the endpoint's advertised efforts.
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS endpoint_efforts (endpoint TEXT NOT NULL, model TEXT NOT NULL, effort TEXT NOT NULL, PRIMARY KEY(endpoint, model, effort))',
        );
        // Each nullable override independently follows the reported capability until chosen.
        const endpointModels =
            'CREATE TABLE IF NOT EXISTS endpoint_models (endpoint TEXT NOT NULL, model TEXT NOT NULL, reads_images INTEGER CHECK(reads_images IN (0,1)), uses_tutor_tools INTEGER CHECK(uses_tutor_tools IN (0,1)), PRIMARY KEY(endpoint, model))';
        this.db.exec(endpointModels);
        if (!hasColumn('endpoint_models', 'uses_tutor_tools')) {
            this.transaction(() => {
                this.db.exec('ALTER TABLE endpoint_models RENAME TO endpoint_models_old');
                this.db.exec(endpointModels);
                this.db.exec(
                    'INSERT INTO endpoint_models(endpoint,model,reads_images) SELECT endpoint,model,reads_images FROM endpoint_models_old; DROP TABLE endpoint_models_old',
                );
            });
        }
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS tutor_tools (name TEXT PRIMARY KEY, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)))',
        );
        // Tutor tool calls per reply message, in call order; they go with their message.
        this.db.exec(
            "CREATE TABLE IF NOT EXISTS tool_calls (id TEXT NOT NULL, conversation TEXT NOT NULL, message TEXT NOT NULL, name TEXT NOT NULL, input TEXT NOT NULL, output TEXT, status TEXT NOT NULL CHECK(status IN ('running','done','failed')), started INTEGER NOT NULL, elapsed INTEGER, PRIMARY KEY(message, id), FOREIGN KEY(message, conversation) REFERENCES messages(id, tree) ON DELETE CASCADE)",
        );
        // Resources per learning tree (keyed by its root), numbered within the tree; one URL is one resource. Citations go with their reply.
        this.db
            .exec(`CREATE TABLE IF NOT EXISTS resources (tree TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE, number INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, site TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('page','image','file','quote','clip')), first_seen INTEGER NOT NULL, PRIMARY KEY(tree, number), UNIQUE(tree, url));
      CREATE TABLE IF NOT EXISTS citations (tree TEXT NOT NULL, number INTEGER NOT NULL, message TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, PRIMARY KEY(tree, number, message), FOREIGN KEY(tree, number) REFERENCES resources(tree, number) ON DELETE CASCADE);`);
        // Video exhibits widen the kind check (quotes and clips). SQLite's table rebuild with foreign keys off,
        // so dropping the old table cannot cascade into citations.
        if (
            !this.db
                .prepare("SELECT sql FROM sqlite_master WHERE name='resources'")
                .get()
                .sql.includes("'quote'")
        ) {
            this.db.exec('PRAGMA foreign_keys=OFF');
            this.transaction(() =>
                this.db
                    .exec(`CREATE TABLE resources_new (tree TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE, number INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, site TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('page','image','file','quote','clip')), first_seen INTEGER NOT NULL, PRIMARY KEY(tree, number), UNIQUE(tree, url));
          INSERT INTO resources_new SELECT tree,number,url,title,site,kind,first_seen FROM resources;
          DROP TABLE resources; ALTER TABLE resources_new RENAME TO resources;`),
            );
            this.db.exec('PRAGMA foreign_keys=ON');
        }
        // Smart role: a NULL model follows the chat default model; follow_effort=1 follows the chat default effort.
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS smart_settings (id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT, model TEXT, follow_effort INTEGER NOT NULL CHECK(follow_effort IN (0,1)), effort TEXT)',
        );
        // Model profiles: each holds the chat, smart and quick thinking roles; the old role rows seed "Default" once and stay for older builds.
        // Every existing database seeds "Default" (its trees may need a provider); a fresh one starts with none.
        if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='profiles'").get()) {
            this.transaction(() =>
                this.db
                    .exec(`CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, chat_provider TEXT, chat_model TEXT, chat_effort TEXT,
            smart_provider TEXT, smart_model TEXT, smart_follow_effort INTEGER NOT NULL CHECK(smart_follow_effort IN (0,1)), smart_effort TEXT, quick_provider TEXT, quick_model TEXT, quick_effort TEXT);
          CREATE TABLE active_profile (id INTEGER PRIMARY KEY CHECK(id=1), profile TEXT NOT NULL REFERENCES profiles(id));
          INSERT INTO profiles SELECT '${randomUUID()}','Default',c.provider,c.model,c.effort,s.provider,s.model,coalesce(s.follow_effort,1),s.effort,q.provider,q.model,q.effort
            FROM (SELECT 1) LEFT JOIN chat_settings c ON c.id=1 LEFT JOIN smart_settings s ON s.id=1 LEFT JOIN suggestion_settings q ON q.id=1 WHERE ${+!fresh};
          INSERT INTO active_profile SELECT 1,id FROM profiles;`),
            );
        }
        // Additive global tables: one knowledge graph across all learning trees; NOCASE names make a matching concept or topic reuse its row.
        this.db
            .exec(`CREATE TABLE IF NOT EXISTS concepts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS topics (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS concept_aliases (name TEXT PRIMARY KEY COLLATE NOCASE, concept INTEGER NOT NULL REFERENCES concepts(id));
        CREATE TABLE IF NOT EXISTS concept_topics (concept INTEGER NOT NULL REFERENCES concepts(id), topic INTEGER NOT NULL REFERENCES topics(id), PRIMARY KEY(concept, topic));
        CREATE TABLE IF NOT EXISTS concept_links (concept INTEGER NOT NULL REFERENCES concepts(id), target INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('related','builds on')), PRIMARY KEY(concept, target, kind), CHECK(concept <> target));
        CREATE TABLE IF NOT EXISTS evidence (concept INTEGER NOT NULL REFERENCES concepts(id), kind TEXT NOT NULL CHECK(kind IN ('met','asked','used','ignored','known','unknown')), source TEXT, at INTEGER NOT NULL, UNIQUE(concept, kind, source));`);
        if (!hasColumn('concepts', 'embedding'))
            this.db.exec('ALTER TABLE concepts ADD COLUMN embedding BLOB');
        // Explored concept, set once per conversation. Added once: conversations already branched from a saved suggestion take its concept.
        if (!hasColumn('trees', 'concept')) {
            this.transaction(() => {
                this.db.exec(
                    'ALTER TABLE trees ADD COLUMN concept INTEGER REFERENCES concepts(id)',
                );
                const explore = this.db.prepare(
                    'UPDATE trees SET concept=? WHERE id=? AND concept IS NULL',
                );
                for (const row of this.db
                    .prepare('SELECT passages FROM suggestions WHERE passages IS NOT NULL')
                    .all())
                    for (const p of JSON.parse(row.passages))
                        if (p.child && p.concept && this.live(p.child))
                            explore.run(this.conceptId(p.concept), p.child);
            });
        }
        // Saved messages get a Float32 embedding for recall, filled lazily when the local embedder is usable.
        if (!hasColumn('messages', 'embedding'))
            this.db.exec('ALTER TABLE messages ADD COLUMN embedding BLOB');
        // Next questions from the tutor's notes block, a JSON array; NULL when the reply had none.
        if (!hasColumn('messages', 'questions'))
            this.db.exec('ALTER TABLE messages ADD COLUMN questions TEXT');
        // Observations: the tutor's verdict on what one learner message showed about a concept; familiarity derives from them.
        // Created once: the old familiarity evidence (asked, used, ignored and corrections) was test data and goes; met stays.
        if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='observations'").get())
            this.transaction(() =>
                this.db
                    .exec(`CREATE TABLE observations (concept INTEGER NOT NULL REFERENCES concepts(id), message TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 5), confidence TEXT NOT NULL CHECK(confidence IN ('low','high')), at INTEGER NOT NULL, PRIMARY KEY(concept, message));
          CREATE INDEX observations_message ON observations(message);
          DELETE FROM evidence WHERE kind<>'met';`),
            );
        // Library ownership: ready videos outlive their source conversation; only title, description and timing are kept.
        // Created once, so existing ready videos migrate without generation and later library removals stay removed.
        if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='videos'").get()) {
            this.db
                .exec(`CREATE TABLE videos (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, duration REAL, created INTEGER NOT NULL);
          INSERT INTO videos(id,title,description,duration,created) SELECT id,title,description,duration,created FROM artifacts WHERE kind='video' AND status='ready';`);
        }
        // Library playback: a library video keeps its cut source and attempt; saved videos backfill from their tree.
        if (!hasColumn('videos', 'source'))
            this.transaction(() =>
                this.db.exec(`ALTER TABLE videos ADD COLUMN source TEXT;
          ALTER TABLE videos ADD COLUMN attempt TEXT;
          UPDATE videos SET (source,attempt)=(SELECT source,attempt FROM artifacts WHERE artifacts.id=videos.id AND kind='video' AND status='ready');`),
            );
        // Piece library: one saved Remotion set piece per row, shared across videos; the embedding is a Float32 blob of its look.
        this.db
            .exec(`CREATE TABLE IF NOT EXISTS pieces (id TEXT PRIMARY KEY, name TEXT NOT NULL, look TEXT NOT NULL, props TEXT NOT NULL, source TEXT NOT NULL, roles TEXT NOT NULL, embedding BLOB, created INTEGER NOT NULL, improved INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS piece_videos (piece TEXT NOT NULL REFERENCES pieces(id) ON DELETE CASCADE, video TEXT NOT NULL, PRIMARY KEY(piece, video));`);
        // A piece's optional 3D form; pieces saved before it have none and stay 2D-only.
        if (!hasColumn('pieces', 'source3d'))
            this.db.exec('ALTER TABLE pieces ADD COLUMN source3d TEXT');
        // JPEG stills of both forms for the library cards; pieces saved before them are backfilled.
        if (!hasColumn('pieces', 'still'))
            this.db.exec(
                'ALTER TABLE pieces ADD COLUMN still BLOB; ALTER TABLE pieces ADD COLUMN still3d BLOB',
            );
        // The library pieces a piece is built from, as [{name, id}]; pieces saved before parts have none.
        if (!hasColumn('pieces', 'parts')) this.db.exec('ALTER TABLE pieces ADD COLUMN parts TEXT');
        // The true colours a piece keeps on reuse, as {role or name: hex}; older pieces have none (ADR 0009).
        if (!hasColumn('pieces', 'true_colors'))
            this.db.exec('ALTER TABLE pieces ADD COLUMN true_colors TEXT');
        // Older versions of a piece, replaced by an improvement; the pieces row is the current one.
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS piece_versions (piece TEXT NOT NULL REFERENCES pieces(id) ON DELETE CASCADE, name TEXT NOT NULL, look TEXT NOT NULL, props TEXT NOT NULL, source TEXT NOT NULL, source3d TEXT, roles TEXT NOT NULL, true_colors TEXT, parts TEXT, improved INTEGER NOT NULL)',
        );
        // Discussion kind and reply positions migrate in place; existing rows keep their content and positions.
        this.transaction(() => this.rebuildArtifacts("'discussion'"));
        // Visual passages keep their source artifact and part instead of inventing reply offsets.
        if (!hasColumn('branches', 'artifactId')) {
            this.transaction(() =>
                this.db.exec(`ALTER TABLE branches RENAME TO branches_old;
          ${BRANCHES}
          INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot) SELECT child,parent,messageId,start,end,text,question,snapshot FROM branches_old;
          DROP TABLE branches_old;`),
            );
        }
        // Discussion passages keep their line index, its speaker and the discussion context fixed at branch time.
        if (!hasColumn('branches', 'line'))
            this.transaction(() =>
                this.db.exec(`ALTER TABLE branches ADD COLUMN line INTEGER;
          ALTER TABLE branches ADD COLUMN speaker TEXT; ALTER TABLE branches ADD COLUMN discussion TEXT;`),
            );
        // A picked visual part keeps its trail (JSON names, outermost first) and the step it was picked on.
        if (!hasColumn('branches', 'trail'))
            this.transaction(() =>
                this.db.exec(`ALTER TABLE branches ADD COLUMN trail TEXT;
          ALTER TABLE branches ADD COLUMN step INTEGER;`),
            );
        // First-run setup: decided once; an upgraded database with a profile (holding any chosen model) or a tree skips it.
        if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='first_run'").get())
            this.db
                .exec(`CREATE TABLE first_run (id INTEGER PRIMARY KEY CHECK(id=1), finished INTEGER NOT NULL CHECK(finished IN (0,1)));
          INSERT INTO first_run SELECT 1, EXISTS(SELECT 1 FROM profiles) OR EXISTS(SELECT 1 FROM trees);`);
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
};
