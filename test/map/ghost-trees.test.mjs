import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { ghostTrees, miniature } = await import('../../src/map/ghostTrees.ts');

const c = (id, parent, extra = {}) => ({
    id,
    parent,
    title: id,
    created: 0,
    x: null,
    y: null,
    concept: null,
    learnerMessages: 0,
    ...extra,
});

test('one ghost tree per other tree, best match by learner messages, ties to the newest tree', () => {
    const trees = [
        c('here', null, { concept: 'Entropy' }),
        c('here.1', 'here', { concept: 'Heat' }),
        c('here.2', 'here', { concept: 'Heat' }),
        c('here.3', 'here'),
        c('old', null, { created: 1, concept: 'entropy', learnerMessages: 2 }),
        c('old.1', 'old', { concept: 'Heat', learnerMessages: 1 }),
        c('busy', null, { created: 2 }),
        c('busy.1', 'busy', { concept: 'Entropy', learnerMessages: 5 }),
        c('new', null, { created: 3, concept: 'Heat', learnerMessages: 1 }),
    ];
    const ghosts = ghostTrees(trees, 'here');
    assert.deepEqual(
        ghosts.map((g) => [g.root, g.links, g.matches, g.concepts]),
        [
            ['new', ['here.1', 'here.2'], ['new'], ['Heat']],
            ['busy', ['here'], ['busy.1'], ['Entropy']],
        ],
    );
    // Arriving from a ghost tree, its matches lead back to it.
    assert.deepEqual(
        ghostTrees(trees, 'here', 'old').map((g) => [g.root, g.links, g.matches]),
        [['old', ['here', 'here.1', 'here.2'], ['old', 'old.1']]],
    );
});

test('same-tree and concept-less conversations make no ghost tree; five kept by dashed lines', () => {
    assert.deepEqual(
        ghostTrees(
            [c('a', null, { concept: 'X' }), c('a.1', 'a', { concept: 'X' }), c('b', null)],
            'a',
        ),
        [],
    );
    const here = [...'abcdef'].flatMap((k, i) =>
        Array.from({ length: i + 1 }, (_, j) => c(`${k}${j}`, 'root', { concept: k })),
    );
    const others = [...'abcdef'].map((k) => c(`other-${k}`, null, { concept: k }));
    const ghosts = ghostTrees([c('root', null), ...here, ...others], 'root');
    assert.deepEqual(
        ghosts.map((g) => [g.root, g.links.length]),
        [
            ['other-f', 6],
            ['other-e', 5],
            ['other-d', 4],
            ['other-c', 3],
            ['other-b', 2],
        ],
    );
});

test('a miniature has a dot per conversation within 160 pixels, also for an unarranged tree', () => {
    const unarranged = [c('r', null), c('r.1', 'r', { created: 1 }), c('r.2', 'r', { created: 2 })];
    const arranged = [c('r', null, { x: 0, y: 0 }), c('r.1', 'r', { x: 1000, y: 500 })];
    for (const trees of [unarranged, arranged]) {
        const { dots, lines } = miniature([...trees, c('elsewhere', null)], 'r');
        assert.equal(dots.length, trees.length);
        assert.equal(lines.length, trees.length - 1);
        for (const d of dots) assert.ok(d.x >= 0 && d.x <= 160 && d.y >= 0 && d.y <= 160);
        assert.equal(new Set(dots.map((d) => `${d.x},${d.y}`)).size, trees.length);
        assert.ok(lines.every((l) => l.ink === 1 || l.ink === 2));
    }
});
