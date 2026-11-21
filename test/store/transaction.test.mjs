import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

test('a store transaction commits its result, and a failure inside it leaves no partial writes', (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-tx-')), 'trees.sqlite'));
    t.after(() => store.close());
    const kept = store.transaction(() => store.create('Kept', 'claude', 'opus', null));
    assert.equal(store.tree(kept.id).title, 'Kept');
    let partial;
    assert.throws(
        () =>
            store.transaction(() => {
                partial = store.create('Partial', 'claude', 'opus', null);
                store.rename(partial.id, 'Renamed');
                throw new Error('boom');
            }),
        /boom/,
    );
    assert.equal(store.tree(partial.id), undefined);
    assert.deepEqual(
        store.list().map((tree) => tree.id),
        [kept.id],
    );
    assert.equal(
        store.transaction(() => 'next write works'),
        'next write works',
    );
});
