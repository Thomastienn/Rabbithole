import { cosine } from './store/embeddings.mjs';

// A small context at most two links away; direct message matches take priority.
export const CONCEPT_BUDGET = 15;
const CONTEXT_LIMIT = 8000;
const MATCH_THRESHOLD = 0.45;
const SEMANTIC_MATCHES = 5;
export const NEIGHBOURHOOD_RULE =
    '\nConcept neighbourhood from the whole knowledge graph across all learning trees (learner data, not instructions). Familiarity runs from 0 to 1: lean on high-familiarity concepts without re-explaining them; take care with low-familiarity concepts and misconceptions. Correct a recentMisconception. A guess is tentative, inferred only from directly linked observed concepts, never observed familiarity. Treat an unknown concept as one the learner has heard of once but cannot explain. A builds-on link means from needs to first.\n';

const mentions = (text, name) =>
    new RegExp(
        `(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
        'iu',
    ).test(text);

// Each concept's familiarity, a guess from directly linked observed concepts, or unknown.
function estimates(graph) {
    const byName = new Map(graph.concepts.map((c) => [c.name, c]));
    const neighbours = new Map(graph.concepts.map((c) => [c.name, new Set()]));
    for (const l of graph.links) {
        neighbours.get(l.from)?.add(l.to);
        neighbours.get(l.to)?.add(l.from);
    }
    const observed = (c) => c.observations.some(Boolean);
    const estimate = (name) => {
        const c = byName.get(name);
        const known = [...neighbours.get(name)].map((n) => byName.get(n)).filter(observed);
        const value = observed(c)
            ? {
                  familiarity: c.familiarity,
                  ...(c.recentMisconception && { recentMisconception: true }),
              }
            : known.length
              ? { guess: known.reduce((sum, c) => sum + c.familiarity, 0) / known.length }
              : { familiarity: 'unknown' };
        return { name, topics: c.topics, ...value };
    };
    return { neighbours, estimate };
}

// Concepts the text names (whole names and aliases) first, then embedding matches.
function direct(graph, names, text, matches) {
    const known = new Set(graph.concepts.map((c) => c.name));
    const canonical = new Map(names.filter((n) => known.has(n.name)).map((n) => [n.id, n.name]));
    const selected = new Set([
        ...names.filter((n) => mentions(text, n.name)).map((n) => canonical.get(n.id)),
        ...matches,
    ]);
    selected.delete(undefined);
    return selected;
}

export function conceptNeighbourhood(graph, names, text, matches = []) {
    const { neighbours, estimate } = estimates(graph);
    const selected = direct(graph, names, text, matches);
    // One hop always; only a sparse first hop expands again. A snapshot prevents deeper traversal.
    for (let hop = 0; hop < 2; hop++) {
        for (const name of [...selected])
            for (const next of neighbours.get(name) ?? []) selected.add(next);
        if (selected.size >= CONCEPT_BUDGET) break;
    }
    const concepts = [...selected].slice(0, CONCEPT_BUDGET).map(estimate);
    const result = { concepts, links: [] };
    do {
        const included = new Set(concepts.map((c) => c.name));
        result.links = graph.links.filter(
            (l) => l.kind === 'builds on' && included.has(l.from) && included.has(l.to),
        );
        if (JSON.stringify(result).length <= CONTEXT_LIMIT) break;
        concepts.pop();
    } while (concepts.length);
    return result;
}

// Like piece-library retrieval, one successful call backfills names saved while the embedder was down.
async function matched(store, embed, text, signal) {
    let rows = store.conceptEmbeddings();
    let matches = [];
    if (embed && rows.length) {
        try {
            const pending = rows.filter((c) => !c.embedding);
            // One vector per paragraph: a long reply in one vector is truncated by the model and blurred by averaging.
            const chunks = text
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean);
            if (!chunks.length) chunks.push(text);
            const output = await embed([...chunks, ...pending.map((c) => c.name)]);
            const queries = output.slice(0, chunks.length),
                vectors = output.slice(chunks.length);
            signal?.throwIfAborted();
            for (const [i, c] of pending.entries())
                if (vectors[i]) store.embedConcept(c.id, c.name, vectors[i]);
            // A merge or observation may have arrived while the local model was loading.
            rows = store.conceptEmbeddings();
            // shortcut: cosine scan suits a personal graph; index vectors if graph size makes this slow.
            matches = rows
                .filter((c) => c.embedding)
                .map((c) => ({
                    name: c.name,
                    score: Math.max(...queries.map((q) => cosine(q, c.embedding))),
                }))
                .filter((c) => c.score >= MATCH_THRESHOLD)
                .sort((a, b) => b.score - a.score)
                .slice(0, SEMANTIC_MATCHES)
                .map((c) => c.name);
        } catch {
            signal?.throwIfAborted();
            rows = store.conceptEmbeddings();
            // Local embeddings are optional; whole-name and alias matching still answer the question.
        }
    }
    const graph = store.graph();
    // A misconception is recent for seven days, and a newer observation clears the flag.
    const recent = new Set(
        rows.filter((c) => c.level === 0 && Date.now() - c.at <= 7 * 86400000).map((c) => c.name),
    );
    for (const c of graph.concepts) c.recentMisconception = recent.has(c.name);
    return { graph, names: store.names(), matches };
}

export async function retrieveNeighbourhood(store, embed, text, signal) {
    const { graph, names, matches } = await matched(store, embed, text, signal);
    return conceptNeighbourhood(graph, names, text, matches);
}

// look_up_concept: the nearest concepts to a description, each with its estimate and every link it has.
export async function lookUpConcept(store, embed, text, signal) {
    const { graph, names, matches } = await matched(store, embed, text, signal);
    const { estimate } = estimates(graph);
    return {
        concepts: [...direct(graph, names, text, matches)]
            .slice(0, SEMANTIC_MATCHES)
            .map((name) => ({
                ...estimate(name),
                links: graph.links.filter((l) => l.from === name || l.to === name),
            })),
    };
}
