import { plainText } from '../../src/markdown/markdownText.ts';
import { conversationAddresses } from '../../src/map/treeList.ts';
import { stripMarkers } from '../media/markers.mjs';

const LIMIT = 50,
    SNIPPET = 160;

// What search reads of a message: a reply's plain words without markers, a question as typed.
const searchText = (role, text) =>
    role === 'assistant' ? plainText(stripMarkers(text, true).text) : text;
const quote = (word) => `"${word.replaceAll('"', '""')}"`;
const trigrams = (word) => {
    const chars = [...word];
    return chars.slice(2).map((_, i) => chars.slice(i, i + 3).join(''));
};
// Every occurrence of each needle, as [start, end) in text; at a word start only when prefix is set.
const occurrences = (lower, needles, prefix = false) =>
    needles.flatMap((n) => {
        const found = [];
        for (let i = lower.indexOf(n); i >= 0; i = lower.indexOf(n, i + 1))
            if (!prefix || i === 0 || /[^\p{L}\p{N}]/u.test(lower[i - 1]))
                found.push([i, i + n.length]);
        return found;
    });
const merge = (ranges) =>
    ranges
        .sort((a, b) => a[0] - b[0])
        .reduce((out, r) => {
            const last = out.at(-1);
            if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
            else out.push([...r]);
            return out;
        }, []);

// About SNIPPET characters around the first match (the longest run for a typo match), cut at spaces.
function snippet(text, ranges, fuzzy) {
    const anchor = fuzzy
        ? ranges.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), [0, 0])
        : (ranges[0] ?? [0, 0]);
    let start = Math.max(0, anchor[0] - 40),
        end = Math.min(text.length, start + SNIPPET);
    if (start > 0) {
        const space = text.indexOf(' ', start);
        if (space >= 0 && space < anchor[0]) start = space + 1;
    }
    if (end < text.length) {
        const space = text.lastIndexOf(' ', end);
        if (space > anchor[1]) end = space;
    }
    const lead = start > 0 ? '…' : '',
        shift = lead.length - start;
    return {
        snippet: lead + text.slice(start, end) + (end < text.length ? '…' : ''),
        ranges: ranges
            .filter(([s, e]) => e > start && s < end)
            .map(([s, e]) => [Math.max(s, start) + shift, Math.min(e, end) + shift]),
    };
}

export const search = {
    // Built once: an FTS5 trigram index over titles, passages, branch questions and completed messages.
    // Triggers keep conversation rows in step inside the writing statement; messages are indexed by indexMessage.
    searchIndex() {
        if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='search_texts'").get()) return;
        this.transaction(() => {
            this.db
                .exec(`CREATE TABLE search_texts (id INTEGER PRIMARY KEY, conversation TEXT NOT NULL, field TEXT NOT NULL CHECK(field IN ('title','passage','question','reply')), message TEXT UNIQUE, text TEXT NOT NULL);
          CREATE INDEX search_texts_conversation ON search_texts(conversation);
          CREATE VIRTUAL TABLE search_index USING fts5(text, content='search_texts', content_rowid='id', tokenize='trigram');
          CREATE TRIGGER search_texts_insert AFTER INSERT ON search_texts BEGIN INSERT INTO search_index(rowid,text) VALUES(new.id,new.text); END;
          CREATE TRIGGER search_texts_delete AFTER DELETE ON search_texts BEGIN INSERT INTO search_index(search_index,rowid,text) VALUES('delete',old.id,old.text); END;
          CREATE TRIGGER search_texts_update AFTER UPDATE OF text ON search_texts BEGIN INSERT INTO search_index(search_index,rowid,text) VALUES('delete',old.id,old.text); INSERT INTO search_index(rowid,text) VALUES(new.id,new.text); END;
          CREATE TRIGGER search_tree_insert AFTER INSERT ON trees BEGIN INSERT INTO search_texts(conversation,field,text) VALUES(new.id,'title',new.title); END;
          CREATE TRIGGER search_tree_title AFTER UPDATE OF title ON trees BEGIN UPDATE search_texts SET text=new.title WHERE conversation=new.id AND field='title'; END;
          CREATE TRIGGER search_tree_delete AFTER DELETE ON trees BEGIN DELETE FROM search_texts WHERE conversation=old.id; END;
          CREATE TRIGGER search_branch_insert AFTER INSERT ON branches BEGIN INSERT INTO search_texts(conversation,field,text) VALUES(new.child,'passage',new.text),(new.child,'question',new.question); END;
          CREATE TRIGGER search_branch_delete AFTER DELETE ON branches BEGIN DELETE FROM search_texts WHERE conversation=old.child AND field IN ('passage','question'); END;
          CREATE TRIGGER search_message_delete AFTER DELETE ON messages BEGIN DELETE FROM search_texts WHERE message=old.id; END;
          INSERT INTO search_texts(conversation,field,text) SELECT id,'title',title FROM trees;
          INSERT INTO search_texts(conversation,field,text) SELECT child,'passage',text FROM branches;
          INSERT INTO search_texts(conversation,field,text) SELECT child,'question',question FROM branches;`);
            for (const { id } of this.db
                .prepare("SELECT id FROM messages WHERE status='completed'")
                .all())
                this.indexMessage(id);
        });
    },
    // A completed message is searchable; any other status leaves the index.
    indexMessage(id) {
        const m = this.db.prepare('SELECT tree,role,text,status FROM messages WHERE id=?').get(id);
        if (m?.status !== 'completed')
            return void this.db.prepare('DELETE FROM search_texts WHERE message=?').run(id);
        this.db
            .prepare(
                'INSERT INTO search_texts(conversation,field,message,text) VALUES(?,?,?,?) ON CONFLICT(message) DO UPDATE SET text=excluded.text',
            )
            .run(
                m.tree,
                m.role === 'assistant' ? 'reply' : 'question',
                id,
                searchText(m.role, m.text),
            );
    },
    // Joins the caller's transaction or opens one, so a message and its index row save together.
    atomically(write) {
        return this.db.isTransaction ? write() : this.transaction(write);
    },
    // Words of 3+ characters match anywhere, in any order; shorter ones match title words by prefix.
    // With no match, a shared-trigram ranking forgives typos. One result per conversation, grouped by learning tree.
    search(query, current) {
        const words = [...new Set(query.toLocaleLowerCase().split(/\s+/).filter(Boolean))],
            long = words.filter((w) => [...w].length >= 3),
            short = words.filter((w) => [...w].length < 3);
        if (!words.length) return [];
        const rows = (match, limit) =>
            this.db
                .prepare(
                    `SELECT t.conversation,t.field,t.message,t.text,search_index.rank AS rank FROM search_index JOIN search_texts t ON t.id=search_index.rowid WHERE search_index MATCH ? ORDER BY rank LIMIT ${limit}`,
                )
                .all(match);
        // shortcut: ranges assume lower-casing keeps string length, true for nearly all scripts; map offsets if a script breaks it.
        const exact = (r) => {
            const lower = r.text.toLocaleLowerCase(),
                titleWords = occurrences(lower, short, true);
            if (
                r.field === 'title' &&
                short.some((s) => !titleWords.some(([i]) => lower.startsWith(s, i)))
            )
                return null;
            return {
                ...r,
                ranges: merge([
                    ...occurrences(lower, long),
                    ...(r.field === 'title' ? titleWords : []),
                ]),
            };
        };
        let found = (
            long.length
                ? rows(long.map(quote).join(' '), 2000)
                : this.db
                      .prepare(
                          "SELECT conversation,field,message,text,0 AS rank FROM search_texts WHERE field='title'",
                      )
                      .all()
        )
            .map(exact)
            .filter(Boolean);
        let fuzzy = false;
        if (!found.length && long.length) {
            fuzzy = true;
            const wanted = [...new Set(long.flatMap(trigrams))];
            found = rows(wanted.map(quote).join(' OR '), 500).flatMap((r) => {
                const hits = occurrences(r.text.toLocaleLowerCase(), wanted);
                const shared = new Set(hits.map(([s, e]) => r.text.slice(s, e).toLocaleLowerCase()))
                    .size;
                // Two trigrams in a row (4+ characters) mark a likely misspelling; lone trigrams are noise.
                const ranges = merge(hits).filter(([s, e]) => e - s >= 4);
                return shared / wanted.length >= 0.5 && ranges.length
                    ? [{ ...r, rank: -shared / wanted.length, ranges }]
                    : [];
            });
        }
        const conversations = this.db
            .prepare(
                'SELECT t.id,t.title,t.created,b.parent FROM trees t LEFT JOIN branches b ON b.child=t.id',
            )
            .all();
        const byId = new Map(conversations.map((c) => [c.id, c])),
            addresses = conversationAddresses(conversations);
        const rootOf = (c) => {
            while (c.parent && byId.has(c.parent)) c = byId.get(c.parent);
            return c;
        };
        // Title matches first, then FTS5 rank, newest first on ties; the best row stands for its conversation.
        found.sort(
            (a, b) =>
                (b.field === 'title') - (a.field === 'title') ||
                a.rank - b.rank ||
                byId.get(b.conversation)?.created - byId.get(a.conversation)?.created,
        );
        const groups = new Map(),
            seen = new Set();
        for (const r of found) {
            const c = byId.get(r.conversation);
            if (!c || seen.has(c.id)) continue;
            seen.add(c.id);
            const root = rootOf(c);
            if (!groups.has(root.id)) groups.set(root.id, []);
            groups.get(root.id).push({
                conversation: c.id,
                root: root.id,
                tree: root.title,
                address: addresses.get(c.id).address,
                title: c.title,
                field: r.field,
                ...snippet(r.text, r.ranges, fuzzy),
                ...(r.message && { message: r.message }),
            });
        }
        const ordered = [...groups].sort(([a], [b]) => (b === current) - (a === current));
        return ordered.flatMap(([, results]) => results).slice(0, LIMIT);
    },
};
