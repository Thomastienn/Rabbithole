import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

test('the memory note starts empty, keeps markdown whole and survives reopening', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'tt-memory-')), 'trees.sqlite');
    let store = new Store(file);
    assert.equal(store.memoryNote(), '');
    const note = '## Background\n\n- Knows Python\n' + 'x'.repeat(100_000);
    assert.equal(store.saveMemoryNote(note), note);
    store.close();
    store = new Store(file);
    assert.equal(store.memoryNote(), note);
    assert.equal(store.saveMemoryNote(''), '');
    store.close();
});

test("a write caused by a reply marks that reply; the learner's own save marks none", (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-memory-')), 'trees.sqlite'));
    t.after(() => store.close());
    const tree = store.create('Memory', 'claude').id;
    const [first, second] = ['a', 'b'].map((text) =>
        store.message(tree, 'assistant', text, 'completed'),
    );
    store.saveMemoryNote('- Knows Python', second);
    store.saveMemoryNote('- Knows Rust');
    assert.deepEqual(
        store.tree(tree).messages.map((m) => [m.id === first, !!m.memoryUpdated]),
        [
            [true, false],
            [false, true],
        ],
    );
});
