import { diagramReply } from '../../server/media/diagrams.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { task, directive, source, complete, open } from '../support/diagram-kit.mjs';

test('an existing database gains the visual kind in place; saved Mermaid artifacts keep rendering after their reply', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tt-visual-migration-')), 'trees.sqlite');
    const old = new Store(path);
    const tree = old.create('Old diagrams'),
        reply = old.message(tree.id, 'assistant', 'Saved reply.', 'completed');
    // The artifacts table as shipped before visuals: no visual kind, no position column.
    old.db
        .exec(`PRAGMA foreign_keys=OFF; DROP TABLE artifacts; CREATE TABLE artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('mermaid','video')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','canceled','interrupted')),
    title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL,
    FOREIGN KEY(message, conversation) REFERENCES messages(id, tree)); CREATE INDEX artifacts_conversation ON artifacts(conversation, created);`);
    old.db
        .prepare(
            "INSERT INTO artifacts(id,conversation,message,kind,status,title,description,source,created) VALUES ('old-diagram',?,?,'mermaid','ready','Old','Old diagram.',?,1)",
        )
        .run(tree.id, reply, source);
    assert.throws(() => old.pendingArtifact(tree.id, reply, 'Visual', 'Too early.', 'visual'));
    old.close();
    const store = new Store(path);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, 1);
    const visual = store.finishArtifact(
        tree.id,
        store.pendingArtifact(tree.id, reply, 'Bracket', 'A bracket.', 'visual', null, 5).id,
        '<svg></svg>',
    );
    assert.deepEqual([visual.kind, visual.status, visual.position], ['visual', 'ready', 5]);
    store.close();
    // Reopen through HTTP on the migrated file.
    const reopened = new Store(path),
        app = createApp({
            store: reopened,
            provider: { generate: async () => {} },
            auth: { status: () => ({ connected: true }) },
        });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    try {
        const saved = await (
            await fetch(`http://127.0.0.1:${app.server.address().port}/api/trees/${tree.id}`)
        ).json();
        assert.deepEqual(
            saved.artifacts.map((a) => [a.id, a.kind, a.status, a.position, a.source]),
            [
                ['old-diagram', 'mermaid', 'ready', null, source],
                [visual.id, 'visual', 'ready', 5, '<svg></svg>'],
            ],
        );
    } finally {
        app.stop();
        reopened.close();
    }
});

test('tolerant parsing ignores unknown keys and trims over-long fields instead of rejecting the request', () => {
    const parsed = diagramReply(
        'Visible answer.\n```rabbithole-diagram\n' +
            JSON.stringify({
                ...task,
                thread: 'must-not-pass',
                color: 'red',
                title: 'T'.repeat(200),
                description: 'd'.repeat(400),
                intent: 'i'.repeat(900),
                excerpt: '  ' + 'x'.repeat(17000),
            }) +
            '\n```',
        true,
    );
    assert.equal(parsed.text, 'Visible answer.');
    assert.equal(parsed.requests.length, 1);
    assert.equal(parsed.requests[0].error, undefined);
    assert.deepEqual(
        parsed.requests[0].task,
        {
            title: 'T'.repeat(120),
            description: 'd'.repeat(280),
            intent: 'i'.repeat(600),
            excerpt: 'x'.repeat(1200),
        },
        'unknown keys never reach the worker',
    );
});

test('failed diagrams offer Retry that reruns the worker from the stored request; a rejected block falls back to the question', async () => {
    let fail = true;
    const workers = [];
    const env = await open({
        generate: async (tree, text, emit) => {
            if (!tree.id) {
                workers.push(JSON.parse(text));
                return complete(emit, fail ? 'not mermaid at all <script>' : source);
            }
            complete(
                emit,
                'Answer.' + directive + '\n```rabbithole-diagram\n{"title": "Broken",\n```',
            );
        },
    });
    try {
        const tree = env.store.create('Retry', 'codex');
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'How do tournaments work?' })
        ).text();
        let [worked, rejected] = env.store.tree(tree.id).artifacts;
        assert.equal(worked.status, 'failed');
        assert.equal(rejected.status, 'failed');
        assert.match(rejected.error, /not valid JSON/);
        assert.equal(workers.length, 1, 'the rejected block never reaches a worker by itself');
        const other = env.store.create('Other', 'codex');
        assert.equal(
            (await env.post(`/api/trees/${other.id}/artifacts/${worked.id}/retry`)).status,
            404,
            'Retry cannot cross conversation ownership',
        );
        assert.equal(
            (
                await fetch(`${env.origin}/api/trees/${tree.id}/artifacts/${worked.id}/retry`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                })
            ).status,
            403,
            'Retry requires CSRF',
        );
        fail = false;
        for (const artifact of [worked, rejected]) {
            const response = await env.post(
                `/api/trees/${tree.id}/artifacts/${artifact.id}/retry`,
                {
                    intent: 'Injected replacement',
                    request: 'Injected replacement',
                },
            );
            assert.equal(response.status, 200);
            const body = await response.json();
            assert.equal(body.status, 'pending');
            assert.equal(body.input, undefined);
        }
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/artifacts/${worked.id}/retry`)).status,
            409,
            'a pending diagram cannot be retried twice',
        );
        await env.app.settled();
        [worked, rejected] = env.store.tree(tree.id).artifacts;
        assert.deepEqual([worked.status, rejected.status], ['ready', 'ready']);
        assert.equal(worked.message, rejected.message);
        assert.deepEqual(
            workers.slice(1),
            [
                task,
                {
                    title: 'Diagram',
                    description: 'The tutor’s diagram request could not be read.',
                    intent: 'How do tournaments work?',
                    excerpt: '',
                },
            ],
            'Retry reruns from each stored request',
        );
        assert.equal(env.store.tree(tree.id).messages.length, 2, 'Retry adds no learner message');
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/artifacts/${worked.id}/retry`)).status,
            409,
        );
    } finally {
        env.close();
    }
});

test('shutdown interrupts a running diagram Retry; reopening only recovers state and explicit Retry reuses its durable request', async () => {
    let entered;
    const started = new Promise((resolve) => {
        entered = resolve;
    });
    const env = await open({
        generate: async (tree, text, emit, save, signal) => {
            if (tree.id)
                return complete(
                    emit,
                    'Answer.\n```rabbithole-diagram\n' +
                        JSON.stringify({ ...task, intent: '' }) +
                        '\n```',
                );
            entered();
            await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true }),
            );
        },
    });
    const tree = env.store.create('Durable Retry', 'codex');
    let failed;
    try {
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'How do tournaments work?' })
        ).text();
        [failed] = (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts;
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`)).status,
            200,
        );
        await started;
        await env.app.stop();
    } finally {
        env.store.close();
    }
    const calls = [];
    const reopened = new Store(env.path);
    const app = createApp({
        store: reopened,
        diagramParse: async () => true,
        provider: {
            generate: async (tree, text, emit) => {
                calls.push(JSON.parse(text));
                complete(emit, source);
            },
        },
        auth: { status: () => ({ connected: true }) },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    try {
        const { csrf, videos } = await (await fetch(`${origin}/api/state`)).json();
        assert.deepEqual(videos, []);
        const [recovered] = (await (await fetch(`${origin}/api/trees/${tree.id}`)).json())
            .artifacts;
        assert.equal(recovered.id, failed.id);
        assert.equal(recovered.status, 'failed');
        assert.match(recovered.error, /interrupted when Rabbithole stopped/);
        assert.equal(recovered.input, undefined);
        assert.deepEqual(calls, [], 'startup and reads never start a worker');
        assert.equal(
            (
                await fetch(`${origin}/api/trees/${tree.id}/artifacts/${failed.id}/retry`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
                    body: '{}',
                })
            ).status,
            200,
        );
        await app.settled();
        const saved = await (await fetch(`${origin}/api/trees/${tree.id}`)).json();
        assert.equal(saved.artifacts[0].status, 'ready');
        assert.deepEqual(calls, [{ ...task, intent: 'How do tournaments work?' }]);
        assert.equal(saved.messages.length, 2);
    } finally {
        await app.stop();
        reopened.close();
    }
});
