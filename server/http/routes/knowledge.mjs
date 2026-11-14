// The knowledge graph and learner corrections and merges.
export function knowledgeRoutes(req, res, url, { store, json }, body) {
  if (req.method === 'GET' && url.pathname === '/api/graph') return json(res, 200, store.graph());
  if (
    req.method === 'POST' &&
    (url.pathname === '/api/graph/correct' || url.pathname === '/api/graph/merge')
  ) {
    const merging = url.pathname.endsWith('/merge');
    const names = merging ? [body?.from, body?.into] : [body?.name];
    if (
      names.some((n) => typeof n !== 'string' || !n.trim()) ||
      (!merging && !['known', 'unknown'].includes(body?.kind))
    )
      return json(res, 400, {
        error: merging
          ? 'Choose two different concepts to merge.'
          : 'Choose a concept and a familiarity correction.',
      });
    const [name, into] = names.map((n) => n.trim());
    if (!store.concept(name) || (merging && !store.concept(into)))
      return json(res, 404, { error: 'Concept not found. Refresh Knowledge and try again.' });
    if (merging && !store.mergeConcepts(name, into))
      return json(res, 400, { error: 'Choose two different concepts to merge.' });
    if (!merging) store.correct(name, body.kind);
    return json(res, 200, store.graph());
  }
  return false;
}
