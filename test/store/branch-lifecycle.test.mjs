import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

async function fixture(
    path = join(mkdtempSync(join(tmpdir(), 'rabbithole-lifecycle-')), 'trees.sqlite'),
) {
    const store = new Store(path),
        turns = [];
    const app = createApp({
        store,
        auth: { status: () => ({ connected: true }) },
        provider: {
            generate: (tree, text, emit, save, signal) =>
                new Promise((resolve, reject) => {
                    save(`thread-${tree.id}`, 'fixture-model');
                    emit({ type: 'delta', item: 'answer', text: `${text} partial` });
                    turns.push({ tree, emit, save, signal, resolve, reject });
                }),
        },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (id, action, body = {}) =>
        fetch(`${origin}/api/trees/${id}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const root = store.create('Root', 'codex');
    const messageId = store.message(root.id, 'assistant', 'Roots exchange nutrients.', 'completed');
    const branches = ['A', 'B'].map((question) =>
        store.branch(
            root,
            { messageId, start: 0, end: 5, text: 'Roots', question },
            `Fixed ${question} context`,
        ),
    );
    return {
        path,
        store,
        turns,
        app,
        post,
        branches,
        close: () => {
            app.stop();
            store.close();
        },
    };
}

test('stop freezes only its branch; stale callbacks cannot alter a stopped or newer turn', async () => {
    const env = await fixture();
    const [a, b] = env.branches;
    try {
        const ar = await env.post(a.id, 'messages', { text: 'A' });
        const br = await env.post(b.id, 'messages', { text: 'B' });
        const [old, sibling] = env.turns;
        await env.post(a.id, 'stop');
        assert.equal(old.signal.aborted, true);
        assert.equal(sibling.signal.aborted, false);
        assert.equal(env.store.tree(a.id).messages.at(-1).status, 'interrupted');
        assert.equal(!!env.app.jobs.get('reply', a.id), false);
        assert.equal(!!env.app.jobs.get('reply', b.id), true);
        assert.match(await ar.text(), /"status":"interrupted"/);
        const retry = await env.post(a.id, 'messages', { text: 'A retry' });
        assert.equal(retry.status, 200);
        old.emit({ type: 'item', item: 'answer', text: 'Late replacement' });
        old.emit({ type: 'status', status: 'completed' });
        old.save('stale-thread', 'stale-model');
        old.reject(new Error('Late abort failure'));
        await new Promise((resolve) => setImmediate(resolve));
        // The provider gets the turn's signal combined with its end-of-reply signal, so compare liveness.
        assert.equal(
            env.app.jobs.get('reply', a.id).controller.signal.aborted,
            false,
            'the retry still owns the branch',
        );
        assert.equal(env.turns[2].signal.aborted, false);
        assert.equal(env.store.tree(a.id).thread, `thread-${a.id}`);
        assert.deepEqual(
            env.store
                .tree(a.id)
                .messages.filter((m) => m.role === 'assistant')
                .map((m) => [m.text, m.status]),
            [
                ['A partial', 'interrupted'],
                ['A retry partial', 'streaming'],
            ],
        );
        for (const turn of [sibling, env.turns[2]]) {
            turn.emit({ type: 'status', status: 'completed' });
            turn.resolve();
        }
        for (const response of [br, retry])
            assert.match(await response.text(), /"status":"completed"/);
    } finally {
        env.close();
    }
});

test('one failed branch preserves partial history while sibling completes and both retry', async () => {
    const env = await fixture();
    const [a, b] = env.branches;
    try {
        const ar = await env.post(a.id, 'messages', { text: 'A' });
        const br = await env.post(b.id, 'messages', { text: 'B' });
        env.turns[0].reject(new Error('Fixture request failure'));
        assert.match(await ar.text(), /"status":"failed"/);
        const before = env.store.tree(a.id);
        env.turns[0].emit({ type: 'delta', item: 'answer', text: 'Late failed text' });
        env.turns[0].save('failed-thread');
        assert.deepEqual(env.store.tree(a.id), before);
        assert.equal(!!env.app.jobs.get('reply', b.id), true);
        env.turns[1].emit({ type: 'status', status: 'completed' });
        env.turns[1].resolve();
        assert.match(await br.text(), /"status":"completed"/);
        for (const branch of [a, b]) {
            const response = await env.post(branch.id, 'messages', {
                text: `${branch.title} retry`,
            });
            const turn = env.turns.at(-1);
            assert.deepEqual(
                turn.tree.messages.map((m) => m.text),
                [branch.title, `${branch.title} partial`],
            );
            turn.emit({ type: 'status', status: 'completed' });
            turn.resolve();
            await response.text();
        }
        assert.equal(env.store.tree(a.id).messages[1].status, 'failed');
        assert.equal(env.store.tree(b.id).messages[1].status, 'completed');
    } finally {
        env.close();
    }
});

test('shutdown freezes two active branch checkpoints before storage closes; restart never replays', async () => {
    const env = await fixture();
    const [a, b] = env.branches;
    await env.post(a.id, 'messages', { text: 'A' });
    await env.post(b.id, 'messages', { text: 'B' });
    env.close();
    const recovered = await fixture(env.path);
    try {
        for (const [branch, text] of [
            [a, 'A'],
            [b, 'B'],
        ]) {
            const saved = recovered.store.tree(branch.id);
            assert.deepEqual(
                saved.messages.map((m) => [m.text, m.status]),
                [
                    [text, 'completed'],
                    [`${text} partial`, 'interrupted'],
                ],
            );
            assert.deepEqual(saved.branch, branch.branch);
        }
        assert.equal(recovered.turns.length, 0);
        assert.equal(recovered.app.jobs.list('reply').length, 0);
        for (const turn of env.turns) {
            assert.equal(turn.signal.aborted, true);
            turn.emit({ type: 'item', item: 'answer', text: 'After shutdown' });
            turn.save('after-shutdown');
            turn.resolve();
        }
        await new Promise((resolve) => setImmediate(resolve));
        const response = await recovered.post(a.id, 'messages', { text: 'Continue after restart' });
        assert.equal(recovered.turns.length, 1);
        assert.equal(recovered.turns[0].tree.messages[1].status, 'interrupted');
        recovered.turns[0].emit({ type: 'status', status: 'completed' });
        recovered.turns[0].resolve();
        assert.match(await response.text(), /"status":"completed"/);
        assert.equal(recovered.store.tree(b.id).messages.at(-1).status, 'interrupted');
    } finally {
        recovered.close();
    }
});

test('process crash during two branch turns recovers persisted partials without inference replay', async () => {
    const seed = await fixture();
    const {
        path,
        branches: [a, b],
    } = seed;
    seed.close();
    const child = spawn(
        process.execPath,
        [
            '--input-type=module',
            '-e',
            `
    import { Store } from './server/store.mjs';
    import { createApp } from './server/app.mjs';
    const store = new Store(process.argv[1]);
    const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {
      generate: async (tree, text, emit, save) => {
        save('crash-thread-' + tree.id, 'fixture-model');
        emit({ type: 'delta', item: 'answer', text: text + ' checkpoint' });
        await new Promise(() => {});
      }
    } });
    app.server.listen(0, '127.0.0.1', () => process.send(app.server.address().port));
  `,
            path,
        ],
        { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
    );
    try {
        const [port] = await once(child, 'message');
        const origin = `http://127.0.0.1:${port}`;
        const { csrf } = await (await fetch(`${origin}/api/state`)).json();
        for (const branch of [a, b]) {
            const response = await fetch(`${origin}/api/trees/${branch.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
                body: JSON.stringify({ text: branch.title }),
            });
            response.text().catch(() => {});
            const saved = await (await fetch(`${origin}/api/trees/${branch.id}`)).json();
            assert.deepEqual(
                saved.messages.map((m) => [m.text, m.status]),
                [
                    [branch.title, 'completed'],
                    [`${branch.title} checkpoint`, 'streaming'],
                ],
            );
        }
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
        const recovered = await fixture(path);
        try {
            assert.equal(recovered.turns.length, 0);
            assert.equal(recovered.app.jobs.list('reply').length, 0);
            for (const branch of [a, b]) {
                const saved = recovered.store.tree(branch.id);
                assert.equal(saved.thread, `crash-thread-${branch.id}`);
                assert.deepEqual(saved.branch, branch.branch);
                assert.deepEqual(
                    saved.messages.map((m) => [m.text, m.status]),
                    [
                        [branch.title, 'completed'],
                        [`${branch.title} checkpoint`, 'interrupted'],
                    ],
                );
            }
        } finally {
            recovered.close();
        }
    } finally {
        if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit');
            child.kill('SIGKILL');
            await exited;
        }
    }
});
