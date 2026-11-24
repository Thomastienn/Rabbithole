import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import {
    snippet,
    sourceOf,
    keepCurrentFolded,
    revealAddedBranches,
    familyLegend,
    branchEdges,
    reconcileNodes,
    keyMovement,
    revealViewport,
    restoredTree,
} from '../../src/map/mapState.ts';
import { foldHierarchy } from '../../src/map/canvas.ts';
import { conversationAddresses, inkStyle, markLibraryScrolling } from '../../src/map/treeList.ts';
import { withLiveTurn, previewRequests, replyingPreviews } from '../../src/map/previews.ts';
import { treeSearchSource } from '../../src/shell/treeSearchSource.ts';
import { fakeServer } from '../support/fake-server.mjs';

const tree = (id, parent = null, created = 0) => ({
    id,
    parent,
    title: id,
    created,
    x: null,
    y: null,
    messageId: `${parent}-reply`,
    start: 3,
    end: 8,
    passage: 'Roots',
});
const trees = [
    tree('root'),
    tree('a', 'root', 1),
    tree('b', 'a', 2),
    tree('c', 'b', 3),
    tree('side', 'a', 4),
    tree('hidden', 'side', 5),
    tree('child', 'c', 6),
    tree('other'),
    tree('other-child', 'other', 7),
];

test('bulk folds keep the current path and descendants, fold side branches, and leave saved trees intact', () => {
    const before = structuredClone(trees);
    const folds = keepCurrentFolded('root', trees, 'b');
    assert.deepEqual([...folds], ['side']);
    const visible = (folded) =>
        foldHierarchy('root', trees, folded)
            .filter((n) => !n.hidden)
            .map((n) => n.conversation.id);
    assert.deepEqual(visible(new Set(['root'])), ['root']);
    assert.deepEqual(visible(folds).sort(), ['root', 'a', 'b', 'c', 'side', 'child'].sort());
    assert.equal(visible(new Set()).length, 7);
    assert.equal(keepCurrentFolded('root', trees, 'other'), undefined);
    assert.equal(keepCurrentFolded('root', trees), undefined);
    assert.deepEqual([...keepCurrentFolded('only', [tree('only')], 'only')], []);
    assert.deepEqual(trees, before);
});

test('new children reveal their ancestor path without losing nested side folds or saved positions', () => {
    const folded = new Set(['root', 'a', 'side', 'other']);
    const next = revealAddedBranches(folded, [tree('new', 'b')], trees);
    assert.deepEqual([...next], ['side', 'other']);
    assert.deepEqual([...folded], ['root', 'a', 'side', 'other']);
    assert.deepEqual(
        [
            ...revealAddedBranches(
                new Set(['x', 'y']),
                [tree('new', 'x')],
                [tree('x', 'y'), tree('y', 'x')],
            ),
        ],
        [],
        'stale cyclic metadata cannot loop',
    );
});

test('tree restore selects only its own saved conversation and panel; legacy defaults and explicit opens stay intact', () => {
    assert.deepEqual(restoredTree('root', trees), {
        saved: 'root',
        overview: true,
        expanded: false,
    });
    for (const panel of ['collapsed', 'beside', 'expanded']) {
        const list = trees.map((t) =>
            t.id === 'root'
                ? {
                      ...t,
                      layout: {
                          selected: 'b',
                          panel,
                          folded: ['side'],
                          viewport: { x: 12, y: -23, zoom: 0.5 },
                      },
                  }
                : t,
        );
        const before = structuredClone(list);
        assert.deepEqual(restoredTree('root', list), {
            saved: 'b',
            overview: panel === 'collapsed',
            expanded: panel === 'expanded',
        });
        assert.deepEqual(restoredTree('other', list), {
            saved: 'other',
            overview: true,
            expanded: false,
        });
        assert.deepEqual(
            list,
            before,
            'restore never rewrites viewport, folds, positions or content',
        );
    }
    for (const selected of ['other-child', 'deleted']) {
        const list = trees.map((t) =>
            t.id === 'root' ? { ...t, layout: { selected, panel: 'beside' } } : t,
        );
        assert.equal(restoredTree('root', list).saved, 'root');
    }
    assert.deepEqual(restoredTree('root', trees, 'b'), {
        saved: 'b',
        overview: false,
        expanded: false,
    });
    assert.deepEqual(restoredTree('root', trees, undefined, true), {
        saved: 'root',
        overview: false,
        expanded: false,
    });
});

test('legend names only this trunk and its first branches, repeating inks and reflecting rename/delete', () => {
    const list = [
        tree('root'),
        ...Array.from({ length: 5 }, (_, i) => tree(`a${i}`, 'root', i)),
        tree('deep', 'a0'),
        tree('other'),
    ];
    const legend = familyLegend('root', list);
    assert.deepEqual(
        legend.map((t) => [t.address, t.ink]),
        [
            ['1', 0],
            ['1.1', 1],
            ['1.2', 2],
            ['1.3', 3],
            ['1.4', 4],
            ['1.5', 1],
        ],
    );
    list[1] = { ...list[1], title: 'Renamed' };
    assert.equal(familyLegend('root', list)[1].title, 'Renamed');
    assert.equal(
        familyLegend(
            'root',
            list.filter((t) => t.id !== 'a4'),
        ).length,
        5,
    );
    assert.deepEqual(inkStyle(0), {
        '--ink': 'var(--rabbithole-paper)',
        '--ink-on': 'var(--rabbithole-paper-ink)',
    });
    assert.equal(inkStyle(2)['--ink'], 'var(--rabbithole-ink-2)');
});

test('branches retain source message/offsets, exact passage label, focus ink and creation time through folds', () => {
    const edges = (folded) =>
        branchEdges(
            foldHierarchy('root', trees, folded),
            folded,
            new Set(['a', 'b']),
            conversationAddresses(trees),
            new Map([['a', 42]]),
        );
    const a = edges(new Set()).find((e) => e.id === 'a');
    assert.deepEqual(a, {
        id: 'a',
        type: 'branch',
        className: 'branch-focused',
        source: 'root',
        sourceHandle: 'a',
        target: 'a',
        ariaLabel: 'Passage “Roots” to a',
        data: { messageId: 'root-reply', start: 3, end: 8, created: 42, ink: 1 },
    });
    assert.deepEqual(edges(new Set(['root'])), []);
    assert.deepEqual(
        edges(new Set(['a'])).map((e) => e.id),
        ['a'],
    );
    assert.deepEqual(
        edges(new Set()).find((e) => e.id === 'a'),
        a,
        'unfold uses the original creation timestamp',
    );
    assert.equal(
        edges(new Set()).some((e) => e.id.startsWith('other')),
        false,
    );
});

test('streaming one of 200 conversations preserves unrelated node/data references and manual positions', () => {
    const previous = Array.from({ length: 200 }, (_, i) => ({
        id: String(i),
        position: { x: i * 360, y: 100 },
        measured: { width: 256, height: 180 },
        selected: true,
        data: { preview: [], sources: [tree(`child${i}`, String(i))], stubs: [], active: false },
    }));
    previous[1].data.stubs = [
        { child: previous[1].data.sources[0], beneath: 2, address: '1.1', ink: 1 },
    ];
    const desired = previous.map((n) => ({
        ...n,
        position: { x: 0, y: 0 },
        data: {
            ...n.data,
            sources: [...n.data.sources],
            stubs: n.data.stubs.map((s) => ({ ...s })),
        },
    }));
    desired[0].data = {
        ...desired[0].data,
        preview: [{ id: 'reply', text: 'Chunk 11', role: 'assistant', status: 'streaming' }],
        active: true,
    };
    const next = reconcileNodes(previous, desired);
    assert.notEqual(next[0], previous[0]);
    assert.equal(next[0].position, previous[0].position);
    assert.equal(next[0].measured, previous[0].measured);
    assert.equal(next[0].data.preview[0].text, 'Chunk 11');
    for (let i = 1; i < 200; i++) assert.equal(next[i], previous[i]);
    const changed = { ...desired[1], hidden: true, data: { ...desired[1].data, stubs: [] } };
    assert.notEqual(reconcileNodes(next, [changed])[0], next[1]);
    const added = { ...previous[0], id: 'new' };
    assert.deepEqual(reconcileNodes([], [added]), [added]);
    assert.deepEqual(reconcileNodes(next, []), []);
});

test('arrow movement maps canvas pan and node movement with their own Shift distances', () => {
    for (const [key, axis, sign] of [
        ['ArrowLeft', 'x', -1],
        ['ArrowRight', 'x', 1],
        ['ArrowUp', 'y', -1],
        ['ArrowDown', 'y', 1],
    ]) {
        for (const canvas of [true, false])
            for (const shift of [true, false]) {
                const delta = keyMovement(key, shift, canvas);
                assert.equal(
                    delta[axis],
                    sign * (canvas ? -(shift ? 300 : 100) : shift ? 100 : 10),
                );
                assert.equal(Math.abs(delta[axis === 'x' ? 'y' : 'x']), 0);
            }
    }
    for (const key of ['Enter', ' ', 'a', 'toString'])
        assert.equal(keyMovement(key, false, true), undefined);
});

test('selection reveal keeps an already visible conversation, fits tall transcripts above controls and respects the readable floor', () => {
    const view = { x: 10, y: 20, zoom: 1 };
    assert.deepEqual(
        revealViewport(view, { x: 20, y: 20, width: 200, height: 100 }, 500, 500),
        view,
    );
    assert.deepEqual(
        revealViewport(view, { x: -100, y: -100, width: 200, height: 100 }, 500, 500),
        {
            x: 100,
            y: 100,
            zoom: 1,
        },
    );
    const bounds = { x: 0, y: 0, width: 256, height: 2000 };
    const next = revealViewport(view, bounds, 440, 900, { top: 800, height: 40 });
    assert.equal(next.zoom, 0.38);
    assert.equal(next.y + bounds.height * next.zoom, 780);
    assert.equal(
        revealViewport(view, { ...bounds, height: 10000 }, 440, 900, { top: 800, height: 40 }).zoom,
        0.2,
    );
    assert.deepEqual(revealViewport({ x: 0, y: 0, zoom: 0.001 }, bounds, 440, 900).zoom, 0.2);
});

test('message jump labels flatten and bound text; source reveal keeps exact UTF-16 offsets or visual metadata', () => {
    assert.equal(snippet('  roots\n\tand fungi '), 'roots and fungi');
    assert.equal(snippet('a'.repeat(80)), 'a'.repeat(80));
    assert.equal(snippet('a'.repeat(81)), 'a'.repeat(79) + '…');
    const child = {
        ...tree('child', 'root'),
        messageId: 'reply',
        start: 15,
        end: 25,
        passage: '🌲 repeated',
    };
    assert.deepEqual(sourceOf(child), {
        messageId: 'reply',
        start: 15,
        end: 25,
        text: '🌲 repeated',
    });
    assert.deepEqual(
        sourceOf({ ...child, artifactId: 'visual', label: 'Root', explanation: 'What it does' }),
        {
            messageId: 'reply',
            text: '🌲 repeated',
            artifactId: 'visual',
            label: 'Root',
            explanation: 'What it does',
        },
    );
    assert.deepEqual(
        sourceOf({
            ...child,
            artifactId: 'visual',
            label: 'Tip',
            explanation: 'What it does',
            trail: ['Root', 'Tip'],
            step: 1,
        }),
        {
            messageId: 'reply',
            text: '🌲 repeated',
            artifactId: 'visual',
            label: 'Tip',
            explanation: 'What it does',
            trail: ['Root', 'Tip'],
            step: 1,
        },
        'a picked part returns to its trail and stored step',
    );
});

test('preview requests batch at 300 and encode IDs; polling excludes idle and other learning trees', () => {
    assert.deepEqual(previewRequests([]), []);
    assert.equal(previewRequests(['only']).length, 1);
    const uuids = Array.from({ length: 1000 }, () => randomUUID());
    const uuidRequests = previewRequests(uuids);
    assert.deepEqual(
        uuidRequests
            .map((path) => new URL(path, 'http://localhost').searchParams.getAll('id'))
            .flat(),
        uuids,
    );
    // Node refuses headers over 16,384 bytes; leave 4 KB for the browser's other headers.
    for (const path of uuidRequests)
        assert.ok(`GET ${path} HTTP/1.1\r\n`.length < 12288, path.length);
    const ids = Array.from({ length: 1001 }, (_, i) => `${i} &=?`);
    const batches = previewRequests(ids).map((path) =>
        new URL(path, 'http://localhost').searchParams.getAll('id'),
    );
    assert.deepEqual(
        batches.map((b) => b.length),
        [300, 300, 300, 101],
    );
    assert.deepEqual(batches.flat(), ids);
    assert.deepEqual(replyingPreviews(['root', 'child', 'idle'], 'root,other,child'), [
        'root',
        'child',
    ]);
    assert.deepEqual(replyingPreviews(['root'], ''), []);
});

test('live previews keep earlier messages, replace retried replies and use bounded rendered text without mutating raw turns', () => {
    const saved = [
        { id: 'old', role: 'assistant', text: 'Earlier', status: 'completed' },
        { id: 'failed', role: 'assistant', text: 'Failed', status: 'failed' },
    ];
    const turn = {
        replaced: 'failed',
        user: { id: 'q', role: 'user', text: '**Literal**', status: 'completed' },
        reply: {
            id: 'a',
            role: 'assistant',
            text: '**Roots** ' + '🌲'.repeat(600),
            status: 'streaming',
        },
        artifacts: [
            {
                id: 'discussion',
                conversation: 'root',
                message: 'a',
                kind: 'discussion',
                title: 'Discussion',
                status: 'ready',
                classmates: 4,
                discussion: { classmates: ['A', 'B', 'C', 'D'], lines: [] },
            },
        ],
    };
    const before = structuredClone(turn);
    const next = withLiveTurn(saved, turn);
    assert.deepEqual(
        next.map((m) => m.id),
        ['old', 'q', 'a'],
    );
    assert.equal(next[1].text, '**Literal**');
    assert.ok(next[2].text.startsWith('Roots '));
    assert.equal(Array.from(next[2].text).length, 513);
    assert.equal(next[2].status, 'streaming');
    assert.deepEqual(next[2].artifacts, [
        {
            id: 'discussion',
            kind: 'discussion',
            title: 'Discussion',
            status: 'ready',
            classmates: 4,
        },
    ]);
    assert.deepEqual(
        withLiveTurn(next, turn),
        next,
        'checkpoint and live events never duplicate rows',
    );
    assert.deepEqual(turn, before);
    assert.equal(saved.length, 2);
});

test('search waits after typing, cancels stale requests, names the current tree and surfaces failure', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const errors = [];
    let fail = false;
    const result = {
        conversation: 'child',
        root: 'new',
        tree: 'Roman roads',
        address: '1.1',
        title: 'Aqueducts',
        field: 'reply',
        snippet: 'Water ran downhill.',
        ranges: [[0, 5]],
        message: 'm1',
    };
    const calls = fakeServer(t, () => {
        if (fail) throw new Error('Unavailable');
        return [result];
    });
    let current = 'new';
    const source = treeSearchSource(
        (e) => errors.push(e),
        () => current,
    );
    assert.deepEqual(source.bootstrap(), []);
    const stale = source.search('wa');
    const latest = source.search('O & ?');
    t.mock.timers.tick(119);
    await Promise.resolve();
    assert.equal(calls.length, 0, 'no request before the typing pause');
    t.mock.timers.tick(1);
    assert.deepEqual(await stale, []);
    const [item] = await latest;
    assert.deepEqual(
        calls.map((c) => c.path),
        ['/api/search?q=O%20%26%20%3F&tree=new'],
    );
    assert.equal(item.id, 'child');
    assert.equal(item.auxiliaryData.group, 'Roman roads');
    assert.equal(item.auxiliaryData.message, 'm1');
    current = undefined;
    fail = true;
    const failed = source.search('photo');
    t.mock.timers.tick(120);
    assert.deepEqual(await failed, []);
    assert.equal(calls.at(-1).path, '/api/search?q=photo');
    assert.deepEqual(errors, ['Unavailable'], 'only the failure is reported, not the cancel');
});

test('Library scrolling marker stays through repeated scrolling and clears only after 800ms idle', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const element = { dataset: { other: 'kept' } };
    let timer = markLibraryScrolling(element);
    assert.equal(element.dataset.scrolling, '');
    t.mock.timers.tick(799);
    timer = markLibraryScrolling(element, timer);
    t.mock.timers.tick(1);
    assert.equal(element.dataset.scrolling, '', 'the old timeout was canceled');
    t.mock.timers.tick(799);
    assert.deepEqual(element.dataset, { other: 'kept' });
});
