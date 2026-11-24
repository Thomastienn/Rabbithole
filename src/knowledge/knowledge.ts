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
export const LEVELS = [
    'Misconception',
    'Heard of it',
    'Partial',
    'Explains it',
    'Applies it',
    'Teaches it',
];
export const level = (c: Concept) =>
    c.familiarity >= 0.8 ? 'Familiar' : c.familiarity >= 0.35 ? 'Some familiarity' : 'Unfamiliar';
// Familiarity is drawn by form (empty, half, full ring), never hue alone.
export const fill = (c: Concept) =>
    c.familiarity >= 0.8 ? 'full' : c.familiarity >= 0.35 ? 'some' : 'none';
export const MIN_SCALE = 0.2;
export const LABEL_SCALE = 0.75;
export const graphShape = (graph: Graph) =>
    JSON.stringify([graph.concepts.map((c) => [c.name, c.topics]), graph.links, graph.anchors]);

export function conceptLines(links: Graph['links'], at: Map<string, Placed>, selected?: string) {
    return links.flatMap((l) => {
        const a = at.get(l.from),
            b = at.get(l.to);
        if (!a || !b) return [];
        // A builds-on arrow stops just outside the target ring so its head shows.
        const dx = b.x - a.x,
            dy = b.y - a.y,
            s = l.kind === 'builds on' ? Math.min(0.5, 11 / (Math.hypot(dx, dy) || 1)) : 0;
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

export function fitKnowledge(
    places: Placed[],
    regions: TopicRegion[],
    width: number,
    height: number,
) {
    const pad = POINT_SPACE * 1.5,
        xs = places.map((p) => p.x),
        ys = places.map((p) => p.y);
    const [x0, x1, y0, y1] = [
        Math.min(...xs.map((x) => x - pad), ...regions.map((r) => r.x - r.radius - 8)),
        Math.max(...xs.map((x) => x + pad), ...regions.map((r) => r.x + r.radius + 8)),
        Math.min(...ys.map((y) => y - pad), ...regions.map((r) => r.y - r.radius - 8)),
        Math.max(...ys.map((y) => y + pad), ...regions.map((r) => r.y + r.radius + 8)),
    ];
    const k = Math.max(MIN_SCALE, Math.min(1.25, width / (x1 - x0), height / (y1 - y0)));
    return { x: width / 2 - (k * (x0 + x1)) / 2, y: height / 2 - (k * (y0 + y1)) / 2, k };
}
