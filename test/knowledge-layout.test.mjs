import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutConcepts, POINT_SPACE } from '../src/knowledge/knowledgeLayout.ts';

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
