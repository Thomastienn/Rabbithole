import { until, observeStore, observeProvider } from '../support/events.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// A turn ends when the reply text ends; visuals keep generating on their own (TreeTutor-got.3).
const task = {
    title: 'Rounds',
    description: 'Two winners meet in the final.',
    intent: 'Show the winners advancing.',
    excerpt: 'Winners advance.',
};
const reply =
    'Winners advance to the final.\n```rabbithole-visual\n' + JSON.stringify(task) + '\n```';
const source =
    '<svg viewBox="0 0 200 80" role="img" aria-label="Two winners"><text x="10" y="35">A → Final ← B</text></svg>';
const complete = (emit, text) => {
    emit({ type: 'item', item: 'answer', text });
    emit({ type: 'status', status: 'completed' });
};

async function open(visual, options = {}) {
    const calls = { suggest: [], chat: [] },
        models = async () => [{ model: 'smart', isDefault: true, efforts: ['low', 'high'] }];
    const claude = {
        models,
        generate: async (tree, text, emit, _save, signal) => {
            if (tree.instructions?.startsWith('You mark')) {
                calls.suggest.push(text);
                return complete(emit, '{"passages":[]}');
            }
            if (text.startsWith('{"request"')) return visual(emit, signal);
            calls.chat.push(text);
            return complete(
                emit,
                calls.chat.length === 1 ? reply : 'The learner studies tournament rounds.',
            );
        },
    };
    const store = observeStore(
        new Store(join(mkdtempSync(join(tmpdir(), 'tt-detach-')), 'trees.sqlite')),
    );
    const app = createApp({
        store,
        providers: { claude: observeProvider(claude) },
        defaultProvider: 'claude',
        auth: { status: () => ({ connected: true }) },
        suggestions: true,
        ...options,
    });
    await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${app.server.address().port}`,
        get = async (path) => (await fetch(origin + path)).json(),
        { csrf } = await get('/api/state');
    const post = (path, body = {}) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    await post('/api/settings/smart', {
        model: { provider: 'claude', model: 'smart' },
        followEffort: false,
        effort: 'high',
    });
    const tree = store.create('Rounds', 'claude', 'smart');
    return {
        calls,
        app,
        get,
        post,
        tree,
        close: async () => {
            await app.stop();
            store.close();
        },
    };
}

test('done arrives with the text while a held visual is pending; branching and suggestions do not wait; release shows it via polling', async () => {
    let release;
    const held = new Promise((r) => {
        release = r;
    });
    const env = await open(async (emit) => {
        await held;
        complete(emit, source);
    });
    try {
        const stream = await (
            await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw the rounds' })
        ).text();
        assert.match(stream.trim().split('\n\n').at(-1), /"type":"done","status":"completed"/);
        let state = await env.get('/api/state');
        assert.ok(!state.active.includes(env.tree.id), 'tree is not active after done');
        assert.ok(state.videos.includes(env.tree.id), 'pending visual keeps the client polling');
        let saved = await env.get(`/api/trees/${env.tree.id}`);
        assert.equal(saved.messages.at(-1).status, 'completed');
        assert.equal(saved.artifacts[0].status, 'pending');
        await until(() => env.calls.suggest.length === 1);
        assert.doesNotMatch(
            env.calls.suggest[0],
            /rabbithole-visual|Two winners meet/,
            'suggestions ignore visual content',
        );
        const branch = await env.post(`/api/trees/${env.tree.id}/branches`, {
            messageId: saved.messages.at(-1).id,
            start: 0,
            end: 7,
            text: 'Winners',
            question: 'Who wins?',
        });
        assert.notEqual(branch.status, 409);
        assert.equal(branch.status, 201);
        assert.equal(
            (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0].status,
            'pending',
            'visual still held',
        );
        release();
        await until(
            async () =>
                (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0].status === 'ready',
        );
        saved = await env.get(`/api/trees/${env.tree.id}`);
        assert.equal(saved.artifacts[0].source, source);
        await env.app.settled();
        assert.ok(!(await env.get('/api/state')).videos.includes(env.tree.id));
    } finally {
        release();
        await env.close();
    }
});

test('a visual that times out after the turn ended fails with its card while the reply stays completed', async () => {
    const env = await open(
        (_emit, signal) =>
            new Promise((_, reject) =>
                signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
            ),
        { visualTimeout: 3000 },
    );
    try {
        const stream = await (
            await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw the rounds' })
        ).text();
        assert.match(stream, /"type":"done","status":"completed"/);
        assert.equal((await env.get(`/api/trees/${env.tree.id}`)).artifacts[0].status, 'pending');
        await until(
            async () =>
                (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0].status === 'failed',
        );
        const saved = await env.get(`/api/trees/${env.tree.id}`);
        assert.match(saved.artifacts[0].error, /timed out/);
        assert.equal(saved.messages.at(-1).status, 'completed');
    } finally {
        await env.close();
    }
});
