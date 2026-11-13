import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutConcepts, POINT_SPACE } from '../src/knowledgeLayout.ts';

const names = Array.from({ length: 40 }, (_, i) => `Concept ${i}`);
const graph = {
  concepts: names.map(name => ({ name })),
  links: names.slice(1).map((name, i) => ({ from: name, to: names[Math.floor(i / 3)], kind: i % 2 ? 'related' : 'builds on' })),
};

test('layout is deterministic for the same graph, whatever the input order', () => {
  const first = layoutConcepts(graph);
  assert.deepEqual(layoutConcepts(graph), first);
  assert.deepEqual(layoutConcepts({ concepts: [...graph.concepts].reverse(), links: [...graph.links].reverse() }), first);
  assert.equal(first.length, names.length);
});

test('layout keeps points from overlapping, including unlinked concepts', () => {
  const placed = layoutConcepts({ concepts: [...graph.concepts, { name: 'Alone' }, { name: 'Also alone' }], links: [...graph.links, { from: 'Alone', to: 'Missing' }] });
  for (const a of placed) for (const b of placed) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= POINT_SPACE * 1.8, `${a.name} overlaps ${b.name}`);
});

test('a single concept or an empty graph lays out', () => {
  assert.equal(layoutConcepts({ concepts: [{ name: 'Only' }], links: [] }).length, 1);
  assert.deepEqual(layoutConcepts({ concepts: [], links: [] }), []);
});
