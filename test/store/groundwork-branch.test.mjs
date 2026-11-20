import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { compacted } from '../support/branch-first.mjs';

test('a groundwork branch asks what the concept is, with no start or end, as an ordinary child', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'rabbithole-groundwork-')), 'db.sqlite'),
    );
    const provider = {
        generate: async (_tree, _text, emit) => {
            emit({ type: 'item', item: 'answer', text: 'Locks serialise access.' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => app.server.close());
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (route, body) =>
        fetch(`${origin}/api/trees${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const root = await (await post('', {})).json();
    store.model(root.id, 'fixture-model', null);
    const reply = store.message(root.id, 'assistant', 'Locks serialise access.', 'completed');
    store.pendingSuggestions(root.id, reply);
    store.finishSuggestions(root.id, reply, [], null, null, ['Mutual exclusion']);

    const rejected = await post(`/${root.id}/branches`, {
        messageId: reply,
        groundwork: 'Threads',
    });
    assert.equal(rejected.status, 400);
    const response = await post(`/${root.id}/branches`, {
        messageId: reply,
        groundwork: 'Mutual exclusion',
    });
    assert.equal(response.status, 201);
    const child = await compacted(app, origin, (await response.json()).id);
    assert.equal(child.branch.parent, root.id);
    assert.equal(child.branch.messageId, reply);
    assert.equal(child.branch.start, null);
    assert.equal(child.branch.end, null);
    assert.equal(child.branch.text, 'Mutual exclusion');
    assert.equal(child.branch.question, 'What is Mutual exclusion?');
    assert.equal(child.model, 'fixture-model');
    assert.ok(child.branch.snapshot);
    const { trees } = await (await fetch(`${origin}/api/state`)).json();
    const summary = trees.find((s) => s.id === child.id);
    assert.equal(summary.parent, root.id);
    assert.equal(summary.passage, 'Mutual exclusion');
    assert.equal(summary.start, null);
    assert.equal(summary.concept, 'Mutual exclusion');
});
