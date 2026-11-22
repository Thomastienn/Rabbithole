import { test } from 'node:test';
import { videoResponse } from '../support/video-kit.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { start } from '../support/usage-kit.mjs';

// The learning tree is looked up live, so deletion drops it while the counts stay.
const bare = (list) => list.map(({ tree, treeTitle, ...e }) => e);

test('usage history migrates once, keeps attribution and unavailable calls, survives restart and deletion, filters ranges and never duplicates', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-usage-history-'));
    let env = await start(dir);
    t.after(async () => {
        await env.close();
    });
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain brackets' });
    // Simulate a database from before durable history: only per-message usage exists.
    await env.close();
    const old = new Store(join(dir, 'trees.sqlite'));
    const reply = old.tree(tree.id).messages.find((m) => m.role === 'assistant');
    old.db.exec('DROP TABLE usage_events');
    old.db
        .prepare("UPDATE messages SET usage=json_set(usage,'$.at',?) WHERE id=?")
        .run(new Date(2025, 11, 31, 23, 30).getTime(), reply.id);
    old.close();

    env = await start(dir);
    const migrated = (await env.get('/api/usage')).events;
    assert.equal(migrated[0].tree, tree.id, 'a migrated reply still finds its learning tree');
    // Historical provider/model were never saved, so they stay unknown.
    assert.deepEqual(bare(migrated), [
        {
            at: new Date(2025, 11, 31, 23, 30).getTime(),
            provider: null,
            model: null,
            task: 'chat',
            input: 103,
            output: 7,
            cacheRead: 40,
            reasoning: null, // older rows never recorded reasoning
        },
    ]);

    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Again, no usage' });
    const codex = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${codex.id}/model`, { provider: 'codex', model: 'fixture-model' });
    await env.post(`/api/trees/${codex.id}/messages`, { text: 'Explain rounds' });
    const events = (await env.get('/api/usage')).events;
    assert.deepEqual(
        events.map((e) => e.tree),
        [tree.id, tree.id, codex.id],
    );
    assert.deepEqual(
        bare(events.slice(1)).map(({ at, ...e }) => e),
        [
            {
                provider: 'claude',
                model: events[1].model,
                task: 'chat',
                input: null,
                output: null,
                cacheRead: null,
                reasoning: null,
            },
            {
                provider: 'codex',
                model: 'fixture-model',
                task: 'chat',
                input: 30,
                output: 9,
                cacheRead: 20,
                reasoning: 4, // Codex reasoning output, part of output
            },
        ],
    );
    // Codex reports cached input inside its input total; history stores disjoint counts so totals never double count.
    assert.equal(events[2].input + events[2].cacheRead, 50);

    // Repeated completion and reopening do not add rows.
    const codexReply = (await env.get(`/api/trees/${codex.id}`)).messages.at(-1).id;
    env.store.record(
        `chat:${codexReply}`,
        'chat',
        { provider: 'codex', model: 'fixture-model' },
        { input: 30, output: 9, cacheRead: 20 },
    );
    await env.close();
    env = await start(dir);
    assert.deepEqual((await env.get('/api/usage')).events, events);

    // Year boundary: the migrated call belongs to 2025 only.
    const range = async (a, b) =>
        (await env.get(`/api/usage?from=${a.getTime()}&to=${b.getTime()}`)).events.length;
    assert.equal(await range(new Date(2025, 0, 1), new Date(2026, 0, 1)), 1);
    assert.equal(await range(new Date(2024, 0, 1), new Date(2025, 0, 1)), 0);
    assert.equal(
        await range(new Date(2026, 0, 1), new Date(2027, 0, 1)),
        events.filter((e) => new Date(e.at).getFullYear() === 2026).length,
    );
    assert.equal((await env.get('/api/usage')).first, events[0].at);

    // Deleting learning trees removes content and reply links, but never usage history.
    for (const id of [tree.id, codex.id])
        assert.equal(
            (
                await fetch(env.origin + `/api/trees/${id}/delete`, {
                    method: 'POST',
                    headers: env.headers,
                    body: JSON.stringify({ conversation: id }),
                })
            ).status,
            200,
        );
    const kept = (await env.get('/api/usage')).events;
    assert.deepEqual(bare(kept), bare(events));
    assert.ok(kept.every((e) => e.tree === null && e.treeTitle === null));
    assert.deepEqual(
        env.store.db
            .prepare('PRAGMA table_info(usage_events)')
            .all()
            .map((c) => c.name),
        [
            'id',
            'at',
            'provider',
            'model',
            'task',
            'input',
            'output',
            'cacheRead',
            'message',
            'stage',
            'cut',
            'reasoning',
        ],
    );
    assert.ok(
        !JSON.stringify(env.store.db.prepare('SELECT * FROM usage_events').all()).match(
            /brackets|rounds|Authoritative/,
        ),
    );
    await env.close();
    env = await start(dir);
    assert.deepEqual((await env.get('/api/usage')).events, kept);
});

test('background compaction and diagram calls record actual provider/model per logical call; failed calls keep reported counts and unreported stay unavailable', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-usage-background-'));
    let env = await start(dir);
    t.after(async () => {
        await env.close();
    });
    const claude = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${claude.id}/messages`, { text: 'Show a diagram fixture request' });
    const reply = (await env.get(`/api/trees/${claude.id}`)).messages.at(-1);
    assert.equal((await env.get(`/api/trees/${claude.id}`)).artifacts[0].status, 'ready');
    // Two explicit branch attempts are two logical compaction calls.
    for (let i = 0; i < 2; i++)
        JSON.parse(
            await env.post(`/api/trees/${claude.id}/branches`, {
                messageId: reply.id,
                start: 2,
                end: 9,
                text: 'bracket',
                question: 'Why brackets?',
            }),
        );
    await env.post(`/api/trees/${claude.id}/messages`, { text: 'Now claude fails' });
    const codex = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${codex.id}/model`, { provider: 'codex', model: 'fixture-model' });
    await env.post(`/api/trees/${codex.id}/messages`, { text: 'Explain, no usage' });
    await env.post(`/api/trees/${codex.id}/messages`, { text: 'fail' });

    const claudeUsage = { input: 103, output: 7, cacheRead: 40, reasoning: null },
        codexUsage = { input: 30, output: 9, cacheRead: 20, reasoning: 4 },
        none = { input: null, output: null, cacheRead: null, reasoning: null };
    const events = (await env.get('/api/usage')).events;
    assert.deepEqual(
        bare(events).map(({ at, ...e }) => e),
        [
            { provider: 'claude', model: 'sonnet', task: 'diagram', ...claudeUsage },
            { provider: 'claude', model: 'sonnet', task: 'chat', ...claudeUsage },
            { provider: 'claude', model: 'haiku', task: 'compaction', ...claudeUsage },
            { provider: 'claude', model: 'haiku', task: 'compaction', ...claudeUsage },
            { provider: 'claude', model: 'sonnet', task: 'chat', ...claudeUsage }, // failed run still reported its usage
            { provider: 'codex', model: 'fixture-model', task: 'chat', ...none },
            { provider: 'codex', model: 'fixture-model', task: 'chat', ...codexUsage }, // failed turn, Codex cache counted once
        ],
    );
    assert.equal((await env.get(`/api/trees/${claude.id}`)).messages.at(-1).status, 'failed');
    // Restart and deletion keep the same history; no rows hold content.
    await env.close();
    env = await start(dir);
    assert.deepEqual((await env.get('/api/usage')).events, events);
    for (const id of [claude.id, codex.id])
        await fetch(env.origin + `/api/trees/${id}/delete`, {
            method: 'POST',
            headers: env.headers,
            body: JSON.stringify({ conversation: id }),
        });
    assert.deepEqual(bare((await env.get('/api/usage')).events), bare(events));
    assert.ok(
        !JSON.stringify(env.store.db.prepare('SELECT * FROM usage_events').all()).match(
            /bracket|round|Authoritative|flowchart/i,
        ),
    );
});

test('video worker attempts record their own reported usage, including failed and canceled attempts; saving renders nothing', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-usage-video-'));
    const store = new Store(join(dir, 'trees.sqlite'));
    const task = {
        title: 'Winners',
        description: 'Two winners meet.',
        intent: 'Animate winners.',
        excerpt: 'A and B advance.',
    };
    const source =
        '// Description: Two boxes meet.\n// Narration: "Winners advance."\nimport { AbsoluteFill } from \'remotion\';\nexport const durationInFrames = 30;\nexport default () => <AbsoluteFill>A + B</AbsoluteFill>;';
    const done = (emit, text) => {
        emit({ type: 'item', item: 'a', text });
        emit({ type: 'status', status: 'completed' });
    };
    let attempt = 0,
        renders = 0,
        holding;
    const held = new Promise((r) => {
        holding = r;
    });
    const provider = {
        models: async () => [{ model: 'worker-model', isDefault: true }],
        generate: async (tree, text, emit, saveThread, signal) => {
            if (tree.role !== 'video')
                return done(emit, 'Here.\n```rabbithole-video\n' + JSON.stringify(task) + '\n```');
            if (text.includes('silent')) return emit({ type: 'status', status: 'failed' }); // no usage reported: never estimated
            emit({ type: 'usage', usage: { input: 10 + attempt, output: 5, cacheRead: 2 } });
            if (attempt++ === 0) return emit({ type: 'status', status: 'failed' });
            if (text.includes('hold')) {
                holding();
                await new Promise((r) => signal.addEventListener('abort', r, { once: true }));
                return emit({ type: 'status', status: 'interrupted' });
            }
            done(emit, videoResponse(tree, source));
        },
    };
    const render = async (workspace, output) => {
        renders++;
        writeFileSync(
            output,
            Buffer.concat([
                Buffer.from([0, 0, 0, 24]),
                Buffer.from('ftypisom'),
                Buffer.alloc(4096, 1),
            ]),
        );
        return { durationInFrames: 75, fps: 30 };
    };
    const app = createApp({
        store,
        provider,
        dir,
        videoSnapshot: async () => {},
        videoRender: render,
        videoNarrate: fakeNarration,
        auth: { status: () => ({ connected: true }) },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`,
        { csrf } = await (await fetch(origin + '/api/state')).json();
    const post = (path, body = {}) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const tree = store.create('Video', 'codex', 'worker-model');
    const settle = async (id, status) => {
        await app.settled(id);
        assert.equal(store.artifact(tree.id, id).status, status);
    };
    const video = async (text) => {
        await (await post(`/api/trees/${tree.id}/messages`, { text })).text();
        return store.tree(tree.id).artifacts.at(-1).id;
    };

    const first = await video('Make a video of winners');
    await settle(first, 'failed');
    await post(`/api/trees/${tree.id}/artifacts/${first}/retry`);
    await settle(first, 'ready');
    const hold = await video('Make a video, hold');
    await held; // cancel once the worker call is in flight
    await post(`/api/trees/${tree.id}/artifacts/${hold}/cancel`);
    await settle(hold, 'canceled');
    const silent = await video('Make a video, silent');
    await settle(silent, 'failed');
    await app.settled();

    const videos = store
        .usageEvents()
        .events.filter((e) => e.task === 'video')
        .map(({ at, tree, treeTitle, ...e }) => e);
    const by = { provider: 'codex', model: 'worker-model', task: 'video', reasoning: null };
    assert.deepEqual(videos, [
        { ...by, input: 10, output: 5, cacheRead: 2 }, // failed attempt
        { ...by, input: 11, output: 5, cacheRead: 2 }, // explicit retry: its own attempt
        { ...by, input: 12, output: 5, cacheRead: 2 }, // cut in the explicit retry
        { ...by, input: 13, output: 5, cacheRead: 2 }, // canceled attempt keeps what it reported
        { ...by, input: null, output: null, cacheRead: null },
    ]);
    assert.equal(renders, 0);
    // Stage and cut are kept per call; the per-video breakdown covers only the current attempt.
    assert.deepEqual(
        store.db
            .prepare("SELECT stage,cut FROM usage_events WHERE task='video' ORDER BY rowid")
            .all()
            .map((r) => [r.stage, r.cut]),
        [
            ['plan', null],
            ['plan', null],
            ['cut', 1],
            ['plan', null],
            ['plan', null],
        ],
    );
    // An older row (no stage) and an unreported repair in the current attempt.
    const { attempt: current } = store.artifact(tree.id, first);
    store.record(`video:${current}:old`, 'video', by, { input: 1, output: 1, cacheRead: 0 });
    store.record(`video:${current}:lost`, 'video', by, null, undefined, null, 'repair', 1);
    const rows = (
        stage,
        input,
        output,
        cacheRead,
        calls = 1,
        reported = calls,
        reasoning = null,
    ) => ({
        stage,
        model: 'worker-model',
        calls,
        reported,
        input,
        output,
        cacheRead,
        reasoning,
    });
    assert.deepEqual(
        store.videoUsage(tree.id, first).map((r) => ({ ...r })),
        [
            rows('plan', 11, 5, 2),
            rows('cut', 12, 5, 2),
            rows(null, 1, 1, 0),
            rows('repair', 0, 0, 0, 1, 0),
        ],
    );
    assert.deepEqual(
        await (await fetch(origin + `/api/trees/${tree.id}/artifacts/${first}/usage`)).json(),
        store.videoUsage(tree.id, first).map((r) => ({ ...r })),
    );
    // The chat provider here reports nothing, so its rows stay unavailable rather than borrowing worker counts.
    assert.ok(
        store
            .usageEvents()
            .events.filter((e) => e.task === 'chat')
            .every((e) => e.input === null),
    );
});

test('usage events name the learning tree their message belongs to; branches roll up to their root', (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-usage-trees-')), 'trees.sqlite'));
    t.after(() => store.close());
    const root = store.create('Fungi', 'codex');
    const answer = store.message(root.id, 'assistant', 'Roots trade sugar.', 'completed');
    const child = store.branch(
        root,
        { messageId: answer, start: 0, end: 5, text: 'Roots', question: 'Why roots?' },
        'context',
    );
    const deep = store.message(child.id, 'assistant', 'Because.', 'completed');
    const counts = { input: 1, output: 1, cacheRead: 0 };
    store.record(`chat:${answer}`, 'chat', {}, counts, 1);
    store.record(`chat:${deep}`, 'chat', {}, counts, 2);
    store.record(`suggestions:${deep}`, 'suggestions', {}, counts, 3);
    store.record('title-call', 'title', {}, counts, 4);
    assert.deepEqual(
        store.usageEvents().events.map((e) => [e.tree, e.treeTitle]),
        [
            [root.id, 'Fungi'],
            [root.id, 'Fungi'],
            [root.id, 'Fungi'],
            [null, null], // background work carries no message
        ],
    );
});
