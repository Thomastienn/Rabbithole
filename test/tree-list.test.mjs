import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeGroups } from '../src/map/treeList.ts';

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
    assert.deepEqual(
      treeGroups(trees, now).map((g) => [g.label, g.trees.map((t) => t.tree.id)]),
      [
        ['Today', ['today']],
        ['Yesterday', ['yesterday']],
        ['Previous 7 days', ['two-days', 'week']],
        ['Older', ['older']],
      ],
    );
    assert.deepEqual(
      trees.map((t) => t.id),
      ['older', 'week', 'yesterday', 'today', 'two-days'],
      'input order is unchanged',
    );
    assert.deepEqual(treeGroups([], now), [], 'empty headings are omitted');
    assert.equal(
      treeGroups([trees[3]], new Date('2026-11-11T00:00:00-07:00'))[0].label,
      'Yesterday',
    );
    assert.equal(
      treeGroups(
        [root('year', '2025-12-31T23:59:59-07:00')],
        new Date('2026-01-01T00:00:00-07:00'),
      )[0].label,
      'Yesterday',
    );
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
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
      const age = treeGroups(
        [{ id: 'root', parent: null, created: +new Date(created) }],
        new Date(now),
      )[0].label;
      assert.equal(
        age,
        created.startsWith('2026-03-01')
          ? 'Older'
          : created.startsWith('2026-10-25')
            ? 'Previous 7 days'
            : 'Yesterday',
      );
    }
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
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
  assert.deepEqual(
    treeGroups(trees, new Date(0))[0].trees.map(({ tree, branches }) => [tree.id, branches]),
    [
      ['first', 3],
      ['second', 1],
      ['empty', 0],
    ],
  );
  const chain = Array.from({ length: 10_000 }, (_, i) => ({
    id: String(i),
    parent: i ? String(i - 1) : null,
    created: i,
  }));
  assert.equal(
    treeGroups(chain, new Date(0))[0].trees[0].branches,
    9_999,
    'deep trees need no recursive stack',
  );
});

test('conversation addresses number siblings by creation and each first-level family keeps one repeating series ink', async () => {
  const { conversationAddresses } = await import('../src/map/treeList.ts');
  const t = (id, parent, created) => ({ id, parent, created });
  const trees = [
    t('b5', 'root', 50),
    t('root', null, 0),
    t('b2', 'root', 20),
    t('b1', 'root', 10),
    t('b3', 'root', 30),
    t('b4', 'root', 40),
    t('b1b', 'b1', 70),
    t('b1a', 'b1', 60),
    t('b1a1', 'b1a', 80),
    t('b5a', 'b5', 90),
  ];
  const view = (map) =>
    Object.fromEntries([...map].map(([id, v]) => [id, `${v.address}:${v.ink}`]));
  const before = view(conversationAddresses(trees));
  assert.deepEqual(before, {
    root: '1:0',
    b1: '1.1:1',
    b2: '1.2:2',
    b3: '1.3:3',
    b4: '1.4:4',
    b5: '1.5:1',
    b1a: '1.1.1:1',
    b1b: '1.1.2:1',
    b1a1: '1.1.1.1:1',
    b5a: '1.5.1:1',
  });
  // A sibling added later takes the next number; nobody before it moves.
  const after = view(conversationAddresses([...trees, t('b6', 'root', 100), t('b1c', 'b1', 100)]));
  assert.deepEqual(
    { ...after, b6: undefined, b1c: undefined },
    { ...before, b6: undefined, b1c: undefined },
  );
  assert.equal(after.b6, '1.6:2');
  assert.equal(after.b1c, '1.1.3:1');
});

test('library spine has one tick per conversation in its family ink, matching conversation addresses', async () => {
  const { conversationAddresses } = await import('../src/map/treeList.ts');
  const trees = [
    { id: 'root', parent: null, created: 0 },
    ...['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, parent: 'root', created: 10 - i })),
    { id: 'a1', parent: 'a', created: 20 },
    { id: 'a2', parent: 'a1', created: 21 },
  ];
  const [{ spine, branches }] = treeGroups(trees, new Date(0))[0].trees;
  assert.equal(spine.length, trees.length);
  assert.equal(branches, trees.length - 1);
  const inks = conversationAddresses(trees);
  assert.deepEqual(
    [...spine].sort(),
    [...inks.values()].map((v) => v.ink).sort(),
    'same inks as the map and contents',
  );
  assert.deepEqual(spine, [0, 1, 2, 3, 4, 1, 1, 1], 'families contiguous in address order');
});
