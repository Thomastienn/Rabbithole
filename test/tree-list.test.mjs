import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeGroups } from '../src/treeList.ts';

test('learning trees group by local creation day, newest first, including midnight and week boundaries', () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = 'America/Edmonton';
  try {
    const now = new Date('2026-11-10T00:01:00-07:00');
    const root = (id, created) => ({ id, parent: null, created: +new Date(created) });
    const trees = [
      root('older', '2026-11-02T23:59:59-07:00'),
      root('week', '2026-11-03T00:00:00-07:00'),
      root('yesterday', '2026-11-09T23:59:59-07:00'),
      root('today', '2026-11-10T00:00:00-07:00'),
      root('two-days', '2026-11-08T23:59:59-07:00'),
    ];
    assert.deepEqual(treeGroups(trees, now).map(g => [g.label, g.trees.map(t => t.tree.id)]), [
      ['Today', ['today']], ['Yesterday', ['yesterday']], ['Previous 7 days', ['two-days', 'week']], ['Older', ['older']],
    ]);
    assert.deepEqual(trees.map(t => t.id), ['older', 'week', 'yesterday', 'today', 'two-days'], 'input order is unchanged');
    assert.deepEqual(treeGroups([], now), [], 'empty headings are omitted');
    assert.equal(treeGroups([trees[3]], new Date('2026-11-11T00:00:00-07:00'))[0].label, 'Yesterday');
    assert.equal(treeGroups([root('year', '2025-12-31T23:59:59-07:00')], new Date('2026-01-01T00:00:00-07:00'))[0].label, 'Yesterday');
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});

test('calendar days stay correct through both daylight-saving changes', () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = 'America/Edmonton';
  try {
    for (const [created, now] of [
      ['2026-03-07T23:59:59-07:00', '2026-03-08T23:59:59-06:00'],
      ['2026-03-01T23:59:59-07:00', '2026-03-09T00:00:00-06:00'],
      ['2026-10-31T00:00:00-06:00', '2026-11-01T23:59:59-07:00'],
      ['2026-10-25T00:00:00-06:00', '2026-11-01T23:59:59-07:00'],
    ]) {
      const age = treeGroups([{ id: 'root', parent: null, created: +new Date(created) }], new Date(now))[0].label;
      assert.equal(age, created.startsWith('2026-03-01') ? 'Older' : created.startsWith('2026-10-25') ? 'Previous 7 days' : 'Yesterday');
    }
  } finally { if (previousTZ === undefined) delete process.env.TZ; else process.env.TZ = previousTZ; }
});

test('branch counts include every descendant, exclude roots and stay separate across learning trees', () => {
  const trees = [
    { id: 'grandchild', parent: 'child', created: 9 },
    { id: 'first', parent: null, created: 2 },
    { id: 'second', parent: null, created: 1 },
    { id: 'child', parent: 'first', created: 3 },
    { id: 'sibling', parent: 'first', created: 4 },
    { id: 'second-child', parent: 'second', created: 5 },
    { id: 'empty', parent: null, created: 0 },
  ];
  assert.deepEqual(treeGroups(trees, new Date(0))[0].trees.map(({ tree, branches }) => [tree.id, branches]), [['first', 3], ['second', 1], ['empty', 0]]);
  const chain = Array.from({ length: 10_000 }, (_, i) => ({ id: String(i), parent: i ? String(i - 1) : null, created: i }));
  assert.equal(treeGroups(chain, new Date(0))[0].trees[0].branches, 9_999, 'deep trees need no recursive stack');
});
