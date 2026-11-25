// A 2D anchor per topic: the first two principal components of topic centroids (the mean of their
// concepts' embeddings), scaled so the furthest sits at distance 1. Topics without embeddings are left
// out, so the graph places them on its even circle; fewer than two placeable topics place none.
export function topicAnchors(concepts) {
    const sums = new Map();
    let dim;
    for (const c of concepts) {
        if (!c.embedding) continue;
        dim ??= c.embedding.length;
        // An embedding from another model cannot share the space.
        if (c.embedding.length !== dim) continue;
        for (const topic of c.topics) {
            const s = sums.get(topic) ?? { n: 0, v: new Array(dim).fill(0) };
            s.n++;
            c.embedding.forEach((x, i) => (s.v[i] += x));
            sums.set(topic, s);
        }
    }
    const names = [...sums.keys()].sort((a, b) => a.localeCompare(b));
    if (names.length < 2) return {};
    const rows = names.map((t) => sums.get(t).v.map((x) => x / sums.get(t).n));
    const mean = rows[0].map((_, i) => rows.reduce((s, r) => s + r[i], 0) / rows.length);
    const centred = rows.map((r) => r.map((x, i) => x - mean[i]));
    const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    // PCA through the small topic-by-topic Gram matrix: power iteration from a fixed start, then deflation.
    const gram = centred.map((a) => centred.map((b) => dot(a, b)));
    const scores = names.map(() => [0, 0]);
    for (const axis of [0, 1]) {
        let v = names.map((_, i) => i + 1),
            value = 0;
        for (let step = 0; step < 300; step++) {
            const next = gram.map((row) => dot(row, v));
            value = Math.hypot(...next);
            if (value < 1e-12) break;
            v = next.map((x) => x / value);
        }
        if (value < 1e-12) break;
        v.forEach((x, i) => (scores[i][axis] = x * Math.sqrt(value)));
        for (let i = 0; i < names.length; i++)
            for (let j = 0; j < names.length; j++) gram[i][j] -= value * v[i] * v[j];
    }
    const furthest = Math.max(...scores.map(([x, y]) => Math.hypot(x, y)));
    if (furthest < 1e-9) return {};
    return Object.fromEntries(
        names.map((t, i) => [t, { x: scores[i][0] / furthest, y: scores[i][1] / furthest }]),
    );
}
