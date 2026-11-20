// The learning tree a conversation belongs to is its root; every branch shares the root's resources.
const ROOT = `WITH RECURSIVE up(id) AS (SELECT ? UNION SELECT parent FROM branches JOIN up ON child=up.id) SELECT id FROM up WHERE id NOT IN (SELECT child FROM branches)`;

// Only link syntax cites: [3](resource:3). Prose such as a[3] never matches.
const CITED = /\]\(\s*<?resource:(\d+)>?\s*\)/g;

export const resources = {
    rootOf(conversation) {
        return this.db.prepare(ROOT).get(conversation)?.id ?? conversation;
    },
    // Returns the resource's number in the tree; the same URL keeps its first number.
    addResource(conversation, { url, title, site, kind }) {
        const tree = this.rootOf(conversation);
        this.db
            .prepare(
                "INSERT INTO resources(tree,number,url,title,site,kind,first_seen) SELECT ?1,coalesce(max(number),0)+1,?2,?3,?4,?5,?6 FROM resources WHERE tree=?1 ON CONFLICT(tree,url) DO UPDATE SET title=excluded.title WHERE resources.title=''",
            )
            .run(tree, url, title ?? '', site ?? '', kind, Date.now());
        return this.db.prepare('SELECT number FROM resources WHERE tree=? AND url=?').get(tree, url)
            .number;
    },
    // Replaces the reply's citations with the resource links in its current text.
    cite(message, text) {
        const row = this.db.prepare('SELECT tree FROM messages WHERE id=?').get(message);
        if (!row) return;
        const tree = this.rootOf(row.tree);
        this.db.prepare('DELETE FROM citations WHERE message=?').run(message);
        const insert = this.db.prepare(
            'INSERT OR IGNORE INTO citations(tree,number,message) SELECT tree,number,? FROM resources WHERE tree=? AND number=?',
        );
        for (const [, n] of text.matchAll(CITED)) insert.run(message, tree, Number(n));
    },
    // Each resource with the conversations whose replies cite it, in tree order.
    resources(conversation) {
        const tree = this.rootOf(conversation);
        const citing = this.db.prepare(
            'SELECT DISTINCT m.tree AS id FROM citations c JOIN messages m ON m.id=c.message WHERE c.tree=? AND c.number=? ORDER BY m.seq',
        );
        return this.db
            .prepare(
                'SELECT number,url,title,site,kind,first_seen AS firstSeen FROM resources WHERE tree=? ORDER BY number',
            )
            .all(tree)
            .map((r) => ({ ...r, conversations: citing.all(tree, r.number).map((c) => c.id) }));
    },
};
