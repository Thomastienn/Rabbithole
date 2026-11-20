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
