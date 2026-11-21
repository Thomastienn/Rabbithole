import { randomUUID } from 'node:crypto';
import { excerpt, previewText } from '../../src/markdown/markdownText.ts';
import { blob, vector } from './embeddings.mjs';

// A picked visual part's trail and step; the whole-visual Ask and older part branches have none.
const picked = (trail, step) => (trail ? { trail: JSON.parse(trail), step } : {});

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
                "SELECT t.id,t.title,t.created,t.x,t.y,t.layout,b.parent,b.messageId,b.start,b.end,b.text AS passage,b.artifactId,b.label,b.explanation,b.trail,b.step,b.line,c.name AS concept,(SELECT COUNT(*) FROM messages m WHERE m.tree=t.id AND m.role='user') AS learnerMessages FROM trees t LEFT JOIN branches b ON b.child=t.id LEFT JOIN concepts c ON c.id=t.concept ORDER BY t.created DESC,t.rowid DESC",
            )
            .all()
            .map(({ artifactId, label, explanation, trail, step, line, ...t }) => {
                const visual = !artifactId
                    ? {}
                    : line !== null
                      ? { artifactId, line }
                      : { artifactId, label, explanation, ...picked(trail, step) };
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
            // A video's source tells live() whether its saved cuts can play; live() drops it before sending.
            "SELECT id,message,kind,title,status,CASE WHEN kind='video' THEN source END AS source,CASE WHEN kind='discussion' THEN json_array_length(source,'$.classmates') END AS classmates FROM artifacts WHERE conversation=? ORDER BY created,rowid",
        );
        return Object.fromEntries(
            ids.map((id) => {
                const byMessage = new Map();
                for (const { message, classmates, source, ...artifact } of artifacts.all(id)) {
                    if (!byMessage.has(message)) byMessage.set(message, []);
                    byMessage
                        .get(message)
                        .push(
                            artifact.kind === 'discussion'
                                ? { ...artifact, classmates: classmates ?? 0 }
                                : artifact.kind === 'video'
                                  ? { ...artifact, source }
                                  : artifact,
                        );
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
        this.transaction(() => {
            this.db.prepare('UPDATE trees SET layout=? WHERE id=?').run(JSON.stringify(layout), id);
            for (const [p, at] of Object.entries(positions)) this.position(p, at.x, at.y);
        });
    },
    position(id, x, y) {
        this.db.prepare('UPDATE trees SET x=?,y=? WHERE id=?').run(x, y, id);
    },
    // A model-written title never overrides a learner rename.
    retitle(id, title) {
        this.db.prepare('UPDATE trees SET title=? WHERE id=? AND title_renamed=0').run(title, id);
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
        return this.transaction(() => {
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
                this.db.prepare('DELETE FROM attachments WHERE conversation=?').run(conversation);
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
            return { deleted, parent };
        });
    },
    tree(id) {
        const { layout, ...tree } = this.db.prepare('SELECT * FROM trees WHERE id=?').get(id) ?? {};
        const savedBranch = this.db
            .prepare(
                'SELECT parent,messageId,start,end,text,question,snapshot,artifactId,label,explanation,trail,step,line,speaker,discussion FROM branches WHERE child=?',
            )
            .get(id);
        const {
            artifactId,
            label,
            explanation,
            trail,
            step,
            line,
            speaker,
            discussion,
            ...branch
        } = savedBranch ?? {};
        return (
            tree.id && {
                ...tree,
                branch: savedBranch
                    ? {
                          ...branch,
                          ...(artifactId &&
                              (line !== null
                                  ? { artifactId, line, speaker, discussion }
                                  : { artifactId, label, explanation, ...picked(trail, step) })),
                      }
                    : null,
                messages: this.db
                    .prepare(
                        'SELECT id,role,text,status,stopped,usage,questions FROM messages WHERE tree=? ORDER BY seq',
                    )
                    .all(id)
                    .map(({ usage, stopped, questions, ...m }) => {
                        if (m.role !== 'assistant') {
                            const attachments = this.attachments(id, m.id);
                            return attachments.length ? { ...m, attachments } : m;
                        }
                        const mediaUsage = this.replyMediaUsage(m.id),
                            tools = this.toolCalls(m.id);
                        return {
                            ...m,
                            ...(tools.length && { tools }),
                            ...(stopped && { stopped }),
                            ...(questions && { questions: JSON.parse(questions) }),
                            usage: JSON.parse(usage),
                            ...(mediaUsage.length && { mediaUsage }),
                        };
                    }),
                artifacts: this.db
                    .prepare('SELECT * FROM artifacts WHERE conversation=? ORDER BY created,rowid')
                    .all(id),
                resources: this.resources(id),
                suggestions: this.db
                    .prepare(
                        'SELECT message,status,passages,usage,groundwork FROM suggestions WHERE conversation=? ORDER BY rowid',
                    )
                    .all(id)
                    .map(({ usage, groundwork, ...s }) => ({
                        ...s,
                        // A branched passage carries the start of its child's first reply for the popup.
                        passages: JSON.parse(s.passages ?? '[]').map(({ child, ...p }) =>
                            this.live(child) ? { ...p, child, ...this.firstReply(child) } : p,
                        ),
                        // Absent when the tutor's notes block supplied them and no call ran.
                        ...(usage && { usage: JSON.parse(usage) }),
                        groundwork: JSON.parse(groundwork ?? '[]'),
                    })),
                briefs: this.db
                    .prepare(
                        'SELECT b.message,b.start,b.end,b.explanation FROM briefs b JOIN messages m ON m.id=b.message WHERE m.tree=?',
                    )
                    .all(id),
            }
        );
    },
    firstReply(child) {
        const reply = this.db
            .prepare(
                "SELECT text FROM messages WHERE tree=? AND role='assistant' AND text!='' ORDER BY seq LIMIT 1",
            )
            .get(child);
        return reply ? { preview: excerpt(reply.text) } : {};
    },
    // An explored suggestion whose child was deleted reads as unexplored again.
    live(child) {
        return !!child && !!this.db.prepare('SELECT 1 FROM trees WHERE id=?').get(child);
    },
    forgetThread(id) {
        this.db.prepare('UPDATE trees SET thread=NULL,working_thread=NULL WHERE id=?').run(id);
    },
    create(
        title = 'New chat',
        provider = this.assumesProvider ? 'codex' : null,
        model = null,
        effort = null,
    ) {
        const id = randomUUID();
        this.db
            .prepare(
                'INSERT INTO trees(id,title,created,provider,working_provider,model,working_model,effort,working_effort) VALUES(?,?,?,?,?,?,?,?,?)',
            )
            .run(id, title, Date.now(), provider, provider, model, model, effort, effort);
        return this.tree(id);
    },
    branch(parent, anchor, snapshot) {
        return this.transaction(() => {
            const child = this.create(
                anchor.question.trim().slice(0, 200),
                parent.provider,
                parent.model,
                parent.effort ?? null,
            );
            this.db
                .prepare(
                    'INSERT INTO branches(child,parent,messageId,start,end,text,question,snapshot,artifactId,label,explanation,trail,step,line,speaker,discussion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
                    anchor.trail ? JSON.stringify(anchor.trail) : null,
                    anchor.step ?? null,
                    anchor.line ?? null,
                    anchor.speaker ?? null,
                    anchor.discussion ?? null,
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
            // A suggestion or groundwork branch explores that concept from creation.
            const concept = anchor.groundwork ?? hit?.concept;
            if (concept)
                this.db
                    .prepare('UPDATE trees SET concept=? WHERE id=?')
                    .run(this.conceptId(concept), child.id);
            if (hit) {
                hit.child = child.id;
                this.db
                    .prepare('UPDATE suggestions SET passages=? WHERE conversation=? AND message=?')
                    .run(JSON.stringify(passages), parent.id, anchor.messageId);
            }
            return this.tree(child.id);
        });
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
    message(tree, role, text, status, title = text) {
        const id = randomUUID();
        if (role === 'user')
            this.db
                .prepare(
                    "UPDATE trees SET title=? WHERE id=? AND title='New chat' AND title_renamed=0 AND NOT EXISTS(SELECT 1 FROM branches b WHERE b.child=trees.id) AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.tree=trees.id)",
                )
                .run(title.trim().slice(0, 200), tree);
        this.db
            .prepare('INSERT INTO messages(id,tree,role,text,status) VALUES(?,?,?,?,?)')
            .run(id, tree, role, text, status);
        return id;
    },
    attach(conversation, message, attachments) {
        const insert = this.db.prepare(
            'INSERT INTO attachments(id,conversation,message,name,type,size,delivery,text,created) VALUES(?,?,?,?,?,?,?,?,?)',
        );
        for (const a of attachments)
            insert.run(
                a.id,
                conversation,
                message,
                a.name,
                a.type,
                a.size,
                a.delivery,
                a.text,
                Date.now(),
            );
    },
    attachmentDelivery(conversation, attachments) {
        const update = this.db.prepare(
            'UPDATE attachments SET delivery=?,text=? WHERE conversation=? AND id=?',
        );
        for (const a of attachments) update.run(a.delivery, a.text, conversation, a.id);
    },
    attachments(conversation, message) {
        return this.db
            .prepare(
                'SELECT id,name,type,size,delivery,text FROM attachments WHERE conversation=? AND message=? ORDER BY created,rowid',
            )
            .all(conversation, message);
    },
    attachment(conversation, id) {
        return this.db
            .prepare('SELECT id,name,type,delivery FROM attachments WHERE conversation=? AND id=?')
            .get(conversation, id);
    },
    // One row per tool call; later events for the same call update it in place.
    // Pages a native search or fetch reports become resources of the learning tree.
    toolCall(conversation, message, { id, name, input, status, output, elapsed, resources = [] }) {
        for (const resource of resources) this.addResource(conversation, resource);
        this.db
            .prepare(
                'INSERT INTO tool_calls(id,conversation,message,name,input,output,status,started,elapsed) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(message,id) DO UPDATE SET input=excluded.input,output=excluded.output,status=excluded.status,elapsed=excluded.elapsed',
            )
            .run(
                id,
                conversation,
                message,
                name,
                JSON.stringify(input ?? null),
                output ?? null,
                status,
                Date.now(),
                elapsed ?? null,
            );
    },
    // A reply that ends while a tool runs keeps that call as failed.
    stopToolCalls(message) {
        return this.db
            .prepare(
                "UPDATE tool_calls SET status='failed',output=coalesce(output,'Stopped before it finished.'),elapsed=max(elapsed,?-started) WHERE message=? AND status='running' RETURNING id,name,input,output,status,elapsed",
            )
            .all(Date.now(), message)
            .map((t) => ({ ...t, input: JSON.parse(t.input) }));
    },
    toolCalls(message) {
        return this.db
            .prepare(
                'SELECT id,name,input,output,status,elapsed FROM tool_calls WHERE message=? ORDER BY rowid',
            )
            .all(message)
            .map((t) => ({ ...t, input: JSON.parse(t.input) }));
    },
    update(id, text, status, stopped = null) {
        this.db
            .prepare('UPDATE messages SET text=?,status=?,stopped=?,embedding=NULL WHERE id=?')
            .run(text, status, stopped, id);
        // Citations are rebuilt once the reply settles, not on every streamed save.
        if (status !== 'streaming') this.cite(id, text);
    },
    nextQuestions(id, questions) {
        this.db
            .prepare('UPDATE messages SET questions=? WHERE id=?')
            .run(JSON.stringify(questions), id);
    },
    // Retry drops the failed reply and its artifacts; library videos live in their own table and are kept.
    discardReply(conversation, message) {
        this.transaction(() => {
            this.db
                .prepare('DELETE FROM artifacts WHERE conversation=? AND message=?')
                .run(conversation, message);
            this.db
                .prepare('DELETE FROM suggestions WHERE conversation=? AND message=?')
                .run(conversation, message);
            this.db
                .prepare("DELETE FROM messages WHERE tree=? AND id=? AND role='assistant'")
                .run(conversation, message);
        });
    },
    // Completed messages across every learning tree, newest first, for search_conversations.
    recallMessages() {
        return this.db
            .prepare(
                "SELECT id, tree, role, text, embedding FROM messages WHERE status='completed' ORDER BY seq DESC",
            )
            .all()
            .map((m) => ({ ...m, embedding: vector(m.embedding) }));
    },
    // Every conversation with its parent and inherited context, for recall search and addresses.
    recallConversations() {
        return this.db
            .prepare(
                'SELECT t.id,t.title,t.created,b.parent,b.text AS passage,b.question,b.snapshot FROM trees t LEFT JOIN branches b ON b.child=t.id',
            )
            .all();
    },
    // The text guard skips a message rewritten while the embedder ran.
    embedMessage(id, text, embedding) {
        this.db
            .prepare('UPDATE messages SET embedding=? WHERE id=? AND text=?')
            .run(blob(embedding), id, text);
    },
};
