const WEIGHTS = { met: 0.1, asked: 0.2, used: 0.3, ignored: 0.05 };
// Whole-word, case-insensitive name match.
const mentions = (text, name) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(text);

export const knowledge = {
  // INSERT OR IGNORE makes the run once-only per saved reply: reopening or switching providers never reruns it.
  pendingSuggestions(conversation, message, nameTokens = null) {
    return (
      this.db
        .prepare(
          "INSERT OR IGNORE INTO suggestions(message,conversation,status,nameTokens) SELECT ?,?,'pending',? WHERE EXISTS(SELECT 1 FROM messages WHERE id=? AND tree=? AND role='assistant' AND status='completed')",
        )
        .run(message, conversation, nameTokens, message, conversation).changes > 0
    );
  },
  // The latest suggestion call's concept-name list size, for the Settings cost warning.
  nameTokens() {
    return (
      this.db
        .prepare(
          'SELECT nameTokens FROM suggestions WHERE nameTokens IS NOT NULL ORDER BY rowid DESC LIMIT 1',
        )
        .get()?.nameTokens ?? 0
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
    return {
      topics: this.db
        .prepare('SELECT name FROM topics ORDER BY name')
        .all()
        .map((t) => t.name),
      concepts: concepts.map((c) => ({
        name: c.name,
        topics: JSON.parse(c.topics),
        ...this.familiarity(c.id),
      })),
      links: links.map((l) => ({ ...l })),
    };
  },
  // Familiarity is derived, never stored: the latest correction outranks all inference; otherwise weighted evidence, capped at 1.
  familiarity(concept) {
    const evidence = { met: 0, asked: 0, used: 0, ignored: 0 };
    for (const r of this.db
      .prepare(
        "SELECT kind, COUNT(*) AS n FROM evidence WHERE concept=? AND kind IN ('met','asked','used','ignored') GROUP BY kind",
      )
      .all(concept))
      evidence[r.kind] = r.n;
    const correction =
      this.db
        .prepare(
          "SELECT kind FROM evidence WHERE concept=? AND kind IN ('known','unknown') ORDER BY rowid DESC LIMIT 1",
        )
        .get(concept)?.kind ?? null;
    const inferred = Math.min(
      1,
      Object.entries(evidence).reduce((sum, [kind, n]) => sum + WEIGHTS[kind] * n, 0),
    );
    return {
      familiarity: Math.round((correction ? +(correction === 'known') : inferred) * 100) / 100,
      evidence,
      correction,
    };
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
  evidence(concept, kind, source) {
    this.db
      .prepare('INSERT OR IGNORE INTO evidence(concept,kind,source,at) VALUES (?,?,?,?)')
      .run(concept, kind, source, Date.now());
  },
  // Repeated corrections are all kept and the latest wins.
  correct(name, kind) {
    const concept = this.concept(name)?.id;
    if (concept)
      this.db
        .prepare('INSERT INTO evidence(concept,kind,source,at) VALUES (?,?,NULL,?)')
        .run(concept, kind, Date.now());
    return !!concept;
  },
  mergeConcepts(from, into) {
    const source = this.concept(from),
      target = this.concept(into);
    if (!source || !target || source.id === target.id) return false;
    const a = source.id,
      b = target.id;
    this.db.exec('BEGIN IMMEDIATE');
    try {
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
      // Preserve row order for corrections; only events with the same source are duplicates.
      this.db
        .prepare(
          'DELETE FROM evidence WHERE concept=? AND source IS NOT NULL AND EXISTS (SELECT 1 FROM evidence kept WHERE kept.concept=? AND kept.kind=evidence.kind AND kept.source=evidence.source)',
        )
        .run(a, b);
      this.db.prepare('UPDATE evidence SET concept=? WHERE concept=?').run(b, a);
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
      this.db.prepare('UPDATE concept_aliases SET concept=? WHERE concept=?').run(b, a);
      this.db.prepare('INSERT INTO concept_aliases(name,concept) VALUES (?,?)').run(source.name, b);
      this.db.prepare('DELETE FROM concepts WHERE id=?').run(a);
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  },
  // A passage's concepts: the one the suggestion call tagged, plus concepts met in that reply whose name the passage contains.
  passageConcepts(conversation, message, passage) {
    const row = this.db
      .prepare(
        "SELECT passages FROM suggestions WHERE conversation=? AND message=? AND status='ready'",
      )
      .get(conversation, message);
    const tagged = JSON.parse(row?.passages ?? '[]').find(
      (p) => p.start === passage.start && p.end === passage.end,
    )?.concept;
    const met = new Set(
      this.db
        .prepare("SELECT concept FROM evidence WHERE kind='met' AND source=?")
        .all(message)
        .map((e) => e.concept),
    );
    const ids = this.names()
      .filter((c) => met.has(c.id) && mentions(passage.text, c.name))
      .map((c) => c.id);
    const own = tagged && this.concept(tagged)?.id;
    return [...new Set(own ? [own, ...ids] : ids)];
  },
  // A saved question identifies each use so duplicate concepts can share one evidence event after a merge.
  questionEvidence(conversation, text, message) {
    for (const id of new Set(
      this.names()
        .filter((c) => mentions(text, c.name))
        .map((c) => c.id),
    ))
      this.evidence(id, 'used', message);
    const last = this.db
      .prepare(
        "SELECT id FROM messages WHERE tree=? AND role='assistant' ORDER BY seq DESC LIMIT 1",
      )
      .get(conversation)?.id;
    const row =
      last &&
      this.db
        .prepare(
          "SELECT passages FROM suggestions WHERE conversation=? AND message=? AND status='ready'",
        )
        .get(conversation, last);
    for (const p of JSON.parse(row?.passages ?? '[]'))
      if (!this.live(p.child))
        for (const c of this.passageConcepts(conversation, last, p))
          this.evidence(c, 'ignored', last);
  },
  // Names resolve case-insensitively to existing rows; a link needs both ends in the graph after this reply's concepts are added.
  // Every concept in the reply was met there; the message id makes it count once per reply.
  addGraph({ concepts, links }, message = null) {
    const id = (table, name) => {
      this.db.prepare(`INSERT OR IGNORE INTO ${table}(name) VALUES (?)`).run(name);
      return this.db.prepare(`SELECT id FROM ${table} WHERE name=?`).get(name).id;
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const c of concepts) {
        const concept = this.concept(c.name)?.id ?? id('concepts', c.name);
        if (message) this.evidence(concept, 'met', message);
        for (const t of c.topics)
          this.db
            .prepare('INSERT OR IGNORE INTO concept_topics VALUES (?,?)')
            .run(concept, id('topics', t));
      }
      const find = (name) => this.concept(name)?.id;
      for (const l of links) {
        const a = find(l.from),
          b = find(l.to);
        if (a && b && a !== b)
          this.db.prepare('INSERT OR IGNORE INTO concept_links VALUES (?,?,?)').run(a, b, l.kind);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  },
  finishSuggestions(conversation, message, passages, usage, selection) {
    const at = Date.now();
    if (
      this.db
        .prepare(
          "UPDATE suggestions SET status=?,passages=?,usage=? WHERE conversation=? AND message=? AND status='pending'",
        )
        .run(
          passages ? 'ready' : 'failed',
          passages && JSON.stringify(passages),
          usage && JSON.stringify({ ...usage, at }),
          conversation,
          message,
        ).changes
    )
      this.record(`suggestions:${message}`, 'suggestions', selection, usage, at);
  },
};
