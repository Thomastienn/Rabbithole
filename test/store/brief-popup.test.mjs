import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
const { excerpt } = await import('../../src/markdown/markdownText.ts');

test('excerpt keeps a short first paragraph and cuts a long one at a word boundary with an ellipsis', () => {
    assert.equal(excerpt('A **heap** is a tree.'), 'A heap is a tree.');
    assert.equal(excerpt('## Heaps\n\nA heap is a tree.\n\nIt sorts.'), 'A heap is a tree.');
    const long = excerpt(`${'word '.repeat(80)}end`);
    assert.ok(long.length <= 281 && long.length > 270, 'cut at about 280 characters');
    assert.match(long, /^word( word)*…$/);
    assert.equal(excerpt('one two three four', 9), 'one two…');
    assert.equal(excerpt('abcdefghijkl', 5), 'abcde…');
});

test("a conversation carries its saved brief explanations and each passage branch's question and child reply start", () => {
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
    const mine = store.branch(
        store.tree(root.id),
        { messageId: reply, start: 0, end: 8, text: 'Heapsort', question: 'And this?' },
        '',
    );
    store.saveBrief({ message: reply, start: 0, end: 8, text: 'Heapsort' }, 'Sorting with a heap.');
    const observations = () => store.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n;
    const before = observations();
    const tree = store.tree(root.id);
    assert.deepEqual(
        tree.briefs.map((b) => ({ ...b })),
        [{ message: reply, start: 0, end: 8, explanation: 'Sorting with a heap.' }],
    );
    assert.deepEqual(tree.branchPreviews[child.id].question, 'Why?');
    assert.match(
        tree.branchPreviews[child.id].preview,
        /^A heap keeps the largest item on top .* the…$/,
    );
    assert.ok(tree.branchPreviews[child.id].preview.length <= 281);
    assert.equal(tree.branchPreviews[mine.id].question, 'And this?');
    assert.equal(
        tree.branchPreviews[mine.id].preview,
        undefined,
        'a child without a reply has none',
    );
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
