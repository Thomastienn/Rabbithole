import { randomUUID } from 'node:crypto';
import { previewText } from '../../src/markdown/markdownText.ts';

export const trees = {
  // Run once at startup: removes learning trees never sent a message (older New chat saved them eagerly); focused chats are kept.
  pruneEmpty() {
    return this.db
      .prepare(
        'DELETE FROM trees WHERE id NOT IN (SELECT child FROM branches) AND id NOT IN (SELECT parent FROM branches) AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.tree=trees.id) AND NOT EXISTS(SELECT 1 FROM artifacts a WHERE a.conversation=trees.id)',
      )
      .run().changes;
  },
  list() {
    return this.db
      .prepare(
        'SELECT t.id,t.title,t.created,t.x,t.y,t.layout,b.parent,b.messageId,b.start,b.end,b.text AS passage,b.artifactId,b.label,b.explanation FROM trees t LEFT JOIN branches b ON b.child=t.id ORDER BY t.created DESC,t.rowid DESC',
      )
      .all()
      .map(({ artifactId, label, explanation, ...t }) => {
        const visual = artifactId ? { artifactId, label, explanation } : {};
        try {
          return { ...t, ...visual, layout: JSON.parse(t.layout) };
        } catch {
          return { ...t, ...visual, layout: null };
        }
      });
  },
  // Title-only, newest first; saved conversation text is never scanned.
  search(query) {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [];
    return this.db
      .prepare(
        'SELECT id AS root,title FROM trees WHERE id NOT IN (SELECT child FROM branches) ORDER BY created DESC,rowid DESC',
      )
      .all()
      .filter((t) => t.title.toLocaleLowerCase().includes(q));
  },
  // Strip reply syntax before truncation; the stored messages remain the canonical source.
  previews(ids) {
    const messages = this.db.prepare(
      'SELECT id, role, text, status FROM messages WHERE tree=? ORDER BY seq',
    );
    const artifacts = this.db.prepare(
      'SELECT id,message,kind,title,status FROM artifacts WHERE conversation=? ORDER BY created,rowid',
    );
    return Object.fromEntries(
      ids.map((id) => {
        const byMessage = new Map();
        for (const { message, ...artifact } of artifacts.all(id)) {
          if (!byMessage.has(message)) byMessage.set(message, []);
          byMessage.get(message).push(artifact);
        }
        return [
          id,
          messages.all(id).map((m) => ({
            ...m,
            text: previewText(m.text, m.role),
            ...(byMessage.has(m.id) && { artifacts: byMessage.get(m.id) }),
          })),
        ];
      }),
    );
  },
  layout(id, layout, positions = {}) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE trees SET layout=? WHERE id=?').run(JSON.stringify(layout), id);
      for (const [p, at] of Object.entries(positions)) this.position(p, at.x, at.y);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  },
  position(id, x, y) {
    this.db.prepare('UPDATE trees SET x=?,y=? WHERE id=?').run(x, y, id);
  },
  rename(id, title) {
    this.db.prepare('UPDATE trees SET title=?,title_renamed=1 WHERE id=?').run(title, id);
  },
  descendants(id) {
    return this.db
      .prepare(
        `WITH RECURSIVE subtree(id) AS (SELECT id FROM trees WHERE id=? UNION SELECT child FROM branches JOIN subtree ON parent=subtree.id) SELECT id FROM subtree`,
      )
      .all(id)
      .map((t) => t.id);
  },
  remove(root, id, stageFiles) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.tree(root)?.branch || !this.descendants(root).includes(id))
        throw new Error('Conversation does not belong to this chat.');
      const parent = this.tree(id).branch?.parent ?? null,
        deleted = this.descendants(id);
      const artifacts = deleted.flatMap((conversation) => this.tree(conversation).artifacts);
      for (const conversation of deleted)
        this.db.prepare('DELETE FROM artifacts WHERE conversation=?').run(conversation);
      for (const conversation of deleted)
        this.db.prepare('DELETE FROM suggestions WHERE conversation=?').run(conversation);
      for (const conversation of deleted)
        this.db.prepare('DELETE FROM branches WHERE child=?').run(conversation);
      for (const conversation of deleted)
        this.db.prepare('DELETE FROM messages WHERE tree=?').run(conversation);
      for (const conversation of deleted)
        this.db.prepare('DELETE FROM trees WHERE id=?').run(conversation);
      if (parent) {
        const layout = this.list().find((t) => t.id === root)?.layout;
        if (layout)
          this.db.prepare('UPDATE trees SET layout=? WHERE id=?').run(
            JSON.stringify({
              ...layout,
              folded: layout.folded.filter((f) => !deleted.includes(f)),
              selected: deleted.includes(layout.selected) ? parent : layout.selected,
            }),
            root,
          );
      }
      stageFiles(artifacts);
      this.db.exec('COMMIT');
      return { deleted, parent };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  },
  tree(id) {
    const { layout, ...tree } = this.db.prepare('SELECT * FROM trees WHERE id=?').get(id) ?? {};
    const savedBranch = this.db
      .prepare(
        'SELECT parent,messageId,start,end,text,question,snapshot,artifactId,label,explanation FROM branches WHERE child=?',
      )
      .get(id);
    const { artifactId, label, explanation, ...branch } = savedBranch ?? {};
    return (
      tree.id && {
        ...tree,
        branch: savedBranch
          ? { ...branch, ...(artifactId && { artifactId, label, explanation }) }
          : null,
        messages: this.db
          .prepare(
            'SELECT id,role,text,status,stopped,usage FROM messages WHERE tree=? ORDER BY seq',
          )
          .all(id)
          .map(({ usage, stopped, ...m }) => {
            if (m.role !== 'assistant') return m;
            const mediaUsage = this.replyMediaUsage(m.id);
            return {
              ...m,
              ...(stopped && { stopped }),
              usage: JSON.parse(usage),
              ...(mediaUsage.length && { mediaUsage }),
            };
          }),
        artifacts: this.db
          .prepare('SELECT * FROM artifacts WHERE conversation=? ORDER BY created,rowid')
          .all(id),
        suggestions: this.db
          .prepare(
            'SELECT message,status,passages,usage FROM suggestions WHERE conversation=? ORDER BY rowid',
          )
          .all(id)
          .map((s) => ({
            ...s,
            passages: JSON.parse(s.passages ?? '[]').map(({ child, ...p }) =>
              this.live(child) ? { ...p, child } : p,
            ),
            usage: JSON.parse(s.usage),
          })),
      }
    );
  },
  // An explored suggestion whose child was deleted reads as unexplored again.
  live(child) {
    return !!child && !!this.db.prepare('SELECT 1 FROM trees WHERE id=?').get(child);
  },
  forgetThread(id) {
    this.db.prepare('UPDATE trees SET thread=NULL,working_thread=NULL WHERE id=?').run(id);
  },
  create(title = 'New chat', provider = 'codex', model = null, effort = null) {
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO trees(id,title,created,provider,working_provider,model,working_model,effort,working_effort) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(id, title, Date.now(), provider, provider, model, model, effort, effort);
    return this.tree(id);
  },
  branch(parent, anchor, snapshot) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const child = this.create(
        anchor.question.trim().slice(0, 200),
        parent.provider,
        parent.model,
        parent.effort ?? null,
      );
      this.db
        .prepare(
          'INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot,artifactId,label,explanation) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          child.id,
          parent.id,
          anchor.messageId,
          anchor.start ?? null,
          anchor.end ?? null,
          anchor.text,
          anchor.question,
          snapshot,
          anchor.artifactId ?? null,
          anchor.label ?? null,
          anchor.explanation ?? null,
        );
      // Branching from a suggestion marks it explored, in the same transaction as the saved child.
      const row =
        anchor.suggestion === true &&
        this.db
          .prepare(
            "SELECT passages FROM suggestions WHERE conversation=? AND message=? AND status='ready'",
          )
          .get(parent.id, anchor.messageId);
      const passages = row ? JSON.parse(row.passages) : [],
        hit = passages.find(
          (p) => p.start === anchor.start && p.end === anchor.end && !this.live(p.child),
        );
      if (hit) {
        hit.child = child.id;
        this.db
          .prepare('UPDATE suggestions SET passages=? WHERE conversation=? AND message=?')
          .run(JSON.stringify(passages), parent.id, anchor.messageId);
      }
      // Any branch, suggested or highlighted, asks about the passage's concepts.
      for (const c of this.passageConcepts(parent.id, anchor.messageId, anchor))
        this.evidence(c, 'asked', child.id);
      this.db.exec('COMMIT');
      return this.tree(child.id);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  },
  // Inherited context is written once, when the branch's background compaction finishes.
  compacted(child, snapshot) {
    this.db
      .prepare("UPDATE branches SET snapshot=? WHERE child=? AND snapshot=''")
      .run(snapshot, child);
  },
  thread(id, thread, model) {
    this.db
      .prepare('UPDATE trees SET thread=?,model=COALESCE(?,model) WHERE id=?')
      .run(thread, model ?? null, id);
  },
  model(id, model, effort = null) {
    this.db.prepare('UPDATE trees SET model=?,effort=? WHERE id=?').run(model, effort, id);
  },
  // Provider sessions are not portable: switching drops the thread so the next provider receives saved history.
  // The working provider's session is kept so a failed switch, or switching straight back, resumes it.
  switchProvider(id, provider, model, effort = null) {
    this.db
      .prepare(
        `UPDATE trees SET working_thread=CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END,
      thread=CASE WHEN ? IS COALESCE(working_provider,provider) THEN CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END END,
      provider=?,model=?,effort=? WHERE id=?`,
      )
      .run(provider, provider, model, effort, id);
  },
  finishModel(id, completed) {
    this.db
      .prepare(
        completed
          ? 'UPDATE trees SET working_model=model,working_provider=provider,working_effort=effort WHERE id=?'
          : 'UPDATE trees SET model=working_model,effort=working_effort,thread=CASE WHEN provider IS COALESCE(working_provider,provider) THEN thread ELSE working_thread END,provider=COALESCE(working_provider,provider) WHERE id=?',
      )
      .run(id);
  },
  // The first question of an unstarted root replaces its placeholder title, using the branch-title rule.
  message(tree, role, text, status) {
    const id = randomUUID();
    if (role === 'user')
      this.db
        .prepare(
          "UPDATE trees SET title=? WHERE id=? AND title='New chat' AND title_renamed=0 AND NOT EXISTS(SELECT 1 FROM branches b WHERE b.child=trees.id) AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.tree=trees.id)",
        )
        .run(text.trim().slice(0, 200), tree);
    this.db
      .prepare('INSERT INTO messages(id,tree,role,text,status) VALUES(?,?,?,?,?)')
      .run(id, tree, role, text, status);
    return id;
  },
  update(id, text, status, stopped = null) {
    this.db
      .prepare('UPDATE messages SET text=?,status=?,stopped=? WHERE id=?')
      .run(text, status, stopped, id);
  },
  // Retry drops the failed reply and its artifacts; library videos live in their own table and are kept.
  discardReply(conversation, message) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare('DELETE FROM artifacts WHERE conversation=? AND message=?')
        .run(conversation, message);
      this.db
        .prepare('DELETE FROM suggestions WHERE conversation=? AND message=?')
        .run(conversation, message);
      this.db
        .prepare("DELETE FROM messages WHERE tree=? AND id=? AND role='assistant'")
        .run(conversation, message);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  },
};
