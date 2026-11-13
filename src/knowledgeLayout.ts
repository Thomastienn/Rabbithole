import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3';

// Room around each point for its ring and label; collision keeps centres at least twice this apart.
export const POINT_SPACE = 44;
export type Placed = { name: string; x: number; y: number };
type Node = SimulationNodeDatum & { name: string };

// Sorted input and a fixed tick count make d3-force (seeded jiggle, phyllotaxis start) repeatable for the same graph.
export function layoutConcepts(graph: { concepts: { name: string }[]; links: { from: string; to: string }[] }): Placed[] {
  const nodes: Node[] = graph.concepts.map(c => ({ name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
  const known = new Set(nodes.map(n => n.name));
  const links = graph.links.filter(l => known.has(l.from) && known.has(l.to) && l.from !== l.to).map(l => ({ source: l.from, target: l.to }))
    .sort((a, b) => `${a.source}\0${a.target}`.localeCompare(`${b.source}\0${b.target}`));
  const simulation = forceSimulation(nodes)
    .force('link', forceLink<Node, { source: string; target: string }>(links).id(n => n.name).distance(POINT_SPACE * 3))
    .force('charge', forceManyBody().strength(-260))
    .force('x', forceX(0).strength(0.06)).force('y', forceY(0).strength(0.06))
    .force('collide', forceCollide(POINT_SPACE).iterations(3))
    .stop();
  simulation.tick(300);
  // Settle any remaining overlap with collision alone.
  simulation.force('link', null).force('charge', null).force('x', null).force('y', null).tick(60);
  return nodes.map(n => ({ name: n.name, x: Math.round(n.x!), y: Math.round(n.y!) }));
}
