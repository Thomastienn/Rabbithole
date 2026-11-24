// The knowledge graph; merges happen automatically after replies (ADR 0022), and familiarity has no learner correction.
export function knowledgeRoutes(req, res, url, { store, json }) {
    if (req.method === 'GET' && url.pathname === '/api/graph')
        return json(res, 200, { ...store.graph(), anchors: store.topicAnchors() });
    return false;
}
