// The knowledge graph; merges happen automatically after replies (ADR 0022), and familiarity has no learner correction.
export function knowledgeRoutes(req, res, url, { store, json }) {
    if (req.method === 'GET' && url.pathname === '/api/graph')
        return json(res, 200, { ...store.graph(), anchors: store.topicAnchors() });
    if (req.method === 'GET' && url.pathname === '/api/graph/stats')
        return json(res, 200, store.graphStats());
    if (req.method === 'GET' && url.pathname === '/api/graph/concept') {
        const sources = store.conceptSources(url.searchParams.get('name') ?? '');
        return sources ? json(res, 200, sources) : json(res, 404, { error: 'Concept not found.' });
    }
    return false;
}
