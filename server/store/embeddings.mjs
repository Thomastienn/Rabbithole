export const blob = (vector) => (vector ? new Uint8Array(Float32Array.from(vector).buffer) : null);
// Copy first: SQLite blobs need not be 4-byte aligned for a Float32Array view.
export const vector = (bytes) =>
  bytes ? [...new Float32Array(Uint8Array.from(bytes).buffer)] : null;
export const cosine = (a, b) => {
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
