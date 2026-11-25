import { POINT_SPACE, type Placed, type TopicRegion } from './knowledgeLayout.ts';

export type Concept = {
    name: string;
    topics: string[];
    familiarity: number;
    met: number;
    // Observation counts by level, 0 (misconception) to 5 (teaches it).
    observations: number[];
};
export type Graph = {
    topics: string[];
    concepts: Concept[];
    links: { from: string; to: string; kind: 'related' | 'builds on' }[];
    anchors?: Record<string, { x: number; y: number }>;
};
// Said in the graph's own words, never as a score.
export const level = (c: Pick<Concept, 'familiarity'>) =>
    c.familiarity >= 0.8 ? 'You know this' : c.familiarity >= 0.35 ? 'Getting there' : 'New to you';
// Familiarity is drawn by form (empty, half, full ring), never hue alone.
export const fill = (c: Pick<Concept, 'familiarity'>) =>
    c.familiarity >= 0.8 ? 'full' : c.familiarity >= 0.35 ? 'some' : 'none';
export const MIN_SCALE = 0.2;
export const LABEL_SCALE = 0.75;
export const graphShape = (graph: Graph) =>
    JSON.stringify([graph.concepts.map((c) => [c.name, c.topics]), graph.links, graph.anchors]);

// A builds-on arrow points at the concept that builds on the other: from the link's `to` to its `from`.
export function conceptLines(links: Graph['links'], at: Map<string, Placed>, selected?: string) {
    return links.flatMap((l) => {
        const builds = l.kind === 'builds on',
            a = at.get(builds ? l.to : l.from),
            b = at.get(builds ? l.from : l.to);
        if (!a || !b) return [];
        // The arrow stops just outside the target ring so its head shows.
        const dx = b.x - a.x,
            dy = b.y - a.y,
            s = builds ? Math.min(0.5, 11 / (Math.hypot(dx, dy) || 1)) : 0;
        return [
            {
                x1: a.x,
                y1: a.y,
                x2: b.x - dx * s,
                y2: b.y - dy * s,
                key: `${l.from}-${l.to}-${l.kind}`,
                kind: l.kind,
                selected: l.from === selected || l.to === selected,
            },
        ];
    });
}

// Bounds: every ring and name, each hull's padding (its 22px half stroke) and each topic name above its hull.
export function fitKnowledge(
    places: Placed[],
    regions: TopicRegion[],
    width: number,
    height: number,
) {
    const pad = POINT_SPACE * 1.5,
        xs = [
            ...places.flatMap((p) => [p.x - pad, p.x + pad]),
            ...regions.flatMap((r) => r.hull.flatMap(([x]) => [x - 22, x + 22])),
        ],
        ys = [
            ...places.flatMap((p) => [p.y - pad, p.y + pad]),
            ...regions.flatMap((r) => [r.y - 16, ...r.hull.map(([, y]) => y + 22)]),
        ];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.max(MIN_SCALE, Math.min(1, width / (x1 - x0), height / (y1 - y0)));
    return { x: width / 2 - (k * (x0 + x1)) / 2, y: height / 2 - (k * (y0 + y1)) / 2, k };
}
