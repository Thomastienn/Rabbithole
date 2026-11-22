import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.mjs';
import { tutorSystem } from '../../server/media/tutor-instructions.mjs';
import { open, complete } from '../support/diagram-kit.mjs';
import { discussion } from '../fixtures/discussion.mjs';

const SUMMARY = 'The classmates weighed whether the fungus is a fair trading partner.';
const seed = (store, conversation) => {
    store.message(conversation, 'user', 'Discuss Hyphae.', 'completed');
    const message = store.message(conversation, 'assistant', 'Here is a discussion.', 'completed');
    const artifact = store.pendingArtifact(
        conversation,
        message,
        'Discussion',
        '',
        'discussion',
        null,
        21,
    );
    return store.finishArtifact(conversation, artifact.id, JSON.stringify(discussion));
};
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
// Theo's line: "Is the fungus a parasite the plant puts up with?"
const pick = (artifact, extra = {}) => ({
    messageId: artifact.message,
    artifactId: artifact.id,
    line: 0,
    start: 7,
    end: 13,
    text: 'fungus',
    question: 'Is it a parasite?',
    ...extra,
});

test("branching from a classmate's open line saves the line passage and inherits the discussion lines", async (t) => {
    const calls = [];
    const app = await env(calls);
    t.after(app.close);
    const { id } = await (await app.post('/api/trees')).json();
    const artifact = seed(app.store, id);
    const response = await app.post(`/api/trees/${id}/branches`, pick(artifact));
    assert.equal(response.status, 201);
    const childId = (await response.json()).id;
    await app.app.settled();
    const child = await (await app.get(`/api/trees/${childId}`)).json();
    const lines = discussion.lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
    assert.deepEqual(
        { ...child.branch, snapshot: undefined },
        {
            parent: id,
            messageId: artifact.message,
            artifactId: artifact.id,
            line: 0,
            start: 7,
            end: 13,
            text: 'fungus',
            speaker: 'Theo',
            discussion: lines,
            question: 'Is it a parasite?',
            snapshot: undefined,
        },
    );
    // The compaction sees the open discussion's lines and the passage.
    const compaction = JSON.parse(calls[0].prompt.slice(calls[0].prompt.indexOf('\n') + 1));
    assert.equal(compaction.passage, 'fungus');
    assert.match(JSON.stringify(compaction.messages), /Is the fungus a parasite/);
    // The child's tutor context carries the passage, its speaker and the lines.
    const context = tutorSystem({ ...child, branch: child.branch });
    assert.match(context, /"selectedPassage":"fungus"/);
    assert.match(context, /"passageSpeaker":"Theo"/);
    assert.ok(context.includes(JSON.stringify(lines)));
    // Survives reload: the map summary keeps the line, offsets and no visual fields.
    const reopened = new Store(app.path);
    const summary = reopened.list().find((s) => s.id === childId);
    assert.deepEqual(
        [
            summary.artifactId,
            summary.line,
            summary.start,
            summary.end,
            summary.passage,
            summary.label,
        ],
        [artifact.id, 0, 7, 13, 'fungus', undefined],
    );
    reopened.close();
});

test('a closed discussion branch inherits its paragraph instead of the lines', async (t) => {
    const calls = [];
    const app = await env(calls);
    t.after(app.close);
    const { id } = await (await app.post('/api/trees')).json();
    const artifact = seed(app.store, id);
    await (await app.post(`/api/trees/${id}/messages`, { text: 'Next?' })).text();
    assert.equal(app.store.discussion(id, artifact.id).summary, SUMMARY);
    const response = await app.post(`/api/trees/${id}/branches`, pick(artifact));
    assert.equal(response.status, 201);
    await app.app.settled();
    const child = await (await app.get(`/api/trees/${(await response.json()).id}`)).json();
    assert.equal(child.branch.discussion, SUMMARY);
    assert.match(tutorSystem(child), new RegExp(SUMMARY));
    assert.doesNotMatch(tutorSystem(child), /Is the fungus a parasite/);
});

test('discussion passages must match one saved line of a ready discussion', async (t) => {
    const app = await env([]);
    t.after(app.close);
    const { id } = await (await app.post('/api/trees')).json();
    const artifact = seed(app.store, id);
    for (const change of [
        { text: 'parasite' },
        { line: 9 },
        { line: '0' },
        { start: 13, end: 7 },
        { artifactId: 'missing' },
        { messageId: 'other' },
        { suggestion: true },
    ])
        assert.equal(
            (await app.post(`/api/trees/${id}/branches`, pick(artifact, change))).status,
            400,
            JSON.stringify(change),
        );
    assert.equal(app.store.list().filter((s) => s.parent === id).length, 0);
});

test('databases without discussion branch columns gain them on open', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { DatabaseSync } = await import('node:sqlite');
    const path = join(mkdtempSync(join(tmpdir(), 'tt-discussion-branch-')), 'trees.sqlite');
    new Store(path).close();
    const old = new DatabaseSync(path);
    for (const column of ['discussion', 'speaker', 'line'])
        old.exec(`ALTER TABLE branches DROP COLUMN ${column}`);
    old.close();
    const store = new Store(path);
    const columns = store.db
        .prepare('PRAGMA table_info(branches)')
        .all()
        .map((c) => c.name);
    store.close();
    assert.ok(['line', 'speaker', 'discussion'].every((c) => columns.includes(c)));
});
