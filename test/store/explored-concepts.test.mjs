import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

// A root whose reply has one saved suggestion about "Heap", and a learner question.
const seed = (store) => {
    const root = store.create('Root');
    store.message(root.id, 'user', 'What is heapsort?', 'completed');
    const reply = store.message(root.id, 'assistant', 'Heapsort uses a heap.', 'completed');
    store.pendingSuggestions(root.id, reply);
    store.finishSuggestions(
        root.id,
        reply,
        [{ start: 16, end: 20, text: 'heap', concept: 'Heap' }],
        null,
        null,
    );
    return { root: store.tree(root.id), reply };
};
const concept = (store, id) => store.list().find((t) => t.id === id).concept;

test('a suggestion branch explores its concept from creation, and only once', () => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-explored-')), 'db.sqlite'));
    const { root, reply } = seed(store);
    const child = store.branch(
        root,
        { messageId: reply, start: 16, end: 20, text: 'heap', question: 'Why?', suggestion: true },
        '',
    );
    const passage = store.branch(
        root,
        { messageId: reply, start: 0, end: 8, text: 'Heapsort', question: 'How?' },
        '',
    );
    assert.equal(concept(store, child.id), 'Heap');
    assert.equal(concept(store, passage.id), null);
    store.explore(child.id, 'Priority queue');
    store.rename(child.id, 'Mine');
    assert.equal(concept(store, child.id), 'Heap');
    assert.equal(store.list().find((t) => t.id === root.id).learnerMessages, 1);
    // A merge moves explored conversations to the kept concept.
    store.addGraph({ concepts: [{ name: 'Binary heap', topics: [] }], links: [] });
    store.mergeConcepts('Heap', 'Binary heap');
    assert.equal(concept(store, child.id), 'Binary heap');
    store.close();
});

test('migration gives existing suggestion branches their concept and leaves others empty', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-explored-migrate-')), 'db.sqlite');
    let store = new Store(path);
    const { root, reply } = seed(store);
    const child = store.branch(
        root,
        { messageId: reply, start: 16, end: 20, text: 'heap', question: 'Why?', suggestion: true },
        '',
    );
    const passage = store.branch(
        root,
        { messageId: reply, start: 0, end: 8, text: 'Heapsort', question: 'How?' },
        '',
    );
    // Rebuild trees as an older database had it: no concept column.
    const { sql } = store.db.prepare("SELECT sql FROM sqlite_master WHERE name='trees'").get();
    const older = sql.replace(/,\s*concept INTEGER REFERENCES concepts\(id\)/, '');
    assert.notEqual(older, sql);
    const columns = store.db
        .prepare('PRAGMA table_info(trees)')
        .all()
        .map((c) => c.name)
        .filter((c) => c !== 'concept')
        .join(',');
    store.db.exec(`PRAGMA foreign_keys=OFF; ${older.replace('trees', 'trees_old')};
    INSERT INTO trees_old SELECT ${columns} FROM trees;
    DROP TABLE trees; ALTER TABLE trees_old RENAME TO trees; PRAGMA foreign_keys=ON;`);
    store.close();
    store = new Store(path);
    assert.equal(concept(store, child.id), 'Heap');
    assert.equal(concept(store, passage.id), null);
    assert.equal(concept(store, root.id), null);
    store.close();
});
