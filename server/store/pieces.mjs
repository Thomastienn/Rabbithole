import { randomUUID } from 'node:crypto';
import { blob, vector, cosine } from './embeddings.mjs';

export const pieces = {
  // Saves one piece used by a video; returns its id.
  savePiece({ name, look, props, source, roles, embedding = null }, video) {
    const id = randomUUID(),
      now = Date.now();
    this.db
      .prepare(
        'INSERT INTO pieces(id,name,look,props,source,roles,embedding,created,improved) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        name,
        look,
        JSON.stringify(props),
        source,
        JSON.stringify(roles),
        blob(embedding),
        now,
        now,
      );
    if (video) this.usePiece(id, video);
    return id;
  },
  // A validated rewrite replaces the entry for future videos; saved videos are rendered files and never change.
  improvePiece(id, { source, props, roles }) {
    this.db
      .prepare('UPDATE pieces SET source=?, props=?, roles=?, improved=? WHERE id=?')
      .run(source, JSON.stringify(props), JSON.stringify(roles), Date.now(), id);
  },
  usePiece(id, video) {
    this.db.prepare('INSERT OR IGNORE INTO piece_videos(piece,video) VALUES (?,?)').run(id, video);
  },
  piece(id) {
    const row = this.db.prepare('SELECT * FROM pieces WHERE id=?').get(id);
    if (!row) return null;
    const videos = this.db
      .prepare('SELECT video FROM piece_videos WHERE piece=? ORDER BY rowid')
      .all(id)
      .map((r) => r.video);
    return {
      ...row,
      props: JSON.parse(row.props),
      roles: JSON.parse(row.roles),
      embedding: vector(row.embedding),
      videos,
    };
  },
  // The Pieces tab: newest improvement first, with the saved library videos that use each piece.
  pieceList() {
    const used = this.db.prepare(
      'SELECT v.id, v.title FROM piece_videos p JOIN videos v ON v.id=p.video WHERE p.piece=? ORDER BY p.rowid',
    );
    return this.db
      .prepare('SELECT id, name, look, improved FROM pieces ORDER BY improved DESC, rowid DESC')
      .all()
      .map((p) => ({ ...p, videos: used.all(p.id).map((v) => ({ ...v })) }));
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
      .map(({ id, score }) => ({ ...this.piece(id), score }));
  },
};
