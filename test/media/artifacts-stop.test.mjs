import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { task, directive, source, complete, open, until } from '../support/diagram-kit.mjs';

test('Stop and deadline abort diagram workers, bound uncooperative providers and ignore late results', async () => {
    for (const stop of [true, false]) {
        let started, release, workerSignal, lateEmit;
        const pending = new Promise((resolve) => {
            started = resolve;
        });
        const env = await open(
            {
                generate: async (tree, text, emit, save, signal) => {
                    if (tree.id) {
                        save('tutor-session', 'fixture-model');
                        complete(emit, 'A diagram helps.' + directive);
                    } else {
                        workerSignal = signal;
                        lateEmit = emit;
                        started();
                        await new Promise((resolve) => {
                            release = resolve;
                        });
                    }
                },
            },
            { diagramTimeout: stop ? 10000 : 30 },
        );
        try {
            const tree = env.store.create('Abort diagram', 'codex');
            const response = await env.post(`/api/trees/${tree.id}/messages`, { text: 'Draw.' });
            const stream = response.text();
            await pending;
            assert.equal(env.store.tree(tree.id).artifacts[0].status, 'pending');
            assert.equal(
                (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Duplicate.' })).status,
                409,
            );
            if (stop) assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
            await stream;
            const saved = env.store.tree(tree.id);
            assert.equal(workerSignal.aborted, true);
            assert.equal(saved.artifacts[0].status, 'failed');
            assert.match(saved.artifacts[0].error, stop ? /cancelled/ : /timed out/);
            assert.equal(saved.artifacts[0].source, null);
            assert.equal(saved.messages.at(-1).status, stop ? 'interrupted' : 'completed');
            assert.equal(saved.thread, null);
            assert.equal(env.app.jobs.list('reply').length, 0);
            complete(lateEmit, source);
            release();
            await new Promise((resolve) => setImmediate(resolve));
            assert.deepEqual(
                env.store.tree(tree.id),
                saved,
                'late callbacks cannot change finished artifacts or reply',
            );
        } finally {
            release?.();
            env.close();
        }
    }
});

test('stopping a partial directive hides its prefix and discards native session; ordinary code fences retain exact text', async () => {
    let release;
    const code = 'Example:\n```js\nconst rounds = 2;\n```';
    const env = await open({
        generate: async (tree, text, emit, save) => {
            save('native-with-raw-prefix', 'fixture-model');
            if (text === 'Stop halfway.') {
                emit({
                    type: 'delta',
                    item: 'answer',
                    text: 'A useful reply.\n```rabbithole-diag',
                });
                await new Promise((resolve) => {
                    release = resolve;
                });
            } else {
                for (const ch of code) emit({ type: 'delta', item: 'answer', text: ch });
                complete(emit, code);
            }
        },
    });
    try {
        const tree = env.store.create('Prefix', 'codex');
        const response = await env.post(`/api/trees/${tree.id}/messages`, {
            text: 'Stop halfway.',
        });
        const stream = response.text();
        await env.post(`/api/trees/${tree.id}/stop`);
        assert.doesNotMatch(await stream, /rabbithole-diag/);
        const stopped = env.store.tree(tree.id);
        assert.equal(stopped.thread, null);
        assert.equal(stopped.messages.at(-1).text.trim(), 'A useful reply.');
        assert.deepEqual(stopped.artifacts, []);
        release();
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Show normal code.' })
        ).text();
        assert.equal(env.store.tree(tree.id).messages.at(-1).text, code);
    } finally {
        release?.();
        env.close();
    }
});

test('restart fails orphaned pending artifacts once, without replaying generation; chat stays usable', async () => {
    const calls = [];
    const env = await open({
        generate: async (tree, text, emit) => {
            calls.push(tree.id ?? 'worker');
            complete(emit, 'Ordinary follow-up.');
        },
    });
    const tree = env.store.create('Crash recovery', 'codex');
    env.store.message(tree.id, 'user', 'Draw.', 'completed');
    const reply = env.store.message(tree.id, 'assistant', 'Partial explanation.', 'streaming');
    const orphan = env.store.pendingArtifact(
        tree.id,
        reply,
        'Rounds',
        'Winners meet in the final.',
    );
    env.close();
    // A second process opening the same file simulates the crash restart.
    const store = new Store(env.path);
    const recovered = store.tree(tree.id);
    assert.equal(recovered.artifacts.length, 1);
    assert.equal(recovered.artifacts[0].id, orphan.id);
    assert.equal(recovered.artifacts[0].status, 'failed');
    assert.equal(recovered.artifacts[0].source, null);
    assert.match(recovered.artifacts[0].error, /interrupted/);
    assert.equal(recovered.messages.at(-1).status, 'interrupted');
    store.close();
    const again = new Store(env.path);
    assert.deepEqual(again.tree(tree.id), recovered, 'reopening again changes nothing');
    again.close();
    const restored = new Store(env.path);
    const app = createApp({
        store: restored,
        provider: {
            generate: async (t, text, emit) => {
                calls.push(t.id ?? 'worker');
                complete(emit, 'Ordinary follow-up.');
            },
        },
        auth: { status: () => ({ connected: true }) },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    try {
        const origin = `http://127.0.0.1:${app.server.address().port}`;
        const { csrf } = await (await fetch(`${origin}/api/state`)).json();
        const read = await (
            await fetch(`${origin}/api/trees/${tree.id}/artifacts/${orphan.id}`)
        ).json();
        const { input, attempt, ...visible } = recovered.artifacts[0];
        assert.deepEqual(read, visible);
        assert.equal(calls.length, 0, 'reading recovered state never starts inference');
        await (
            await fetch(`${origin}/api/trees/${tree.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
                body: JSON.stringify({ text: 'Continue.' }),
            })
        ).text();
        const after = restored.tree(tree.id);
        assert.deepEqual(
            calls,
            [tree.id],
            'only the tutor reply runs; the failed diagram is not regenerated',
        );
        assert.equal(after.messages.at(-1).status, 'completed');
        assert.deepEqual(after.artifacts, recovered.artifacts, 'no duplicate artifact');
    } finally {
        app.stop();
        restored.close();
    }
});

test('a stopped job cannot publish late results into another conversation running its own diagram', async () => {
    const workers = new Map();
    const env = await open({
        generate: async (tree, text, emit, save, signal) => {
            if (tree.id) {
                complete(emit, `Reply for ${tree.title}.` + directive);
                return;
            }
            // Each worker sees only its frozen task; record its callbacks for later release.
            await new Promise((resolve) =>
                workers.set(workers.size ? 'B' : 'A', { emit, signal, resolve }),
            );
        },
    });
    try {
        const a = env.store.create('A', 'codex'),
            b = env.store.create('B', 'codex');
        const streamA = env
            .post(`/api/trees/${a.id}/messages`, { text: 'Draw A.' })
            .then((r) => r.text());
        await until(() => workers.has('A'));
        const streamB = env
            .post(`/api/trees/${b.id}/messages`, { text: 'Draw B.' })
            .then((r) => r.text());
        await until(() => workers.has('B'));
        assert.equal((await env.post(`/api/trees/${a.id}/stop`)).status, 200);
        const textA = await streamA;
        assert.equal(workers.get('A').signal.aborted, true);
        assert.equal(workers.get('B').signal.aborted, false, 'stopping A leaves B running');
        // A's worker finishes late; B's finishes normally afterwards.
        complete(workers.get('A').emit, 'flowchart TD\n  X[LATE A] --> Y[Leak]');
        workers.get('A').resolve();
        complete(workers.get('B').emit, source);
        workers.get('B').resolve();
        const textB = await streamB;
        const savedA = env.store.tree(a.id),
            savedB = env.store.tree(b.id);
        assert.equal(savedA.artifacts.length, 1);
        assert.equal(savedA.artifacts[0].status, 'failed');
        assert.equal(savedB.artifacts.length, 1);
        assert.equal(savedB.artifacts[0].status, 'ready');
        assert.equal(savedB.artifacts[0].source, source);
        assert.equal(savedB.messages.at(-1).status, 'completed');
        assert.doesNotMatch(JSON.stringify(savedB) + textB, /LATE A|Leak/);
        assert.doesNotMatch(JSON.stringify(savedA) + textA, /LATE A|Leak/);
        assert.doesNotMatch(textA, new RegExp(savedB.artifacts[0].id));
        assert.doesNotMatch(textB, new RegExp(savedA.artifacts[0].id));
        assert.equal(
            (await env.get(`/api/trees/${a.id}/artifacts/${savedB.artifacts[0].id}`)).status,
            404,
        );
        assert.equal(env.app.jobs.list('reply').length, 0);
    } finally {
        for (const w of workers.values()) w.resolve();
        env.close();
    }
});

test('artifacts record where their request block was removed; reply text and passage offsets stay unchanged', async () => {
    const second = { ...task, title: 'Final round' };
    const raw =
        'Winners pair up.\n\n```rabbithole-diagram\n' +
        JSON.stringify(task) +
        '\n```\n\nThen the last two meet.\n```rabbithole-diagram\n' +
        JSON.stringify(second) +
        '\n```\nDone.';
    const provider = {
        generate: async (tree, text, emit) => complete(emit, tree.id ? raw : source),
    };
    const env = await open(provider);
    try {
        const tree = env.store.create('Positions', 'codex');
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain the bracket.' })
        ).text();
        const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
        const reply = saved.messages.at(-1);
        assert.equal(reply.text, 'Winners pair up.\n\n\nThen the last two meet.\nDone.');
        assert.deepEqual(
            saved.artifacts.map((a) => [a.title, a.status, a.position]),
            [
                ['Tournament tree', 'ready', 17],
                ['Final round', 'ready', 42],
            ],
        );
        assert.ok(reply.text.slice(17).startsWith('\n\nThen'));
        assert.equal(reply.text.slice(42), '\nDone.');
        // A passage chosen after the blocks still slices the same stored text.
        const start = reply.text.indexOf('last two'),
            branch = await env.post(`/api/trees/${tree.id}/branches`, {
                messageId: reply.id,
                start,
                end: start + 8,
                text: 'last two',
                question: 'Why two?',
            });
        assert.equal(branch.status, 201);
    } finally {
        env.close();
    }
});
