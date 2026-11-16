// shortcut: keyword/alias matching until shared embedding retrieval ships; keep nearest concepts first.
export function discussionNeighbourhood(graph, names, text) {
  const seeds = names
    .filter((c) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}])${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
        'iu',
      ).test(text),
    )
    .map(
      (c) =>
        graph.concepts.find((g) => g.name.toLowerCase() === c.name.toLowerCase())?.name ??
        graph.concepts.find((g) => names.some((n) => n.id === c.id && n.name === g.name))?.name,
    )
    .filter(Boolean);
  const selected = new Set(seeds);
  for (let hop = 0; hop < 2 && selected.size < 15; hop++) {
    const before = new Set(selected);
    for (const link of graph.links) {
      if (before.has(link.from)) selected.add(link.to);
      if (before.has(link.to)) selected.add(link.from);
    }
  }
  const concepts = [];
  for (const name of selected) {
    const c = graph.concepts.find((c) => c.name === name);
    if (!c) continue;
    const observed = (c) => c.observations.some(Boolean);
    const neighbours = graph.links.flatMap((l) =>
      l.from === name ? [l.to] : l.to === name ? [l.from] : [],
    );
    const known = graph.concepts.filter((c) => neighbours.includes(c.name) && observed(c));
    const value = observed(c)
      ? { familiarity: c.familiarity }
      : known.length
        ? { guess: known.reduce((sum, c) => sum + c.familiarity, 0) / known.length }
        : { familiarity: 'unknown' };
    const next = { name, topics: c.topics, ...value };
    if (concepts.length >= 24 || JSON.stringify([...concepts, next]).length > 8000) break;
    concepts.push(next);
  }
  const included = new Set(concepts.map((c) => c.name));
  return {
    concepts,
    links: graph.links
      .filter((l) => l.kind === 'builds on' && included.has(l.from) && included.has(l.to))
      .slice(0, 48),
  };
}

export function discussionText(artifact) {
  const data = JSON.parse(artifact.source);
  const content = data.closed
    ? (data.summary ?? 'Closed discussion; context preparation is pending.')
    : JSON.stringify({
        classmates: data.classmates.map((c) => c.name),
        lines: data.lines.map(({ speaker, text }) => ({ speaker, text })),
      });
  return `\n[Discussion: ${content}]\n`;
}
