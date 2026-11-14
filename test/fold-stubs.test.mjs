import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldHierarchy } from '../src/map/canvas.ts';

// root ─ a ─ a1 ─ a1x
//      │    └ a2
//      └ b
const trees = [
  ['root', null],
  ['a', 'root'],
  ['b', 'root'],
  ['a1', 'a'],
  ['a2', 'a'],
  ['a1x', 'a1'],
].map(([id, parent]) => ({ id, parent, title: id.toUpperCase() }));
const view = (folded) =>
  Object.fromEntries(
    foldHierarchy('root', trees, new Set(folded)).map((n) => [
      n.conversation.id,
      { hidden: n.hidden, stubs: n.stubs.map((s) => [s.child.id, s.beneath]) },
    ]),
  );

test('a folded node keeps one stub per hidden direct child with the count beneath it', () => {
  const v = view(['root']);
  assert.deepEqual(v.root, {
    hidden: false,
    stubs: [
      ['b', 0],
      ['a', 3],
    ],
  });
  for (const id of ['a', 'b', 'a1', 'a2', 'a1x']) assert.equal(v[id].hidden, true, id);
  assert.deepEqual(view([]).root.stubs, [], 'unfolded nodes have no stubs');
});

test('nested folds: only the outermost visible fold shows stubs, counts ignore inner folds', () => {
  const v = view(['root', 'a1']);
  assert.deepEqual(v.root.stubs, [
    ['b', 0],
    ['a', 3],
  ]);
  assert.deepEqual(v.a1.stubs, [], 'a fold inside a hidden branch shows no stubs');
  const inner = view(['a', 'a1']);
  assert.deepEqual(inner.a, {
    hidden: false,
    stubs: [
      ['a2', 0],
      ['a1', 1],
    ],
  });
  assert.deepEqual(inner.a1.stubs, []);
  assert.equal(inner.b.hidden, false);
  const deep = view(['a1']);
  assert.deepEqual(deep.a1, { hidden: false, stubs: [['a1x', 0]] });
  assert.equal(deep.a1x.hidden, true);
});
