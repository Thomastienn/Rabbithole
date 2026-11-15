import { randomUUID } from 'node:crypto';

const blob = (vector) => (vector ? new Uint8Array(Float32Array.from(vector).buffer) : null);
// Copy first: SQLite blobs need not be 4-byte aligned for a Float32Array view.
const vector = (bytes) => (bytes ? [...new Float32Array(Uint8Array.from(bytes).buffer)] : null);
const cosine = (a, b) => {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
};

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
