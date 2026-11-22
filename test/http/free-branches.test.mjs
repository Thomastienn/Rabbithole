import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.mjs';
import { tutorSystem } from '../../server/media/diagrams.mjs';
import { open, complete } from '../support/diagram-kit.mjs';

const SUMMARY = 'The fungus trades minerals for sugar.';
const env = async (calls) =>
    open(
        {
            generate: async (tree, prompt, emit) => {
                calls.push({ tree, prompt });
                const compacting = tree.instructions?.includes(
                    'background a new focused conversation',
                );
                complete(emit, compacting ? SUMMARY : 'Answer.');
            },
        },
        { log: () => {} },
    );
const ask = { free: true, question: 'Do lichens trade the same way?' };

test('a free branch hangs off the latest completed reply with no passage and survives reopening', async (t) => {
    const calls = [];
    const app = await env(calls);
    t.after(app.close);
    const { id } = await (await app.post('/api/trees')).json();
    app.store.message(id, 'user', 'What are hyphae?', 'completed');
    app.store.message(id, 'assistant', 'Threads of a fungus.', 'completed');
    app.store.message(id, 'user', 'And mycorrhizae?', 'completed');
    const latest = app.store.message(id, 'assistant', 'A root partnership.', 'completed');
    app.store.message(id, 'assistant', 'Half a reply', 'stopped');
    const response = await app.post(`/api/trees/${id}/branches`, ask);
    assert.equal(response.status, 201);
    const childId = (await response.json()).id;
    await app.app.settled();
    const child = await (await app.get(`/api/trees/${childId}`)).json();
    assert.deepEqual(
        [child.branch.parent, child.branch.messageId, child.branch.text, child.branch.start],
        [id, latest, '', null],
    );
    assert.equal(child.branch.snapshot, SUMMARY);
    // The compaction gets the parent up to now and no passage.
    const prompt = calls[0].prompt;
    const compaction = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
    assert.equal('passage' in compaction, false);
    assert.match(JSON.stringify(compaction.messages), /A root partnership/);
    // The child's tutor context has the snapshot and no selected passage.
    const context = tutorSystem(child);
    assert.ok(context.includes(SUMMARY));
    assert.doesNotMatch(context, /selectedPassage/);
    const reopened = new Store(app.path);
    t.after(() => reopened.close());
    const summary = reopened.list().find((s) => s.id === childId);
    assert.deepEqual([summary.parent, summary.messageId, summary.passage], [id, latest, '']);
});

test('a free branch is refused before the first completed reply and when mixed with an anchor', async (t) => {
    const app = await env([]);
    t.after(app.close);
    const { id } = await (await app.post('/api/trees')).json();
    app.store.message(id, 'user', 'What are hyphae?', 'completed');
    assert.equal((await app.post(`/api/trees/${id}/branches`, ask)).status, 400);
    const reply = app.store.message(id, 'assistant', 'Threads of a fungus.', 'completed');
    app.store.pendingSuggestions(id, reply);
    app.store.finishSuggestions(id, reply, [], null, null, ['Fungus']);
    for (const mixed of [
        { messageId: reply, start: 0, end: 7, text: 'Threads' },
        { messageId: reply, groundwork: 'Fungus' },
        { messageId: reply, artifactId: 'visual', label: 'Root' },
        { free: 'yes' },
    ])
        assert.equal(
            (await app.post(`/api/trees/${id}/branches`, { ...ask, ...mixed })).status,
            400,
            JSON.stringify(mixed),
        );
    assert.equal((await app.post(`/api/trees/${id}/branches`, { free: true })).status, 400);
    assert.equal(app.store.list().filter((s) => s.parent === id).length, 0);
});
