import {
    forceCollide,
    forceLink,
    forceManyBody,
    forceSimulation,
    forceX,
    forceY,
    polygonHull,
    type SimulationNodeDatum,
} from 'd3';

// Room around each point for its ring and label; collision keeps centres at least twice this apart.
export const POINT_SPACE = 44;
export type Placed = { name: string; x: number; y: number };
// hull: the outline around a topic's concepts and their names; x, y: the bottom centre of its name, above the hull;
// hue: its place round the colour wheel.
export type TopicRegion = Placed & { hue: number; hull: [number, number][] };
type Node = SimulationNodeDatum & { name: string; tx?: number; ty?: number; topics: string[] };

// Corners a concept adds to its topic's hull: just above its ring, and either end of its name below.
const corners = (p: Placed): [number, number][] => {
    const w = p.name.length * 3.4;
    return [
        [p.x, p.y - 8],
        [p.x - w, p.y + 28],
        [p.x + w, p.y + 28],
    ];
};

type Layoutable = {
    concepts: { name: string; topics?: string[] }[];
    links: { from: string; to: string }[];
    // Unit-scale topic anchors from the server's PCA; a topic without one keeps its even-circle slot.
    anchors?: Record<string, { x: number; y: number }>;
};

// Each topic's anchor and hue. Hues follow anchor angle round the anchors' centre, so neighbouring topics get neighbouring hues.
export function topicPlaces(graph: Pick<Layoutable, 'concepts' | 'anchors'>) {
    const topics = [...new Set(graph.concepts.flatMap((c) => c.topics ?? []))].sort((a, b) =>
        a.localeCompare(b),
    );
    const radius = topics.length > 1 ? Math.max(POINT_SPACE * 4, topics.length * POINT_SPACE) : 0;
    const anchors = topics.map((name, i) => {
        const angle = (i * 2 * Math.PI) / topics.length;
        const at = graph.anchors?.[name] ?? { x: Math.cos(angle), y: Math.sin(angle) };
        return { name, x: Math.round(radius * at.x), y: Math.round(radius * at.y) };
    });
    const cx = anchors.reduce((s, a) => s + a.x, 0) / (anchors.length || 1),
        cy = anchors.reduce((s, a) => s + a.y, 0) / (anchors.length || 1);
    const hues = new Map(
        anchors
            .map((a) => [a.name, Math.atan2(a.y - cy, a.x - cx)] as const)
            .sort((a, b) => a[1] - b[1])
            .map(([name], i) => [name, Math.round((250 + (i * 360) / anchors.length) % 360)]),
    );
    return anchors.map((a) => ({ ...a, hue: hues.get(a.name)! }));
}

// Sorted input and a fixed tick count make d3-force (seeded jiggle, phyllotaxis start) repeatable for the same graph.
export function layoutConcepts(graph: Layoutable): { points: Placed[]; regions: TopicRegion[] } {
    // Anchors only pull their concepts; they take no room, since topic names sit above the hulls.
    const anchors = topicPlaces(graph);
    const topicAt = new Map(anchors.map((a) => [a.name, a]));
    const nodes: Node[] = graph.concepts
        .map((c) => ({
            name: c.name,
            topics: [...new Set(c.topics ?? [])].sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const byName = new Map(nodes.map((n) => [n.name, n]));
    for (const n of nodes) {
        const memberOf = n.topics.map((t) => topicAt.get(t)!);
        if (!memberOf.length) continue;
        n.tx = memberOf.reduce((sum, a) => sum + a.x, 0) / memberOf.length;
        n.ty = memberOf.reduce((sum, a) => sum + a.y, 0) / memberOf.length;
    }
    // Only links inside a topic pull; a link across topics would drag concepts out of their hulls.
    const links = graph.links
        .filter((l) => byName.has(l.from) && byName.has(l.to) && l.from !== l.to)
        .filter((l) => byName.get(l.from)!.topics.some((t) => byName.get(l.to)!.topics.includes(t)))
        .sort((a, b) => `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`))
        .map((l) => ({ source: byName.get(l.from)!, target: byName.get(l.to)! }));
    const simulation = forceSimulation(nodes)
        .force(
            'link',
            forceLink<Node, { source: Node; target: Node }>(links)
                .distance(POINT_SPACE * 2.5)
                .strength(0.1),
        )
        .force('charge', forceManyBody<Node>().strength(-120))
        .force(
            'x',
            forceX<Node>((n) => n.tx ?? 0).strength((n) => (n.tx === undefined ? 0.06 : 0.2)),
        )
        .force(
            'y',
            forceY<Node>((n) => n.ty ?? 0).strength((n) => (n.ty === undefined ? 0.06 : 0.2)),
        )
        .force('collide', forceCollide<Node>(POINT_SPACE).iterations(3))
        .stop();
    simulation.tick(300);
    // Settle any remaining overlap with collision alone.
    simulation.force('link', null).force('charge', null).force('x', null).force('y', null).tick(60);
    const points = nodes.map((n) => ({ name: n.name, x: Math.round(n.x!), y: Math.round(n.y!) }));
    const at = new Map(points.map((p) => [p.name, p]));
    const regions = anchors.map((a) => {
        const members = nodes.filter((n) => n.topics.includes(a.name)).map((n) => at.get(n.name)!);
        const outline = members.flatMap(corners);
        const xs = outline.map((p) => p[0]);
        return {
            name: a.name,
            // The hull's wide stroke pads it 22px past these corners; the name sits 8px above that.
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: Math.min(...outline.map((p) => p[1])) - 30,
            hue: a.hue,
            hull: polygonHull(outline) ?? outline,
        };
    });
    return { points, regions };
}
