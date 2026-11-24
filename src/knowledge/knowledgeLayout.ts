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
// hull: the outline around a topic's concepts and its label; hue: its place round the colour wheel.
export type TopicRegion = Placed & { radius: number; hue: number; hull: [number, number][] };
type Node = SimulationNodeDatum & { name: string; tx?: number; ty?: number; topic?: boolean };

// Sorted input and a fixed tick count make d3-force (seeded jiggle, phyllotaxis start) repeatable for the same graph.
export function layoutConcepts(graph: {
    concepts: { name: string; topics?: string[] }[];
    links: { from: string; to: string }[];
    // Unit-scale topic anchors from the server's PCA; a topic without one keeps its even-circle slot.
    anchors?: Record<string, { x: number; y: number }>;
}): { points: Placed[]; regions: TopicRegion[] } {
    const topics = [...new Set(graph.concepts.flatMap((c) => c.topics ?? []))].sort((a, b) =>
        a.localeCompare(b),
    );
    const radius = topics.length > 1 ? Math.max(POINT_SPACE * 4, topics.length * POINT_SPACE) : 0;
    const anchors: Node[] = topics.map((name, i) => {
        const angle = (i * 2 * Math.PI) / topics.length;
        const at = graph.anchors?.[name] ?? { x: Math.cos(angle), y: Math.sin(angle) };
        const x = Math.round(radius * at.x),
            y = Math.round(radius * at.y);
        return { name, x, y, fx: x, fy: y, topic: true };
    });
    const topicAt = new Map(anchors.map((a) => [a.name, a]));
    const nodes: Node[] = graph.concepts
        .map((c) => ({ name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const byName = new Map(nodes.map((n) => [n.name, n]));
    for (const c of graph.concepts) {
        const memberOf = [...new Set(c.topics ?? [])]
            .sort((a, b) => a.localeCompare(b))
            .map((t) => topicAt.get(t)!);
        if (!memberOf.length) continue;
        const n = byName.get(c.name)!;
        n.tx = memberOf.reduce((sum, a) => sum + a.x!, 0) / memberOf.length;
        n.ty = memberOf.reduce((sum, a) => sum + a.y!, 0) / memberOf.length;
    }
    const links = graph.links
        .filter((l) => byName.has(l.from) && byName.has(l.to) && l.from !== l.to)
        .sort((a, b) => `${a.from}\0${a.to}`.localeCompare(`${b.from}\0${b.to}`))
        .map((l) => ({ source: byName.get(l.from)!, target: byName.get(l.to)! }));
    const simulation = forceSimulation([...nodes, ...anchors])
        .force(
            'link',
            forceLink<Node, { source: Node; target: Node }>(links)
                .distance(POINT_SPACE * 3)
                .strength(0.15),
        )
        .force(
            'charge',
            forceManyBody<Node>().strength((n) => (n.topic ? 0 : -260)),
        )
        .force(
            'x',
            forceX<Node>((n) => n.tx ?? 0).strength((n) => (n.tx === undefined ? 0.06 : 0.16)),
        )
        .force(
            'y',
            forceY<Node>((n) => n.ty ?? 0).strength((n) => (n.ty === undefined ? 0.06 : 0.16)),
        )
        // Fixed topic anchors reserve space for the centre labels, without becoming concept links.
        .force(
            'collide',
            forceCollide<Node>((n) => (n.topic ? POINT_SPACE * 2.5 : POINT_SPACE)).iterations(3),
        )
        .stop();
    simulation.tick(300);
    // Settle any remaining overlap with collision alone.
    simulation.force('link', null).force('charge', null).force('x', null).force('y', null).tick(60);
    const points = nodes.map((n) => ({ name: n.name, x: Math.round(n.x!), y: Math.round(n.y!) }));
    const at = new Map(points.map((p) => [p.name, p]));
    // Hues follow anchor angle round the anchors' centre, so neighbouring topics get neighbouring hues.
    const cx = anchors.reduce((s, a) => s + a.x!, 0) / (anchors.length || 1),
        cy = anchors.reduce((s, a) => s + a.y!, 0) / (anchors.length || 1);
    const hues = new Map(
        anchors
            .map((a) => [a.name, Math.atan2(a.y! - cy, a.x! - cx)] as const)
            .sort((a, b) => a[1] - b[1])
            .map(([name], i) => [name, Math.round((250 + (i * 360) / anchors.length) % 360)]),
    );
    const regions = anchors.map((a) => {
        const members = graph.concepts
            .filter((c) => c.topics?.includes(a.name))
            .map((c) => at.get(c.name)!);
        const corners: [number, number][] = [
            [a.x!, a.y!],
            ...members.map((p) => [p.x, p.y] as [number, number]),
        ];
        return {
            name: a.name,
            x: a.x!,
            y: a.y!,
            hue: hues.get(a.name)!,
            hull: polygonHull(corners) ?? corners,
            radius:
                Math.max(...members.map((p) => Math.hypot(p.x - a.x!, p.y - a.y!))) + POINT_SPACE,
        };
    });
    return { points, regions };
}
