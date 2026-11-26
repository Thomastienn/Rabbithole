import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { briefPrompt } from '../../server/http/jobs/briefs.mjs';
import { taskOf } from '../support/model-task.mjs';

const PREFIX = briefPrompt('', '').split('{')[0];
const REPLY = 'A **[[mutex]]** guards the shared counter.\n[[end]]';
// Quick thinking names the concept of the tutor's marked suggestion.
const named = JSON.stringify({
    suggestions: [{ text: 'mutex', concept: 'Mutex' }],
    concepts: [{ name: 'Mutex', topics: ['Concurrency'] }],
});

test('a brief explanation is written once, shared, saved with usage, counted once when opened, and never reaches the tutor', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'rabbithole-briefs-')), 'trees.sqlite'),
    );
    let write;
    const prompts = [],
        tutor = [],
        logs = [];
    const quick = {
        models: async () => [{ model: 'quick-model', efforts: ['low'] }],
        generate: async (tree, text, emit) => {
            if (tree.role === 'brief' && taskOf(text).terms)
                throw new Error('Fixture batch failure');
            if (tree.role === 'suggestions') {
                emit({ type: 'item', item: 'answer', text: named });
                return emit({ type: 'status', status: 'completed' });
            }
            if (tree.role !== 'brief') return; // title calls
            prompts.push(text);
            await write(emit);
        },
    };
    const chat = {
        generate: async (tree, text, emit) => {
            tutor.push(tree);
            emit({ type: 'item', item: 'answer', text: REPLY });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const app = createApp({
        store,
        providers: { codex: chat, claude: quick },
        auth: { status: () => ({ connected: true }) },
        log: (line) => logs.push(line),
        suggestions: true,
        briefs: true,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.stop();
        store.close();
    });
    store.saveSuggestionSettings({
        enabled: true,
        model: { provider: 'claude', model: 'quick-model' },
        effort: 'low',
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (route, body) =>
        fetch(`${origin}/api/trees${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const id = (await (await post('', {})).json()).id;
    await (await post(`/${id}/messages`, { text: 'How do threads share a counter?' })).text();
    await app.settled();
    const reply = store.tree(id).messages.at(-1);
    const [passage] = store.tree(id).suggestions[0].passages;
    assert.equal(passage.concept, 'Mutex');
    const anchor = {
        messageId: reply.id,
        start: passage.start,
        end: passage.end,
        text: passage.text,
    };
    const brief = (body = anchor) => post(`/${id}/brief`, { ...body, suggestion: true });
    const mutex = () => store.graph().concepts.find((c) => c.name === 'Mutex');
    const briefEvents = () => store.usageEvents().events.filter((e) => e.task === 'brief');
    assert.equal(mutex().familiarity, 0.3);

    // The batch and its retry failed: it is logged, saved nothing, and opening falls back to an on-demand brief.
    assert.ok(logs.some((l) => /brief/.test(l) && /left briefs unsaved/.test(l)));
    assert.equal(store.brief(reply.id, passage.start, passage.end), undefined);

    // A failed call stores nothing, records nothing and returns an error.
    write = async () => {
        throw new Error('Fixture quick thinking failure');
    };
    const failed = await brief();
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error, /Retry/);
    assert.equal(store.brief(reply.id, passage.start, passage.end), undefined);
    assert.deepEqual(mutex().observations, [0, 0, 0, 0, 0, 0]);

    // Two requests while one is written share one call.
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    write = async (emit) => {
        await gate;
        emit({
            type: 'item',
            item: 'a',
            text: 'Een mutex laat één thread tegelijk de teller wijzigen.',
        });
        emit({ type: 'status', status: 'completed' });
    };
    const calls = prompts.length;
    const pending = [brief(), brief()];
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    const answers = await Promise.all(
        pending.map(async (p) => {
            const r = await p;
            return [r.status, await r.json()];
        }),
    );
    assert.equal(prompts.length, calls + 1);
    for (const answer of answers)
        assert.deepEqual(answer, [
            200,
            { explanation: 'Een mutex laat één thread tegelijk de teller wijzigen.' },
        ]);
    // The prompt carries the reply's plain text and the exact term as data.
    assert.deepEqual(JSON.parse(prompts.at(-1).slice(PREFIX.length)), {
        reply: 'A mutex guards the shared counter.',
        term: 'mutex',
    });
    assert.equal(
        briefEvents().length,
        4,
        'the failed batch and its retry, the failed and the written call',
    );
    assert.ok(briefEvents().every((e) => e.model === 'quick-model'));
    assert.deepEqual(mutex().observations, [0, 0, 1, 0, 0, 0]);
    assert.equal(mutex().familiarity, 0.35);

    // Reopening serves the saved explanation with no call and no second observation.
    const again = await brief();
    assert.equal((await again.json()).explanation, answers[0][1].explanation);
    assert.equal(prompts.length, calls + 1);
    assert.deepEqual(mutex().observations, [0, 0, 1, 0, 0, 0]);

    // A selected passage that is no suggestion records no observation.
    write = (emit) => {
        emit({ type: 'item', item: 'a', text: 'The counter is a shared number.' });
        emit({ type: 'status', status: 'completed' });
    };
    const start = reply.text.indexOf('shared counter');
    const selected = await post(`/${id}/brief`, {
        messageId: reply.id,
        start,
        end: start + 14,
        text: 'shared counter',
    });
    assert.equal(selected.status, 200);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n, 1);
    // The briefed selection becomes a ready suggestion with no concept, returned so it underlines at once.
    const briefed = { start, end: start + 14, text: 'shared counter' };
    const row = (await selected.json()).suggestions;
    assert.equal(row.status, 'ready');
    assert.deepEqual(row.passages, [passage, briefed]);
    assert.deepEqual(store.tree(id).suggestions[0], row);
    // A passage matching a suggestion adds nothing and keeps its brief.
    assert.deepEqual(await (await brief()).json(), { explanation: answers[0][1].explanation });
    assert.deepEqual(store.tree(id).suggestions[0].passages, row.passages);
    assert.equal((await post(`/${id}/brief`, { ...anchor, text: 'wrong' })).status, 400);

    // A visual part is explained on request too, from the part and its visual.
    const visual = store.pendingArtifact(
        id,
        reply.id,
        'Counter',
        'Two threads, one lock.',
        'visual',
    );
    store.finishArtifact(id, visual.id, '<svg></svg>');
    const part = {
        messageId: reply.id,
        artifactId: visual.id,
        label: 'Lock',
        trail: ['Counter', 'Lock'],
        step: null,
        text: '',
    };
    const asked = await post(`/${id}/brief`, part);
    assert.deepEqual(
        [asked.status, await asked.json()],
        [200, { explanation: 'The counter is a shared number.' }],
    );
    assert.match(JSON.parse(prompts.at(-1).slice(PREFIX.length)).term, /Counter[^]*Lock/);

    // The tutor's next turn never carries a brief explanation.
    await (await post(`/${id}/messages`, { text: 'And with two counters?' })).text();
    await app.settled();
    assert.doesNotMatch(JSON.stringify(tutor.at(-1)), /Een mutex|shared number/);

    // A brief saved before anyone opens it records nothing; opening it serves it with no call and records once.
    const next = store.tree(id).messages.at(-1);
    const [later] = store.tree(id).suggestions.find((s) => s.message === next.id).passages;
    const total = () => mutex().observations.reduce((a, b) => a + b, 0);
    const before = total();
    store.saveBrief({ ...later, message: next.id }, 'Saved ahead.');
    assert.equal(total(), before);
    const nextAnchor = { messageId: next.id, start: later.start, end: later.end, text: later.text };
    const asksBefore = prompts.length;
    for (const _ of [1, 2])
        assert.equal((await (await brief(nextAnchor)).json()).explanation, 'Saved ahead.');
    assert.equal(prompts.length, asksBefore);
    assert.equal(total(), before + 1);

    // Once the concept is observed, an on-demand brief is pitched to its familiarity.
    await (await post(`/${id}/messages`, { text: 'And with three?' })).text();
    await app.settled();
    const third = store.tree(id).messages.at(-1);
    const [pitched] = store.tree(id).suggestions.find((s) => s.message === third.id).passages;
    const familiarity = mutex().familiarity;
    const pitchedBrief = await brief({
        messageId: third.id,
        start: pitched.start,
        end: pitched.end,
        text: pitched.text,
    });
    assert.equal(pitchedBrief.status, 200);
    assert.equal(prompts.length, asksBefore + 1);
    assert.equal(taskOf(prompts.at(-1)).familiarity, familiarity);
});

test('a brief batch saves each brief as its marker text streams, retries missed terms once, and leaves the rest on demand', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'rabbithole-briefs-ahead-')), 'trees.sqlite'),
    );
    const prompts = [],
        batches = [],
        logs = [];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const delta = (emit, text) => emit({ type: 'delta', item: 'a', text });
    const completed = (emit) => emit({ type: 'status', status: 'completed' });
    // Each batch call plays the next script: the first reply's batch and retry, then the second's.
    const scripts = [
        async (emit) => {
            delta(emit, 'Here are the briefs.\n[[brief: mutex]]\nAhead mutex.\n');
            delta(emit, '[[brief: shared counter]]\n');
            await gate;
            delta(emit, 'Ahead counter.\n[[brief: unknown]]\nNot asked.\n[[brief: lock]]\nCut');
            throw new Error('Fixture batch cut off');
        },
        async (emit) => {
            delta(emit, '[[brief: lock]]\nAhead lock.');
            completed(emit);
        },
        async (emit) => {
            delta(emit, '[[brief: shared counter]]\n\n[[brief: mutex]]\nSecond mutex.');
            completed(emit);
        },
        async (emit) => {
            delta(emit, '[[brief: shared counter]]\nRetry counter.\n');
            completed(emit);
        },
    ];
    const quick = {
        models: async () => [{ model: 'quick-model', efforts: ['low'] }],
        generate: async (tree, text, emit) => {
            const task = taskOf(text);
            if (tree.role === 'brief' && task.terms) {
                batches.push(task);
                assert.equal(task.reply, 'A mutex guards the shared counter with a lock.');
                assert.equal(tree.tools, undefined, 'the batch is a plain text call');
                return scripts.shift()(emit);
            }
            if (tree.role === 'suggestions') {
                emit({
                    type: 'item',
                    item: 'answer',
                    text: JSON.stringify({
                        suggestions: [
                            { text: 'mutex', concept: 'Mutex' },
                            { text: 'shared counter', concept: 'Shared state' },
                            { text: 'lock', concept: 'Lock' },
                        ],
                        concepts: ['Mutex', 'Shared state', 'Lock'].map((name) => ({
                            name,
                            topics: ['Concurrency'],
                        })),
                    }),
                });
                return completed(emit);
            }
            if (tree.role !== 'brief') return;
            prompts.push(text);
            emit({ type: 'item', item: 'a', text: `On demand ${taskOf(text).term}.` });
            completed(emit);
        },
    };
    const chat = {
        generate: async (tree, text, emit) => {
            emit({
                type: 'item',
                item: 'answer',
                text:
                    text === 'And with two counters?'
                        ? 'A mutex guards the shared counter with a lock.'
                        : 'A **[[mutex]]** guards the **[[shared counter]]** with a [[lock]].\n[[end]]',
            });
            completed(emit);
        },
    };
    const app = createApp({
        store,
        providers: { codex: chat, claude: quick },
        auth: { status: () => ({ connected: true }) },
        log: (line) => logs.push(line),
        suggestions: true,
        briefs: true,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        release();
        app.stop();
        store.close();
    });
    store.saveSuggestionSettings({
        enabled: true,
        model: { provider: 'claude', model: 'quick-model' },
        effort: 'low',
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (route, body) =>
        fetch(`${origin}/api/trees${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const id = (await (await post('', {})).json()).id;
    await (await post(`/${id}/messages`, { text: 'How do threads share a counter?' })).text();
    const reply = store.tree(id).messages.at(-1);
    const [mutex, counter, lock] = store.tree(id).suggestions[0].passages;
    const saved = (p, message = reply.id) => store.brief(message, p.start, p.end);
    // The batch waits on the gate with its first brief closed by the next marker.
    while (!saved(mutex)) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(saved(mutex), 'Ahead mutex.');
    assert.equal(saved(counter), undefined, 'an open brief waits for the next marker');
    // The open tree polls while the batch runs, so each saved brief shows as it lands.
    assert.deepEqual((await (await fetch(`${origin}/api/state`)).json()).briefing, [id]);
    const open = (p, message = reply.id) =>
        post(`/${id}/brief`, {
            messageId: message,
            start: p.start,
            end: p.end,
            text: p.text,
            suggestion: true,
        }).then((r) => r.json());
    const observations = () => store.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n;

    // Opened while the batch runs: written on demand, and the batch keeps it.
    assert.equal((await open(counter)).explanation, 'On demand shared counter.');
    release();
    await app.settled();
    assert.equal(saved(counter), 'On demand shared counter.');
    // The cut-off call kept what it closed; the retry asked for only the missing term.
    assert.deepEqual(
        batches.map((batch) => batch.terms),
        [['mutex', 'shared counter', 'lock'], ['lock']],
    );
    assert.ok(batches.every((batch) => batch.familiarityByTerm === undefined));
    assert.equal(saved(lock), 'Ahead lock.');
    assert.equal(observations(), 1, 'the batch records no familiarity evidence');
    assert.ok(!logs.some((l) => /left briefs unsaved/.test(l)));

    // A brief saved ahead opens with no model call and counts once.
    assert.equal((await open(mutex)).explanation, 'Ahead mutex.');
    assert.equal(prompts.length, 1);
    assert.equal(observations(), 2);

    // Without tutor marks, quick thinking names the suggestions before the batch starts.
    const concepts = store.graph().concepts;
    const mutexScore = concepts.find((c) => c.name === 'Mutex').familiarity;
    const counterScore = concepts.find((c) => c.name === 'Shared state').familiarity;
    await (await post(`/${id}/messages`, { text: 'And with two counters?' })).text();
    await app.settled();
    const second = store.tree(id).messages.at(-1).id;
    const [mutex2, counter2, lock2] = store
        .tree(id)
        .suggestions.find((s) => s.message === second).passages;
    assert.deepEqual(
        batches.slice(2).map((batch) => batch.terms),
        [
            ['mutex', 'shared counter', 'lock'],
            ['shared counter', 'lock'],
        ],
    );
    assert.deepEqual(batches[2].familiarityByTerm, {
        mutex: mutexScore,
        'shared counter': counterScore,
    });
    assert.deepEqual(batches[3].familiarityByTerm, { 'shared counter': counterScore });
    assert.equal(saved(mutex2, second), 'Second mutex.');
    assert.equal(saved(counter2, second), 'Retry counter.');
    assert.equal(saved(lock2, second), undefined);
    assert.ok(logs.some((l) => /brief/.test(l) && /left briefs unsaved/.test(l)));
    assert.equal((await open(lock2, second)).explanation, 'On demand lock.');
    const briefs = store.usageEvents().events.filter((e) => e.task === 'brief');
    assert.equal(briefs.length, 6, 'four batch calls and two on-demand calls');
});

test('a suggestion opened while its reply streams gets its brief explanation at once', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'rabbithole-briefs-live-')), 'trees.sqlite'),
    );
    const prompts = [];
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const quick = {
        models: async () => [{ model: 'quick-model', efforts: ['low'] }],
        generate: async (tree, text, emit) => {
            if (tree.role !== 'brief') return;
            prompts.push(text);
            emit({ type: 'item', item: 'a', text: 'A mutex lets one thread in at a time.' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const chat = {
        generate: async (tree, text, emit) => {
            emit({ type: 'delta', item: 'answer', text: 'A **[[mutex]]** guards' });
            await gate;
            emit({ type: 'delta', item: 'answer', text: ' the shared counter.\n[[end]]' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    // saveEvery is long: only the first delta saves the streamed text, and the suggestion's brief reads it.
    const app = createApp({
        store,
        providers: { codex: chat, claude: quick },
        auth: { status: () => ({ connected: true }) },
        log: () => {},
        suggestions: true,
        saveEvery: 60_000,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        release();
        app.stop();
        store.close();
    });
    store.saveSuggestionSettings({
        enabled: true,
        model: { provider: 'claude', model: 'quick-model' },
        effort: 'low',
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (route, body) =>
        fetch(`${origin}/api/trees${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const id = (await (await post('', {})).json()).id;
    const reader = (await post(`/${id}/messages`, { text: 'How do threads share a counter?' })).body
        .pipeThrough(new TextDecoderStream())
        .getReader();
    let seen = '';
    while (!seen.includes('"suggestions"')) seen += (await reader.read()).value;
    const reply = store.tree(id).messages.at(-1);
    assert.equal(reply.status, 'streaming');
    const brief = await post(`/${id}/brief`, {
        messageId: reply.id,
        start: 4,
        end: 9,
        text: 'mutex',
        suggestion: true,
    });
    assert.equal(brief.status, 200);
    assert.deepEqual(await brief.json(), { explanation: 'A mutex lets one thread in at a time.' });
    assert.deepEqual(JSON.parse(prompts[0].slice(PREFIX.length)), {
        reply: 'A mutex guards',
        term: 'mutex',
    });
    release();
    while (!(await reader.read()).done);
    await app.settled();
    assert.equal(store.tree(id).messages.at(-1).status, 'completed');
    assert.equal(store.brief(reply.id, 4, 9), 'A mutex lets one thread in at a time.');
});

test('the usage task check widens to brief on an existing database and keeps video stages', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-brief-usage-')), 'trees.sqlite');
    const old = new Store(path);
    old.record('video:a:1', 'video', {}, null, 1, null, 'plan', 2);
    const sql = old.db.prepare("SELECT sql FROM sqlite_master WHERE name='usage_events'").get().sql;
    old.db.exec(`ALTER TABLE usage_events RENAME TO usage_events_new;
    ${sql.replace(",'brief'", '')};
    INSERT INTO usage_events SELECT * FROM usage_events_new;
    DROP TABLE usage_events_new;`);
    assert.throws(() => old.record('brief:x', 'brief', {}, null), /CHECK/);
    old.close();
    const store = new Store(path);
    store.record('brief:x', 'brief', { provider: 'claude', model: 'quick-model' }, null);
    assert.equal(store.usageEvents().events.at(-1).task, 'brief');
    assert.deepEqual(
        { ...store.db.prepare("SELECT stage, cut FROM usage_events WHERE id='video:a:1'").get() },
        { stage: 'plan', cut: 2 },
    );
    store.close();
});
