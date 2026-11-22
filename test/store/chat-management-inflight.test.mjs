import { until } from '../support/events.mjs';
import { test } from 'node:test';
import { fakeNarration } from '../support/fake-narration.mjs';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { mediaPath } from '../../server/media/videos.mjs';
import { layoutSaver } from '../../src/map/layoutSave.ts';
import { fixture, snapshot } from '../support/chat-management-kit.mjs';
import { videoResponse } from '../support/video-kit.mjs';

test('failure at commit rolls back the complete cascade, root layout and staged files, and does not stop active work', async () => {
    const turns = [];
    const env = await fixture({
        generate: (tree, text, emit, save, signal) =>
            new Promise((resolve) => {
                emit({ type: 'delta', item: 'a', text: 'Partial' });
                turns.push({ resolve, emit, signal });
            }),
    });
    try {
        const response = await env.post(env.child.id, 'messages', { text: 'Running' });
        const before = snapshot(env.store),
            files = env.paths.map((path) => readFileSync(path));
        env.store.db
            .exec(`CREATE TABLE deletion_guard (owner TEXT REFERENCES trees(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER fail_commit AFTER DELETE ON trees WHEN OLD.id='${env.child.id}' BEGIN INSERT INTO deletion_guard VALUES(OLD.id); END;`);
        assert.equal(
            (await env.post(env.root.id, 'delete', { conversation: env.child.id })).status,
            500,
        );
        assert.deepEqual(snapshot(env.store), before);
        env.paths.forEach((path, i) => assert.deepEqual(readFileSync(path), files[i]));
        assert.equal(turns[0].signal.aborted, false);
        assert.equal(!!env.app.jobs.get('reply', env.child.id), true);
        assert.ok(
            readdirSync(join(env.dir, 'videos')).every((name) => !name.includes('.deleting-')),
        );
        turns[0].emit({ type: 'status', status: 'completed' });
        turns[0].resolve();
        await response.text();
    } finally {
        env.close();
    }
});

test('deletion stops only owned active replies and ignores late deltas, thread saves, statuses and rejections', async () => {
    const turns = [];
    const env = await fixture({
        generate: (tree, text, emit, save, signal) =>
            new Promise((resolve, reject) => {
                emit({ type: 'delta', item: 'a', text: 'Partial' });
                turns.push({ tree, emit, save, signal, resolve, reject });
            }),
    });
    try {
        const streams = [];
        for (const t of [env.child, env.grandchild, env.sibling, env.root])
            streams.push(await env.post(t.id, 'messages', { text: 'Running' }));
        assert.equal(
            (await env.post(env.root.id, 'delete', { conversation: env.child.id })).status,
            200,
        );
        for (const turn of turns.slice(0, 2)) {
            assert.equal(turn.signal.aborted, true);
            turn.emit({ type: 'item', item: 'a', text: 'Late text with ```rabbithole-video' });
            turn.save('late-thread', 'late-model');
            turn.emit({ type: 'status', status: 'completed' });
            turn.reject(new Error('Late failure'));
        }
        for (const stream of streams.slice(0, 2)) assert.match(await stream.text(), /interrupted/);
        for (const turn of turns.slice(2)) {
            assert.equal(turn.signal.aborted, false);
            turn.emit({ type: 'status', status: 'completed' });
            turn.resolve();
        }
        for (const stream of streams.slice(2)) assert.match(await stream.text(), /completed/);
        assert.equal(env.store.tree(env.child.id), undefined);
        assert.equal(env.store.tree(env.grandchild.id), undefined);
        assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
        env.close();
    }
});

test('a deleted parent cannot publish an in-flight compaction or model change', async () => {
    for (const action of ['branches', 'model']) {
        let release, signal;
        const provider = {
            models: () =>
                new Promise((resolve) => {
                    release = () => resolve([{ model: 'fixture' }]);
                }),
            generate: (tree, text, emit, save, s) =>
                new Promise((resolve) => {
                    signal = s;
                    release = () => {
                        emit({ type: 'item', item: 'a', text: 'Late summary' });
                        emit({ type: 'status', status: 'completed' });
                        resolve();
                    };
                }),
        };
        const env = await fixture(provider);
        try {
            const messageId = env.store.tree(env.root.id).messages[0].id;
            const pending = env.post(
                env.root.id,
                action,
                action === 'model'
                    ? { model: 'fixture' }
                    : { messageId, start: 0, end: 5, text: 'Roots', question: 'Why?' },
            );
            await until(() => release);
            assert.equal(
                (await env.post(env.root.id, 'delete', { conversation: env.root.id })).status,
                200,
            );
            if (signal) assert.equal(signal.aborted, true);
            release();
            assert.ok((await pending).status >= 400);
            assert.deepEqual(
                env.store.list().map((t) => t.id),
                [env.other.id],
            );
        } finally {
            env.close();
        }
    }
});

test('delete cancels a video worker that ignores abort, removes all work files and cannot publish late media', async () => {
    let worker;
    const directive =
        '\n```rabbithole-video\n' +
        JSON.stringify({
            title: 'Title',
            description: 'Description',
            intent: 'Show roots',
            excerpt: 'Roots',
        }) +
        '\n```';
    const env = await fixture({
        generate: async (tree, text, emit, save, signal) => {
            if (tree.role === 'video')
                return new Promise((resolve) => {
                    worker = { emit, signal, resolve };
                });
            emit({ type: 'item', item: 'a', text: 'Video follows.' + directive });
            emit({ type: 'status', status: 'completed' });
        },
    });
    try {
        await (await env.post(env.child.id, 'messages', { text: 'Make a video' })).text();
        await until(() => worker);
        const artifact = env.store.tree(env.child.id).artifacts.at(-1);
        assert.equal(
            (await env.post(env.root.id, 'delete', { conversation: env.child.id })).status,
            200,
        );
        assert.equal(worker.signal.aborted, true);
        worker.emit({
            type: 'item',
            item: 'a',
            text: '// Description: Late.\nexport default function Video() {}',
        });
        worker.emit({ type: 'status', status: 'completed' });
        worker.resolve();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(env.store.artifact(env.child.id, artifact.id), undefined);
        assert.equal(existsSync(mediaPath(env.dir, artifact.id)), false);
        assert.equal(existsSync(join(env.dir, 'video-work', artifact.id)), false);
    } finally {
        env.close();
    }
});

test('deleted dirty layouts and failed in-flight writes never requeue, while surviving branches retain their pending positions', async () => {
    const env = await fixture();
    let reject,
        count = 0;
    const saver = layoutSaver(
        async (id, batch) => {
            count++;
            if (count === 1)
                return new Promise((_, r) => {
                    reject = r;
                });
            const response = await env.post(id, 'layout', {
                ...batch.layout,
                positions: batch.positions,
            });
            if (!response.ok) throw new Error('Layout rejected');
        },
        () => {},
    );
    try {
        saver.mark(
            env.root.id,
            { folded: [], selected: env.child.id, panel: 'beside' },
            { [env.child.id]: { x: 300, y: 400 } },
        );
        const inFlight = saver.flush();
        assert.equal(
            (await env.post(env.root.id, 'delete', { conversation: env.child.id })).status,
            200,
        );
        saver.discard(env.root.id);
        saver.mark(
            env.root.id,
            { folded: [], selected: env.root.id, panel: 'beside' },
            { [env.sibling.id]: { x: 700, y: 800 } },
        );
        reject(new Error('Late failed write'));
        await inFlight;
        await saver.flush();
        assert.equal(saver.pending().size, 0);
        const sibling = env.store.list().find((t) => t.id === env.sibling.id);
        assert.equal(sibling.x, 700);
        assert.equal(sibling.y, 800);
    } finally {
        saver.dispose();
        env.close();
    }
});

test('delete stops an active video job and removes its partial files without interrupting a sibling job', async () => {
    const voices = [];
    const directive =
        '\n```rabbithole-video\n' +
        JSON.stringify({
            title: 'Video',
            description: 'Description',
            intent: 'Show roots',
            excerpt: 'Roots',
        }) +
        '\n```';
    const env = await fixture(
        {
            generate: async (tree, text, emit) => {
                emit({
                    type: 'item',
                    item: 'a',
                    text:
                        tree.role === 'video'
                            ? videoResponse(
                                  tree,
                                  '// Description: Roots.\n// Narration: "Roots grow."\nexport default function Video() { return null; }',
                              )
                            : 'Video follows.' + directive,
                });
                emit({ type: 'status', status: 'completed' });
            },
        },
        {
            // Narration holds each job until released; the first job is the child's.
            videoNarrate: (script, signal) =>
                new Promise((resolve, reject) => {
                    voices.push({ signal, resolve: async () => resolve(await fakeNarration()) });
                    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                }),
        },
    );
    try {
        for (const [i, t] of [env.child, env.sibling].entries()) {
            await (await env.post(t.id, 'messages', { text: 'Make a video' })).text();
            await until(() => voices.length === i + 1);
        }
        const deleted = env.store.tree(env.child.id).artifacts.at(-1),
            kept = env.store.tree(env.sibling.id).artifacts.at(-1);
        const [deletedJob, keptJob] = voices;
        assert.equal(
            (await env.post(env.root.id, 'delete', { conversation: env.child.id })).status,
            200,
        );
        assert.equal(deletedJob.signal.aborted, true);
        assert.equal(existsSync(join(env.dir, 'video-work', deleted.id)), false);
        assert.equal(existsSync(mediaPath(env.dir, deleted.id)), false);
        assert.equal(keptJob.signal.aborted, false);
        await keptJob.resolve();
        await until(() => env.store.artifact(env.sibling.id, kept.id).status === 'ready');
        assert.ok(
            existsSync(join(env.dir, 'video-work', kept.id, kept.attempt, 'cut-0', 'public')),
        );
    } finally {
        env.close();
    }
});
