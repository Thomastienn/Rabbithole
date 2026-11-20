import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deletePrompt, subtreeIds, treeGroups } from '../../src/map/treeList.ts';

// Local-time Date constructors keep these tests true in any zone; a runtime process.env.TZ switch is not honoured everywhere.
test('learning trees group by local creation day, newest first, including midnight and week boundaries', () => {
    const now = new Date(2026, 10, 10, 0, 1);
    const root = (id, created) => ({ id, parent: null, created: +created });
    const trees = [
        root('older', new Date(2026, 10, 2, 23, 59, 59)),
        root('week', new Date(2026, 10, 3)),
        root('yesterday', new Date(2026, 10, 9, 23, 59, 59)),
        root('today', new Date(2026, 10, 10)),
        root('two-days', new Date(2026, 10, 8, 23, 59, 59)),
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
    assert.equal(treeGroups([trees[3]], new Date(2026, 10, 11))[0].label, 'Yesterday');
    assert.equal(
        treeGroups([root('year', new Date(2025, 11, 31, 23, 59, 59))], new Date(2026, 0, 1))[0]
            .label,
        'Yesterday',
    );
});

test('calendar days stay correct through both daylight-saving changes', () => {
    for (const [created, now, label] of [
        [new Date(2026, 2, 7, 23, 59, 59), new Date(2026, 2, 8, 23, 59, 59), 'Yesterday'],
        [new Date(2026, 2, 1, 23, 59, 59), new Date(2026, 2, 9), 'Older'],
        [new Date(2026, 9, 31), new Date(2026, 10, 1, 23, 59, 59), 'Yesterday'],
        [new Date(2026, 9, 25), new Date(2026, 10, 1, 23, 59, 59), 'Previous 7 days'],
    ]) {
        assert.equal(
            treeGroups([{ id: 'root', parent: null, created: +created }], now)[0].label,
            label,
        );
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
    const { conversationAddresses } = await import('../../src/map/treeList.ts');
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
    const after = view(
        conversationAddresses([...trees, t('b6', 'root', 100), t('b1c', 'b1', 100)]),
    );
    assert.deepEqual(
        { ...after, b6: undefined, b1c: undefined },
        { ...before, b6: undefined, b1c: undefined },
    );
    assert.equal(after.b6, '1.6:2');
    assert.equal(after.b1c, '1.1.3:1');
});

test('library spine has one tick per conversation in its family ink, matching conversation addresses', async () => {
    const { conversationAddresses } = await import('../../src/map/treeList.ts');
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

test('deleting a conversation removes it and every descendant, never its parent or siblings', () => {
    const trees = [
        { id: 'root', parent: null },
        { id: 'child', parent: 'root' },
        { id: 'grand', parent: 'child' },
        { id: 'great', parent: 'grand' },
        { id: 'sibling', parent: 'root' },
        { id: 'other', parent: null },
    ];
    assert.deepEqual(subtreeIds('child', trees), ['child', 'grand', 'great']);
    assert.deepEqual(subtreeIds('root', trees), ['root', 'child', 'sibling', 'grand', 'great']);
    assert.deepEqual(subtreeIds('sibling', trees), ['sibling']);
});

test('delete confirmation names the kind, counts every conversation and appends a failure', () => {
    assert.deepEqual(deletePrompt({ title: 'Peterson', count: 1, parent: 'root' }), {
        title: 'Delete branch “Peterson”?',
        description:
            '1 conversation and their messages, branches, diagrams and saved layout will be permanently deleted. Ready videos stay in Videos. Active replies and video jobs in these conversations will stop. This cannot be undone.',
        actionLabel: 'Delete branch',
    });
    const root = deletePrompt({ title: 'Tournament', count: 3, parent: null }, 'Locked');
    assert.equal(root.title, 'Delete chat “Tournament”?');
    assert.equal(root.actionLabel, 'Delete chat');
    assert.match(root.description, /^3 conversations .* Deletion failed: Locked$/);
});

test('library search filters root titles case-insensitively and counts conversations and branches', async () => {
    const { librarySearch, volumeCounts } = await import('../../src/map/treeList.ts');
    const trees = [
        { id: 'fungi', parent: null, title: 'How do fungi trade?' },
        { id: 'roads', parent: null, title: 'Roman roads' },
        { id: 'child', parent: 'roads', title: 'FUNGI in a branch title' },
    ];
    assert.deepEqual(
        librarySearch(trees, '  FUNGI ').map((t) => t.id),
        ['fungi', 'child'],
    );
    assert.deepEqual(
        treeGroups(
            librarySearch(trees, 'zzz').map((t) => ({ ...t, created: 0 })),
            new Date(0),
        ),
        [],
        'no match leaves no group, so the page says nothing matches',
    );
    assert.equal(librarySearch(trees, '').length, 3);
    assert.deepEqual([0, 1, 4].map(volumeCounts), [
        '1 conversation · 0 branches',
        '2 conversations · 1 branch',
        '5 conversations · 4 branches',
    ]);
});
