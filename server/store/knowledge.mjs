import { familiarity } from '../familiarity.mjs';
import { blob, vector } from './embeddings.mjs';
import { mentions } from '../neighbourhood.mjs';
import { topicAnchors } from '../topicAnchors.mjs';

const summary = (observations, met) => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const o of observations) counts[o.level]++;
    return {
        familiarity: Math.round(familiarity(observations, Date.now()) * 100) / 100,
        met,
        observations: counts,
    };
};

export const knowledge = {
    // INSERT OR IGNORE makes the run once-only per saved reply: reopening or switching providers never reruns it.
    // A stopped reply may keep the part of its notes block that arrived.
    pendingSuggestions(conversation, message) {
        return (
            this.db
                .prepare(
                    "INSERT OR IGNORE INTO suggestions(message,conversation,status) SELECT ?,?,'pending' WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND tree=? AND role='assistant' AND status IN ('completed','interrupted'))",
                )
                .run(message, conversation, message, conversation).changes > 0
        );
    },
    graph() {
        const concepts = this.db
            .prepare(
                "SELECT c.id, c.name, COALESCE((SELECT json_group_array(t.name) FROM (SELECT t.name FROM concept_topics ct JOIN topics t ON t.id=ct.topic WHERE ct.concept=c.id ORDER BY t.name) t),'[]') AS topics FROM concepts c ORDER BY c.name",
            )
            .all();
        const links = this.db
            .prepare(
                'SELECT a.name AS "from", b.name AS "to", l.kind FROM concept_links l JOIN concepts a ON a.id=l.concept JOIN concepts b ON b.id=l.target ORDER BY a.name,b.name,l.kind',
            )
            .all();
        // Every concept's observations and met count in one query each, so the query count stays fixed.
        const observed = Map.groupBy(
            this.db.prepare('SELECT concept, level, confidence, at FROM observations').all(),
            (o) => o.concept,
        );
        const met = new Map(
            this.db
                .prepare(
                    "SELECT concept, COUNT(*) AS n FROM evidence WHERE kind='met' GROUP BY concept",
                )
                .all()
                .map((r) => [r.concept, r.n]),
        );
        return {
            topics: this.db
                .prepare('SELECT name FROM topics ORDER BY name')
                .all()
                .map((t) => t.name),
            concepts: concepts.map((c) => ({
                name: c.name,
                topics: JSON.parse(c.topics),
                ...summary(observed.get(c.id) ?? [], met.get(c.id) ?? 0),
            })),
            links: links.map((l) => ({ ...l })),
        };
    },
    // Kept out of graph(): each tutor reply reads the graph, and only the Knowledge page needs anchors.
    topicAnchors() {
        return topicAnchors(
            this.db
                .prepare(
                    "SELECT c.embedding, COALESCE((SELECT json_group_array(t.name) FROM concept_topics ct JOIN topics t ON t.id=ct.topic WHERE ct.concept=c.id),'[]') AS topics FROM concepts c ORDER BY c.name",
                )
                .all()
                .map((c) => ({ topics: JSON.parse(c.topics), embedding: vector(c.embedding) })),
        );
    },
    // Familiarity is derived from observations, never stored; "met" is counted for display and never moves it.
    familiarity(concept) {
        return summary(
            this.db
                .prepare('SELECT level, confidence, at FROM observations WHERE concept=?')
                .all(concept),
            this.db
                .prepare("SELECT COUNT(*) AS n FROM evidence WHERE concept=? AND kind='met'")
                .get(concept).n,
        );
    },
    conceptEmbeddings() {
        return this.db
            .prepare(
                `SELECT c.id, c.name, c.embedding, o.level, o.at FROM concepts c LEFT JOIN observations o
        ON o.rowid=(SELECT rowid FROM observations WHERE concept=c.id ORDER BY at DESC, rowid DESC LIMIT 1) ORDER BY c.name`,
            )
            .all()
            .map((c) => ({ ...c, embedding: vector(c.embedding) }));
    },
    embedConcept(id, name, embedding) {
        // A merge can delete a pending concept and SQLite can reuse its integer id.
        this.db
            .prepare('UPDATE concepts SET embedding=? WHERE id=? AND name=?')
            .run(blob(embedding), id, name);
    },
    // Familiarity for concepts named in the given text: the relevant concepts sent to the suggestion call.
    // shortcut: whole-name mentions only, so a reworded concept is missed; upgrade with the embedding pre-filter (TreeTutor-5ut.11).
    mentioned(text) {
        return Object.fromEntries(
            this.names()
                .filter((c) => mentions(text, c.name))
                .map((c) => [c.name, this.familiarity(c.id).familiarity]),
        );
    },
    names() {
        return this.db
            .prepare(
                'SELECT id, name FROM concepts UNION ALL SELECT concept AS id, name FROM concept_aliases ORDER BY name',
            )
            .all();
    },
    concept(name) {
        return this.db
            .prepare(
                'SELECT id, name FROM concepts WHERE id=(SELECT id FROM concepts WHERE name=? UNION ALL SELECT concept FROM concept_aliases WHERE name=? LIMIT 1)',
            )
            .get(name, name);
    },
    // An existing concept or alias, else a new concept with no topic; callers hold the transaction.
    conceptId(name) {
        return (
            this.concept(name)?.id ??
            this.db.prepare('INSERT INTO concepts(name) VALUES (?)').run(name).lastInsertRowid
        );
    },
    // A conversation's explored concept is set once; a later name never replaces it.
    explore(conversation, name) {
        this.transaction(() => {
            if (
                this.db
                    .prepare('SELECT 1 FROM trees WHERE id=? AND concept IS NULL')
                    .get(conversation)
            )
                this.db
                    .prepare('UPDATE trees SET concept=? WHERE id=?')
                    .run(this.conceptId(name), conversation);
        });
    },
    evidence(concept, kind, source) {
        this.db
            .prepare('INSERT OR IGNORE INTO evidence(concept,kind,source,at) VALUES (?,?,?,?)')
            .run(concept, kind, source, Date.now());
    },
    // One observation per concept per learner message; saving again (a retried reply) replaces that message's set.
    // Names resolve like reply concepts; an unknown name becomes a new concept with no topic.
    observe(message, verdicts) {
        const at = Date.now();
        this.transaction(() => {
            this.db.prepare('DELETE FROM observations WHERE message=?').run(message);
            for (const v of verdicts) {
                let concept = this.concept(v.concept)?.id;
                if (!concept)
                    concept = this.db
                        .prepare('INSERT INTO concepts(name) VALUES (?)')
                        .run(v.concept).lastInsertRowid;
                this.db
                    .prepare(
                        'INSERT OR REPLACE INTO observations(concept,message,level,confidence,at) VALUES (?,?,?,?,?)',
                    )
                    .run(concept, message, v.level, v.confidence, at);
            }
        });
    },
    brief(message, start, end) {
        return this.db
            .prepare('SELECT explanation FROM briefs WHERE message=? AND start=? AND end=?')
            .get(message, start, end)?.explanation;
    },
    // Saved once per passage; never overwrites one already saved.
    saveBrief({ message, start, end, text, concept }, explanation) {
        this.db
            .prepare('INSERT OR IGNORE INTO briefs VALUES (?,?,?,?,?,?,?)')
            .run(message, start, end, text, concept ?? null, explanation, Date.now());
    },
    // Opening a suggestion's brief explanation is one weak observation of its concept, keyed by the passage so it counts once.
    observeBrief({ message, start, end, concept }) {
        this.db
            .prepare(
                "INSERT OR IGNORE INTO observations(concept,message,level,confidence,at) VALUES (?,?,2,'low',?)",
            )
            .run(this.conceptId(concept), `brief:${message}:${start}:${end}`, Date.now());
    },
    mergeConcepts(from, into) {
        const source = this.concept(from),
            target = this.concept(into);
        if (!source || !target || source.id === target.id) return false;
        const a = source.id,
            b = target.id;
        return this.transaction(() => {
            this.db
                .prepare(
                    'INSERT OR IGNORE INTO concept_topics SELECT ?, topic FROM concept_topics WHERE concept=?',
                )
                .run(b, a);
            this.db.prepare('DELETE FROM concept_topics WHERE concept=?').run(a);
            this.db
                .prepare(
                    'INSERT OR IGNORE INTO concept_links SELECT CASE WHEN concept=? THEN ? ELSE concept END, CASE WHEN target=? THEN ? ELSE target END, kind FROM concept_links WHERE (concept=? OR target=?) AND NOT (concept IN (?,?) AND target IN (?,?))',
                )
                .run(a, b, a, b, a, a, a, b, a, b);
            this.db.prepare('DELETE FROM concept_links WHERE concept=? OR target=?').run(a, a);
            // Only events with the same source are duplicates.
            this.db
                .prepare(
                    'DELETE FROM evidence WHERE concept=? AND source IS NOT NULL AND EXISTS (SELECT 1 FROM evidence kept WHERE kept.concept=? AND kept.kind=evidence.kind AND kept.source=evidence.source)',
                )
                .run(a, b);
            this.db.prepare('UPDATE evidence SET concept=? WHERE concept=?').run(b, a);
            // A learner message observed under both names keeps the kept concept's verdict.
            this.db
                .prepare(
                    'DELETE FROM observations WHERE concept=? AND message IN (SELECT message FROM observations WHERE concept=?)',
                )
                .run(a, b);
            this.db.prepare('UPDATE observations SET concept=? WHERE concept=?').run(b, a);
            for (const row of this.db
                .prepare('SELECT message,passages FROM suggestions WHERE passages IS NOT NULL')
                .all()) {
                const passages = JSON.parse(row.passages);
                let changed = false;
                for (const p of passages)
                    if (p.concept && this.concept(p.concept)?.id === a) {
                        p.concept = target.name;
                        changed = true;
                    }
                if (changed)
                    this.db
                        .prepare('UPDATE suggestions SET passages=? WHERE message=?')
                        .run(JSON.stringify(passages), row.message);
            }
            this.db.prepare('UPDATE trees SET concept=? WHERE concept=?').run(b, a);
            this.db.prepare('UPDATE concept_aliases SET concept=? WHERE concept=?').run(b, a);
            this.db
                .prepare('INSERT INTO concept_aliases(name,concept) VALUES (?,?)')
                .run(source.name, b);
            this.db.prepare('DELETE FROM concepts WHERE id=?').run(a);
            return true;
        });
    },
    // Names resolve case-insensitively to existing rows or aliases; a link needs both ends in the graph after this reply's concepts are added.
    // Every concept in the reply was met there; the message id makes it count once per reply.
    // Returns the concept and topic names this call created, for the automatic merge check (ADR 0022).
    addGraph({ concepts, links }, message = null) {
        const added = { concepts: [], topics: [] };
        const id = (table, name) => {
            if (
                this.db.prepare(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`).run(name).changes
            )
                added[table].push(name);
            return this.db.prepare(`SELECT id FROM ${table} WHERE name=?`).get(name).id;
        };
        this.transaction(() => {
            for (const c of concepts) {
                const concept = this.concept(c.name)?.id ?? id('concepts', c.name);
                if (message) this.evidence(concept, 'met', message);
                for (const t of c.topics)
                    this.db
                        .prepare('INSERT OR IGNORE INTO concept_topics VALUES (?,?)')
                        .run(concept, this.topic(t)?.id ?? id('topics', t));
            }
            const find = (name) => this.concept(name)?.id;
            for (const l of links) {
                const a = find(l.from),
                    b = find(l.to);
                if (a && b && a !== b)
                    this.db
                        .prepare('INSERT OR IGNORE INTO concept_links VALUES (?,?,?)')
                        .run(a, b, l.kind);
            }
        });
        return added;
    },
    topic(name) {
        return this.db
            .prepare(
                'SELECT id, name FROM topics WHERE id=(SELECT id FROM topics WHERE name=? UNION ALL SELECT topic FROM topic_aliases WHERE name=? LIMIT 1)',
            )
            .get(name, name);
    },
    // A topic merge moves the other topic's concepts to the kept one and keeps its name as an alias.
    mergeTopics(from, into) {
        this.transaction(() => {
            this.db
                .prepare(
                    'INSERT OR IGNORE INTO concept_topics SELECT concept, ? FROM concept_topics WHERE topic=?',
                )
                .run(into.id, from.id);
            this.db.prepare('DELETE FROM concept_topics WHERE topic=?').run(from.id);
            this.db.prepare('UPDATE topic_aliases SET topic=? WHERE topic=?').run(into.id, from.id);
            this.db
                .prepare('INSERT INTO topic_aliases(name,topic) VALUES (?,?)')
                .run(from.name, into.id);
            this.db.prepare('DELETE FROM topics WHERE id=?').run(from.id);
        });
    },
    // Automatic merge (ADR 0022): the name with more evidence stays, the older (lower id) on a tie, and the other becomes its alias.
    // A concept's evidence is its evidence and observation rows; a topic's is its concepts. Null when both already name one row.
    mergeDuplicate(kind, a, b) {
        const topic = kind === 'topic';
        const weight = topic
            ? (id) =>
                  this.db.prepare('SELECT COUNT(*) AS n FROM concept_topics WHERE topic=?').get(id)
                      .n
            : (id) =>
                  this.db
                      .prepare(
                          'SELECT (SELECT COUNT(*) FROM evidence WHERE concept=?)+(SELECT COUNT(*) FROM observations WHERE concept=?) AS n',
                      )
                      .get(id, id).n;
        const rows = [a, b].map((name) => (topic ? this.topic(name) : this.concept(name)));
        if (!rows[0] || !rows[1] || rows[0].id === rows[1].id) return null;
        const [kept, merged] = rows
            .map((r) => ({ ...r, n: weight(r.id) }))
            .sort((x, y) => y.n - x.n || x.id - y.id);
        if (topic) this.mergeTopics(merged, kept);
        else this.mergeConcepts(merged.name, kept.name);
        return { kept: kept.name, merged: merged.name };
    },
    // No selection: the tutor's own notes block, so no call is recorded and the reply shows no suggestions usage.
    finishSuggestions(conversation, message, passages, usage, selection, groundwork = []) {
        const at = Date.now();
        if (
            this.db
                .prepare(
                    "UPDATE suggestions SET status=?,passages=?,usage=?,groundwork=? WHERE conversation=? AND message=? AND status='pending'",
                )
                .run(
                    passages ? 'ready' : 'failed',
                    passages && JSON.stringify(passages),
                    selection && JSON.stringify({ ...usage, at }),
                    passages && JSON.stringify(groundwork),
                    conversation,
                    message,
                ).changes &&
            selection
        )
            this.record(`suggestions:${message}`, 'suggestions', selection, usage, at);
    },
    // Quick thinking names the concepts of the tutor's ready passages; a branch made meanwhile keeps its child.
    nameSuggestions(conversation, message, named, usage, selection) {
        const at = Date.now(),
            row = this.db
                .prepare(
                    "SELECT passages FROM suggestions WHERE conversation=? AND message=? AND status='ready'",
                )
                .get(conversation, message);
        if (!row) return;
        const passages = JSON.parse(row.passages).map((p) => {
            const concept = named.find((n) => n.start === p.start && n.end === p.end)?.concept;
            return concept && !p.concept ? { ...p, concept } : p;
        });
        this.db
            .prepare('UPDATE suggestions SET passages=?,usage=? WHERE conversation=? AND message=?')
            .run(JSON.stringify(passages), JSON.stringify({ ...usage, at }), conversation, message);
        this.record(`suggestions:${message}`, 'suggestions', selection, usage, at);
    },
};
