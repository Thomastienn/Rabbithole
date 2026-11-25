import { randomUUID } from 'node:crypto';
import { blob, vector, cosine } from './embeddings.mjs';

// shortcut: a fixed cosine floor tuned by eye for all-MiniLM-L6-v2; revisit if the embedder changes.
const MIN_SCORE = 0.25;

export const pieces = {
    // Saves one piece used by a video; returns its id. Parts ([{name, id}]) refer to saved pieces, never copies.
    savePiece(
        {
            name,
            look,
            props,
            source,
            source3d = null,
            roles,
            trueColors = {},
            parts = [],
            embedding = null,
        },
        video,
    ) {
        const id = randomUUID(),
            now = Date.now();
        this.db
            .prepare(
                'INSERT INTO pieces(id,name,look,props,source,source3d,roles,true_colors,parts,embedding,created,improved) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
                id,
                name,
                look,
                JSON.stringify(props),
                source,
                source3d,
                JSON.stringify(roles),
                JSON.stringify(trueColors),
                JSON.stringify(parts),
                blob(embedding),
                now,
                now,
            );
        if (video) this.usePiece(id, video);
        return id;
    },
    // A validated rewrite becomes the current version for future videos; the replaced one is kept in piece_versions,
    // and saved videos keep the module they were made with. Both forms are replaced together so they never drift
    // apart; their stills are rendered again. A new look replaces the embedding too (null until backfilled).
    improvePiece(
        id,
        { name, look, source, source3d = null, props, roles, trueColors, parts, embedding = null },
    ) {
        this.transaction(() => {
            this.db
                .prepare(
                    'INSERT INTO piece_versions(piece,name,look,props,source,source3d,roles,true_colors,parts,improved) SELECT id,name,look,props,source,source3d,roles,true_colors,parts,improved FROM pieces WHERE id=?',
                )
                .run(id);
            this.db
                .prepare(
                    'UPDATE pieces SET name=COALESCE(?,name), look=COALESCE(?,look), source=?, source3d=?, props=?, roles=?, true_colors=COALESCE(?,true_colors), parts=COALESCE(?,parts), embedding=CASE WHEN ? IS NULL THEN embedding ELSE ? END, improved=?, still=NULL, still3d=NULL WHERE id=?',
                )
                .run(
                    name ?? null,
                    look ?? null,
                    source,
                    source3d,
                    JSON.stringify(props),
                    JSON.stringify(roles),
                    trueColors ? JSON.stringify(trueColors) : null,
                    parts ? JSON.stringify(parts) : null,
                    look ?? null,
                    blob(embedding),
                    Date.now(),
                    id,
                );
        });
    },
    // One-time cleanup: pieces sharing a name become one, the newest current and the others its older versions;
    // video links and parts move to it. Saved videos keep the modules they were made with. Callers hold the transaction.
    foldDuplicatePieces() {
        const keeper = new Map(),
            moved = new Map();
        for (const { id, name } of this.db
            .prepare('SELECT id, name FROM pieces ORDER BY improved DESC, rowid DESC')
            .all()) {
            const keep = keeper.get(name);
            if (!keep) {
                keeper.set(name, id);
                continue;
            }
            this.db
                .prepare(
                    'INSERT INTO piece_versions(piece,name,look,props,source,source3d,roles,true_colors,parts,improved) SELECT ?,name,look,props,source,source3d,roles,true_colors,parts,improved FROM pieces WHERE id=?',
                )
                .run(keep, id);
            this.db.prepare('UPDATE piece_versions SET piece=? WHERE piece=?').run(keep, id);
            this.db
                .prepare(
                    'INSERT OR IGNORE INTO piece_videos(piece,video) SELECT ?,video FROM piece_videos WHERE piece=? ORDER BY rowid',
                )
                .run(keep, id);
            this.db.prepare('DELETE FROM pieces WHERE id=?').run(id);
            moved.set(id, keep);
        }
        if (!moved.size) return;
        for (const [table, owner] of [
            ['pieces', 'id'],
            ['piece_versions', 'piece'],
        ])
            for (const r of this.db
                .prepare(
                    `SELECT rowid, ${owner} AS owner, parts FROM ${table} WHERE parts IS NOT NULL`,
                )
                .all()) {
                // Drop direct self-references created when a part folds into its owner.
                const parts = JSON.parse(r.parts)
                    .map((p) => ({ ...p, id: moved.get(p.id) ?? p.id }))
                    .filter((p) => p.id !== r.owner);
                this.db
                    .prepare(`UPDATE ${table} SET parts=? WHERE rowid=?`)
                    .run(JSON.stringify(parts), r.rowid);
            }
    },
    // Pieces whose stills are missing, saved earlier or just saved or improved, oldest first.
    unstilledPieces() {
        return this.db
            .prepare('SELECT id, improved FROM pieces WHERE still IS NULL ORDER BY rowid')
            .all()
            .map((r) => ({ ...r }));
    },
    // Stores stills rendered from the forms of that improvement; a newer improvement drops them.
    stillPiece(id, improved, { still, still3d = null }) {
        this.db
            .prepare('UPDATE pieces SET still=?, still3d=? WHERE id=? AND improved=?')
            .run(still, still3d, id, improved);
    },
    pieceStill(id, form) {
        const row = this.db
            .prepare(
                `SELECT ${form === '3d' ? 'still3d' : 'still'} AS still FROM pieces WHERE id=?`,
            )
            .get(id);
        return row?.still ?? null;
    },
    usePiece(id, video) {
        this.db
            .prepare('INSERT OR IGNORE INTO piece_videos(piece,video) VALUES (?,?)')
            .run(id, video);
    },
    piece(id) {
        const row = this.db.prepare('SELECT * FROM pieces WHERE id=?').get(id);
        if (!row) return null;
        const videos = this.db
            .prepare('SELECT video FROM piece_videos WHERE piece=? ORDER BY rowid')
            .all(id)
            .map((r) => r.video);
        const { true_colors, ...rest } = row;
        return {
            ...rest,
            trueColors: JSON.parse(true_colors ?? '{}'),
            props: JSON.parse(row.props),
            roles: JSON.parse(row.roles),
            parts: JSON.parse(row.parts ?? '[]'),
            embedding: vector(row.embedding),
            videos,
        };
    },
    // A piece with each part's current saved version (and its parts) attached, so an improved part reaches
    // every later assembly. Skip missing parts and edges that would revisit an ancestor after folding.
    pieceTree(id, ancestors = new Set()) {
        if (ancestors.has(id)) return null;
        const piece = this.piece(id);
        if (!piece) return null;
        const path = new Set(ancestors).add(id);
        const parts = piece.parts.map((p) => ({ ...p, piece: this.pieceTree(p.id, path) }));
        return { ...piece, parts: parts.filter((p) => p.piece) };
    },
    // The Pieces view, one page at a time. Without a query: newest improvement first. With a query
    // vector: embedded pieces ranked by cosine, keeping close matches and name/look text matches;
    // without one: a case-insensitive text match on name and look.
    pieceList({ query = '', vector = null, offset = 0, limit = 24 } = {}) {
        const used = this.db.prepare(
            'SELECT v.id, v.title FROM piece_videos p JOIN videos v ON v.id=p.video WHERE p.piece=? ORDER BY p.rowid',
        );
        const q = query.trim().toLocaleLowerCase(),
            matches = (p) => `${p.name}\n${p.look}`.toLocaleLowerCase().includes(q);
        let rows = this.db
            .prepare(
                'SELECT id, name, look, improved, source3d IS NOT NULL AS solid, still IS NOT NULL AS still, still3d IS NOT NULL AS still3d FROM pieces ORDER BY improved DESC, rowid DESC',
            )
            .all()
            .map((p) => ({ ...p, solid: !!p.solid, still: !!p.still, still3d: !!p.still3d }));
        if (q && vector) {
            const score = new Map(this.nearestPieces(vector, Infinity).map((p) => [p.id, p.score]));
            rows = rows
                .map((p) => ({ p, s: (score.get(p.id) ?? 0) + (matches(p) ? 1 : 0) }))
                .filter(({ s }) => s >= MIN_SCORE)
                .sort((a, b) => b.s - a.s)
                .map(({ p }) => p);
        } else if (q) rows = rows.filter(matches);
        return {
            total: rows.length,
            pieces: rows
                .slice(offset, offset + limit)
                .map((p) => ({ ...p, videos: used.all(p.id).map((v) => ({ ...v })) })),
        };
    },
    hasPieces() {
        return !!this.db.prepare('SELECT 1 FROM pieces LIMIT 1').get();
    },
    // Pieces saved while no embedder was usable, to embed when one is.
    unembeddedPieces() {
        return this.db
            .prepare('SELECT id, look FROM pieces WHERE embedding IS NULL ORDER BY rowid')
            .all();
    },
    embedPiece(id, embedding) {
        this.db.prepare('UPDATE pieces SET embedding=? WHERE id=?').run(blob(embedding), id);
    },
    // shortcut: a plain cosine scan over every embedded piece; fine for a personal library of hundreds.
    nearestPieces(query, limit = 5) {
        return this.db
            .prepare('SELECT id, embedding FROM pieces WHERE embedding IS NOT NULL')
            .all()
            .map((r) => ({ id: r.id, score: cosine(query, vector(r.embedding)) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(({ id, score }) => ({ ...this.pieceTree(id), score }));
    },
};
