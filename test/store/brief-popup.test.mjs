import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
const { excerpt } = await import('../../src/markdown/markdownText.ts');

test('excerpt keeps short text and cuts long text at a word boundary with an ellipsis', () => {
    assert.equal(excerpt('A **heap** is a tree.'), 'A heap is a tree.');
    assert.equal(excerpt('one two three four', 9), 'one two…');
    assert.equal(excerpt('abcdefghijkl', 5), 'abcde…');
});

test('a conversation carries its saved brief explanations and branched suggestions a preview of their child', () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-popup-')), 'db.sqlite'));
    const root = store.create('Root');
    store.message(root.id, 'user', 'What is heapsort?', 'completed');
    const reply = store.message(
        root.id,
        'assistant',
        'Heapsort uses a heap and a sift.',
        'completed',
    );
    store.pendingSuggestions(root.id, reply);
    store.finishSuggestions(
        root.id,
        reply,
        [
            { start: 16, end: 20, text: 'heap', concept: 'Heap' },
            { start: 27, end: 31, text: 'sift', concept: 'Sift' },
        ],
        null,
        null,
    );
    const child = store.branch(
        store.tree(root.id),
        { messageId: reply, start: 16, end: 20, text: 'heap', question: 'Why?', suggestion: true },
        '',
    );
    store.message(child.id, 'user', 'Why?', 'completed');
    store.message(
        child.id,
        'assistant',
        `A **heap** keeps ${'the largest item on top '.repeat(20)}`,
        'completed',
    );
    store.saveBrief({ message: reply, start: 0, end: 8, text: 'Heapsort' }, 'Sorting with a heap.');
    const observations = () => store.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n;
    const before = observations();
    const tree = store.tree(root.id);
    assert.deepEqual(
        tree.briefs.map((b) => ({ ...b })),
        [{ message: reply, start: 0, end: 8, explanation: 'Sorting with a heap.' }],
    );
    const [heap, sift] = tree.suggestions[0].passages;
    assert.match(heap.preview, /^A heap keeps the largest item on top .* on…$/);
    assert.ok(heap.preview.length <= 201);
    assert.equal(sift.preview, undefined, 'an unexplored suggestion has none');
    assert.equal(observations(), before, 'reading saved explanations records nothing');
    store.close();
});

test('a briefed selection becomes a suggestion of a finished reply with no suggestions, never of a streaming one', () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-briefed-')), 'db.sqlite'));
    const root = store.create('Root');
    const live = store.message(root.id, 'assistant', 'A heap streams', 'streaming');
    const done = store.message(root.id, 'assistant', 'A heap is a tree.', 'completed');
    const heap = { start: 2, end: 6, text: 'heap' };
    assert.equal(store.suggestBriefed(root.id, { message: live, ...heap }), false);
    assert.equal(store.suggestBriefed(root.id, { message: done, ...heap }), true);
    assert.equal(store.suggestBriefed(root.id, { message: done, ...heap }), false);
    assert.deepEqual(store.tree(root.id).suggestions, [
        { message: done, status: 'ready', passages: [heap], groundwork: [] },
    ]);
    store.close();
});
