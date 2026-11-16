import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutConcepts, POINT_SPACE } from '../../src/knowledge/knowledgeLayout.ts';
import {
  familiarity,
  level,
  fill,
  graphShape,
  conceptLines,
  fitKnowledge,
} from '../../src/knowledge/knowledge.ts';

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

test('every concept is inside every topic it belongs to, with room around its point', () => {
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
        assert.ok(
          Math.hypot(p.x - r.x, p.y - r.y) <= r.radius - POINT_SPACE + 1e-9,
          `${c.name} outside ${topic}`,
        );
        assert.ok(
          Math.hypot(p.x - r.x, p.y - r.y) > POINT_SPACE * 3,
          `${c.name} covers ${topic}'s centre label`,
        );
      }
  }
});

test('topics attract their concepts and a shared concept sits between its topics', () => {
  const concepts = ['A', 'B'].flatMap((topic) =>
    Array.from({ length: 4 }, (_, i) => ({ name: `${topic}${i}`, topics: [topic] })),
  );
  concepts.push({ name: 'Bridge', topics: ['A', 'B'] });
  const {
    points,
    regions: [a, b],
  } = layoutConcepts({ concepts, links: [] });
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

test('familiarity labels and ring forms agree at thresholds', () => {
  for (const [score, label, form] of [
    [0, 'Unfamiliar', 'none'],
    [0.349, 'Unfamiliar', 'none'],
    [0.35, 'Some familiarity', 'some'],
    [0.799, 'Some familiarity', 'some'],
    [0.8, 'Familiar', 'full'],
    [1, 'Familiar', 'full'],
  ]) {
    const c = { familiarity: score };
    assert.equal(level(c), label);
    assert.equal(fill(c), form);
    assert.equal(familiarity(c), `Estimated familiarity: ${label.toLowerCase()}`);
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

test('concept lines skip dangling endpoints, mark selection and shorten only builds-on arrows', () => {
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
  assert.deepEqual(
    lines.map((l) => [l.x2, l.selected]),
    [
      [100, true],
      [89, true],
      [1, false],
      [0.5, true],
      [0, true],
    ],
  );
  assert.equal(lines[0].key, 'A-B-related');
  assert.equal(lines[1].kind, 'builds on');
});

test('Fit includes whole topic regions, centers bounds and clamps zoom for wide/narrow maps', () => {
  const points = [{ name: 'A', x: 100, y: 80 }];
  const regions = [{ name: 'Topic', x: 100, y: 80, radius: 200 }];
  for (const [width, height] of [
    [900, 700],
    [390, 300],
  ]) {
    const { x, y, k } = fitKnowledge(points, regions, width, height);
    assert.equal(x + 100 * k, width / 2);
    assert.equal(y + 80 * k, height / 2);
    assert.ok(x + (100 - 208) * k >= 0);
    assert.ok(x + (100 + 208) * k <= width);
    assert.ok(y + (80 - 208) * k >= 0);
    assert.ok(y + (80 + 208) * k <= height);
  }
  assert.equal(fitKnowledge(points, [], 1000, 1000).k, 1.25);
  assert.equal(fitKnowledge(points, regions, 10, 10).k, 0.2);
});
