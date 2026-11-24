import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

async function serve(t, store, dir) {
    const app = createApp({
        store,
        provider: {
            generate: async () => {
                throw new Error('search must not call a model');
            },
        },
        dir,
        auth: { status: () => ({ connected: true }) },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.stop();
        store.close();
    });
    return async (q, tree) =>
        (
            await fetch(
                `http://127.0.0.1:${app.server.address().port}/api/search?q=${encodeURIComponent(q)}${tree ? `&tree=${tree}` : ''}`,
            )
        ).json();
}
const highlighted = (r) => r.ranges.map(([s, e]) => r.snippet.slice(s, e).toLowerCase());

test('search finds every conversation text by word parts, forgives typos and groups by learning tree', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-search-'));
    const store = new Store(join(dir, 'trees.sqlite'));
    const search = await serve(t, store, dir);

    const db = store.create('Functional dependency closure', 'codex');
    store.message(db.id, 'user', 'How do I compute an attribute closure?', 'completed');
    const reply = store.message(
        db.id,
        'assistant',
        'Normalisation removes **redundancy**. [[note: hiddenmarker]] Keep adding attributes.',
        'completed',
    );
    const child = store.branch(
        store.tree(db.id),
        { messageId: reply, start: 0, end: 13, text: 'Normalisation', question: 'Why bother?' },
        'ctx',
    );
    store.rename(child.id, 'Chlorophyll colour');
    const childReply = store.message(child.id, 'assistant', '', 'streaming');
    const rome = store.create('Roman roads', 'codex');
    store.message(rome.id, 'user', 'Who built the redundancy of roads?', 'completed');

    const [hit] = await search('closure func dep');
    assert.equal(hit.conversation, db.id, 'parts of words in any order');
    assert.equal(hit.field, 'title');
    assert.equal(hit.address, '1');
    assert.equal(hit.tree, 'Functional dependency closure');
    assert.deepEqual(highlighted(hit), ['func', 'dep', 'closure'], 'ranges point at the match');

    const typo = await search('normalisaton');
    assert.ok(typo.length > 0, 'a small typo still matches');
    assert.ok(highlighted(typo[0]).some((h) => h.startsWith('normalisa')));

    const found = async (q) => (await search(q)).map((r) => [r.conversation, r.field]);
    assert.deepEqual(await found('chlorophyll'), [[child.id, 'title']], 'branch title');
    assert.deepEqual(await found('bother'), [[child.id, 'question']], 'branch question');
    assert.deepEqual(await found('attribute closure?'), [[db.id, 'question']], 'learner message');
    const [replyHit] = await search('adding attributes');
    assert.equal(replyHit.field, 'reply');
    assert.equal(replyHit.message, reply);
    assert.equal(replyHit.address, '1');
    assert.ok(
        (await found('normalisation')).some(
            ([id, field]) => id === child.id && field === 'passage',
        ),
        'passage',
    );
    assert.deepEqual(await search('hiddenmarker'), [], 'markers are never matched');
    assert.ok(!(await search('redundancy')).some((r) => r.snippet.includes('[[')));
    assert.ok(!replyHit.snippet.includes('**'), 'snippets show plain text');

    assert.deepEqual(
        (await search('ro')).map((r) => r.conversation),
        [rome.id],
        'short words match title words by prefix only',
    );

    const order = async (tree) =>
        (await search('redundancy', tree)).map((r) => [r.root, r.conversation]);
    assert.deepEqual((await order(rome.id))[0], [rome.id, rome.id], 'current tree first');
    const grouped = (await order(db.id)).map(([root]) => root);
    assert.deepEqual(
        grouped,
        [...grouped].sort((a, b) => (b === db.id) - (a === db.id)),
    );

    assert.deepEqual(await search('thylakoid'), [], 'a streaming reply is not searchable yet');
    store.update(childReply, 'The Thylakoid membranes reflect green.', 'completed');
    const [saved] = await search('thylakoid');
    assert.deepEqual(
        [saved.conversation, saved.address, saved.message],
        [child.id, '1.1', childReply],
    );

    assert.deepEqual(await search('   '), []);
    assert.deepEqual(await search('no such words'), []);
    store.remove(db.id, db.id, () => {});
    assert.deepEqual(
        (await search('redundancy chlorophyll thylakoid closure'))
            .concat(await search('thylakoid'), await search('closure'))
            .map((r) => r.conversation),
        [],
        'deleted conversations drop out',
    );
});

test('existing conversations are indexed once when the database upgrades', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-search-upgrade-'));
    const path = join(dir, 'trees.sqlite');
    const old = new Store(path);
    const tree = old.create('Roman roads', 'codex');
    old.message(tree.id, 'assistant', 'Aqueducts carried *water* downhill.', 'completed');
    // An older build has no search tables or triggers.
    for (const { type, name } of old.db
        .prepare(
            "SELECT type,name FROM sqlite_master WHERE name LIKE 'search_%' AND type IN ('trigger','table') ORDER BY type='table'",
        )
        .all())
        if (old.db.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name))
            old.db.exec(`DROP ${type.toUpperCase()} ${name}`);
    old.close();

    const store = new Store(path);
    t.after(() => store.close());
    assert.deepEqual(
        store.search('aqueduct water').map((r) => [r.conversation, r.field, r.snippet]),
        [[tree.id, 'reply', 'Aqueducts carried water downhill.']],
    );
    assert.equal(store.search('roads')[0].field, 'title');
});
