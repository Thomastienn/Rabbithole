// The knowledge graph and learner merges; familiarity has no learner correction.
export function knowledgeRoutes(req, res, url, { store, json }, body) {
    if (req.method === 'GET' && url.pathname === '/api/graph') return json(res, 200, store.graph());
    if (req.method === 'GET' && url.pathname === '/api/graph/stats')
        return json(res, 200, store.graphStats());
    if (req.method === 'POST' && url.pathname === '/api/graph/merge') {
        const names = [body?.from, body?.into];
        if (names.some((n) => typeof n !== 'string' || !n.trim()))
            return json(res, 400, { error: 'Choose two different concepts to merge.' });
        const [name, into] = names.map((n) => n.trim());
        if (!store.concept(name) || !store.concept(into))
            return json(res, 404, { error: 'Concept not found. Refresh Knowledge and try again.' });
        if (!store.mergeConcepts(name, into))
            return json(res, 400, { error: 'Choose two different concepts to merge.' });
        return json(res, 200, store.graph());
    }
    return false;
}
