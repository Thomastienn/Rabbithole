import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutConcepts, topicPlaces, POINT_SPACE } from '../../src/knowledge/knowledgeLayout.ts';
import {
    level,
    fill,
    graphShape,
    conceptLines,
    fitKnowledge,
} from '../../src/knowledge/knowledge.ts';
import { topicAnchors } from '../../server/topicAnchors.mjs';

const names = Array.from({ length: 40 }, (_, i) => `Concept ${i}`);
const graph = {
    concepts: names.map((name, i) => ({
        name,
        topics: i % 5 ? [`Topic ${i % 3}`] : ['Topic 0', 'Topic 1'],
    })),
    links: names.slice(1).map((name, i) => ({
        from: name,
        to: names[Math.floor(i / 3)],
        kind: i % 2 ? 'related' : 'builds on',
    })),
};

test('layout is deterministic for the same graph, whatever the input order', () => {
    const first = layoutConcepts(graph);
    assert.deepEqual(layoutConcepts(graph), first);
    assert.deepEqual(
        layoutConcepts({
            concepts: [...graph.concepts]
                .reverse()
                .map((c) => ({ ...c, topics: [...c.topics].reverse() })),
            links: [...graph.links].reverse(),
        }),
        first,
    );
    assert.equal(first.points.length, names.length);
});

test('layout keeps points from overlapping, including unlinked concepts', () => {
    const { points: placed } = layoutConcepts({
        concepts: [...graph.concepts, { name: 'Alone' }, { name: 'Also alone' }],
        links: [...graph.links, { from: 'Alone', to: 'Missing' }],
    });
    for (const a of placed)
        for (const b of placed)
            if (a !== b)
                assert.ok(
                    Math.hypot(a.x - b.x, a.y - b.y) >= POINT_SPACE * 1.8,
                    `${a.name} overlaps ${b.name}`,
                );
});

test('a single concept or an empty graph lays out', () => {
    assert.equal(layoutConcepts({ concepts: [{ name: 'Only' }], links: [] }).points.length, 1);
    assert.deepEqual(layoutConcepts({ concepts: [], links: [] }), { points: [], regions: [] });
});

test('every concept is inside every topic it belongs to, and each topic name sits above its hull', () => {
    const inside = (p, hull) =>
        hull.every((a, i) => {
            const b = hull[(i + 1) % hull.length];
            // polygonHull winds the same way for every hull; a point inside is on one side of every edge.
            return (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0]) <= 1e-9;
        }) ||
        hull.every((a, i) => {
            const b = hull[(i + 1) % hull.length];
            return (b[0] - a[0]) * (p.y - a[1]) - (b[1] - a[1]) * (p.x - a[0]) >= -1e-9;
        });
    for (const concepts of [
        graph.concepts,
        [{ name: 'One topic', topics: ['One topic'] }],
        [{ name: 'Shared', topics: ['A', 'B', 'C', 'D', 'E'] }],
    ]) {
        const { points, regions } = layoutConcepts({ concepts, links: [] });
        assert.deepEqual(
            regions.map((r) => r.name),
            [...new Set(concepts.flatMap((c) => c.topics))].sort(),
        );
        for (const c of concepts)
            for (const topic of c.topics) {
                const p = points.find((p) => p.name === c.name),
                    r = regions.find((r) => r.name === topic);
                assert.ok(inside(p, r.hull), `${c.name} outside ${topic}`);
                assert.ok(Math.min(...r.hull.map(([, y]) => y)) - r.y >= 30 - 1e-9);
            }
    }
});

test('a link across topics leaves both hulls compact and apart', () => {
    const concepts = ['A', 'B'].flatMap((topic) =>
        Array.from({ length: 4 }, (_, i) => ({ name: `${topic}${i}`, topics: [topic] })),
    );
    const anchors = { A: { x: -1, y: 0 }, B: { x: 1, y: 0 } };
    const apart = layoutConcepts({ concepts, links: [], anchors });
    const linked = layoutConcepts({
        concepts,
        links: [{ from: 'A0', to: 'B0' }],
        anchors,
    });
    assert.deepEqual(linked.points, apart.points);
    const [a, b] = linked.regions.map((r) => r.hull.map(([x]) => x));
    assert.ok(Math.max(...a) + 22 < Math.min(...b) - 22, 'hulls overlap');
});

test('topics attract their concepts and a shared concept sits between its topics', () => {
    const concepts = ['A', 'B'].flatMap((topic) =>
        Array.from({ length: 4 }, (_, i) => ({ name: `${topic}${i}`, topics: [topic] })),
    );
    concepts.push({ name: 'Bridge', topics: ['A', 'B'] });
    const { points } = layoutConcepts({ concepts, links: [] });
    const [a, b] = topicPlaces({ concepts });
    for (const c of concepts.filter((c) => c.topics.length === 1)) {
        const p = points.find((p) => p.name === c.name),
            own = c.topics[0] === 'A' ? a : b,
            other = own === a ? b : a;
        assert.ok(
            Math.hypot(p.x - own.x, p.y - own.y) < Math.hypot(p.x - other.x, p.y - other.y),
            `${c.name} attracted to wrong topic`,
        );
    }
    const bridge = points.find((p) => p.name === 'Bridge');
    assert.ok(bridge.x > b.x && bridge.x < a.x, 'shared concept sits between topics');
    assert.ok(
        Math.abs(bridge.x - (a.x + b.x) / 2) < POINT_SPACE,
        'shared attraction uses both topics',
    );
});

test('topic anchors are deterministic, put related topics near each other and skip topics without embeddings', () => {
    const concepts = [
        { topics: ['Mycology'], embedding: [1, 0.1, 0, 0] },
        { topics: ['Mycology', 'Fermentation'], embedding: [0.9, 0.2, 0, 0] },
        { topics: ['Fermentation'], embedding: [0.8, 0.3, 0.1, 0] },
        { topics: ['Ecology'], embedding: [0.5, 0.6, 0.2, 0] },
        { topics: ['Orbital mechanics'], embedding: [0, 0, 0.1, 1] },
        { topics: ['Orbital mechanics'], embedding: [0, 0.1, 0, 0.9] },
        { topics: ['Unembedded'], embedding: null },
        { topics: ['Other model'], embedding: [1, 0] },
    ];
    const anchors = topicAnchors(concepts);
    assert.deepEqual(topicAnchors(concepts), anchors);
    assert.deepEqual(Object.keys(anchors), [
        'Ecology',
        'Fermentation',
        'Mycology',
        'Orbital mechanics',
    ]);
    const gap = (a, b) => Math.hypot(anchors[a].x - anchors[b].x, anchors[a].y - anchors[b].y);
    assert.ok(gap('Mycology', 'Fermentation') < gap('Mycology', 'Ecology'));
    assert.ok(gap('Mycology', 'Ecology') < gap('Mycology', 'Orbital mechanics'));
    assert.equal(Math.max(...Object.values(anchors).map((a) => Math.hypot(a.x, a.y))), 1);
    // One placeable topic, or none, places nothing: the even circle takes over.
    assert.deepEqual(topicAnchors(concepts.slice(0, 1)), {});
    assert.deepEqual(topicAnchors([{ topics: ['A'], embedding: null }]), {});
});

test('layout pins topics to their anchors, falls back to the even circle and orders hues by angle', () => {
    const topics = ['East', 'North', 'South', 'West'];
    const concepts = topics.map((t) => ({ name: `${t} concept`, topics: [t] }));
    const anchors = { East: { x: 1, y: 0 }, North: { x: 0, y: -1 }, South: { x: 0, y: 1 } };
    const radius = POINT_SPACE * 4;
    assert.deepEqual(
        topicPlaces({ concepts, anchors }).map((r) => [r.name, r.x + 0, r.y + 0]),
        [
            ['East', radius, 0],
            ['North', 0, -radius],
            ['South', 0, radius],
            // No anchor: West keeps its slot (the fourth of four) on the even circle.
            ['West', 0, -radius],
        ],
    );
    const moved = layoutConcepts({
        concepts,
        links: [],
        anchors: { ...anchors, West: { x: -1, y: 0 } },
    });
    // Round the wheel from North: East, South, West; neighbouring topics get neighbouring hues.
    assert.deepEqual(Object.fromEntries(moved.regions.map((r) => [r.name, r.hue])), {
        North: 250,
        East: 340,
        South: 70,
        West: 160,
    });
});

test('familiarity labels and ring forms agree at thresholds', () => {
    for (const [score, label, form] of [
        [0, 'New to you', 'none'],
        [0.349, 'New to you', 'none'],
        [0.35, 'Getting there', 'some'],
        [0.799, 'Getting there', 'some'],
        [0.8, 'You know this', 'full'],
        [1, 'You know this', 'full'],
    ]) {
        const c = { familiarity: score };
        assert.equal(level(c), label);
        assert.equal(fill(c), form);
    }
});

test('familiarity changes preserve map shape; topic-only changes and new links invalidate it', () => {
    const g = { concepts: [{ name: 'Mutex', topics: ['Concurrency'], familiarity: 0 }], links: [] };
    assert.equal(
        graphShape(g),
        graphShape({ ...g, concepts: [{ ...g.concepts[0], familiarity: 1 }] }),
    );
    assert.notEqual(
        graphShape(g),
        graphShape({ ...g, concepts: [{ ...g.concepts[0], topics: ['Scheduling'] }] }),
    );
    assert.notEqual(
        graphShape(g),
        graphShape({ ...g, links: [{ from: 'Mutex', to: 'Other', kind: 'related' }] }),
    );
});

test('concept lines skip dangling endpoints, mark selection and point builds-on arrows at the concept that builds on', () => {
    const at = new Map([
        ['A', { x: 0, y: 0 }],
        ['B', { x: 100, y: 0 }],
        ['C', { x: 1, y: 0 }],
    ]);
    const lines = conceptLines(
        [
            { from: 'A', to: 'B', kind: 'related' },
            { from: 'A', to: 'B', kind: 'builds on' },
            { from: 'A', to: 'Missing', kind: 'related' },
            { from: 'B', to: 'C', kind: 'related' },
            { from: 'A', to: 'C', kind: 'builds on' },
            { from: 'A', to: 'A', kind: 'builds on' },
        ],
        at,
        'A',
    );
    // A builds on B: the arrow runs from B to A and stops 11px short of A's centre.
    assert.deepEqual(
        lines.map((l) => [l.x1, l.x2, l.selected]),
        [
            [0, 100, true],
            [100, 11, true],
            [100, 1, false],
            [1, 0.5, true],
            [0, 0, true],
        ],
    );
    assert.equal(lines[0].key, 'A-B-related');
    assert.equal(lines[1].kind, 'builds on');
});

test('Fit includes every point, hull and topic name, centres the bounds and clamps zoom', () => {
    const points = [{ name: 'A', x: 100, y: 80 }];
    const regions = [
        {
            name: 'Topic',
            x: 100,
            y: 40,
            hue: 0,
            hull: [
                [-100, 72],
                [300, 108],
                [100, 300],
            ],
        },
    ];
    for (const [width, height] of [
        [900, 700],
        [390, 300],
    ]) {
        const { x, y, k } = fitKnowledge(points, regions, width, height);
        // Bounds: x from -122 to 322, y from 14 (the name, 16px tall above 30) to 322.
        assert.ok(Math.abs(x + 100 * k - width / 2) < 1e-9);
        assert.ok(Math.abs(y + 168 * k - height / 2) < 1e-9);
        assert.ok(x - 122 * k >= -1e-9 && x + 322 * k <= width + 1e-9);
        assert.ok(y + 14 * k >= -1e-9 && y + 322 * k <= height + 1e-9);
    }
    // Never past 100%, so a small graph shows at its own size.
    assert.equal(fitKnowledge(points, [], 1000, 1000).k, 1);
    assert.equal(fitKnowledge(points, regions, 10, 10).k, 0.2);
});
