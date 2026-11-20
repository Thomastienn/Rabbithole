import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { briefPrompt } from '../../server/http/jobs/briefs.mjs';

const PREFIX = briefPrompt('', '').split('{')[0];
const REPLY = 'A **[[mutex]]** guards the shared counter.\n[[end]]';
// Quick thinking names the concept of the tutor's marked suggestion.
const named = JSON.stringify({
    suggestions: [{ text: 'mutex', concept: 'Mutex' }],
    concepts: [{ name: 'Mutex', topics: ['Concurrency'] }],
});

test('a brief explanation is written once, shared, saved with usage and one weak observation, and never reaches the tutor', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'rabbithole-briefs-')), 'trees.sqlite'),
    );
    let write;
    const prompts = [],
        tutor = [];
    const quick = {
        models: async () => [{ model: 'quick-model', efforts: ['low'] }],
        generate: async (tree, text, emit) => {
            if (text.startsWith('The tutor already marked')) {
                emit({ type: 'item', item: 'answer', text: named });
                return emit({ type: 'status', status: 'completed' });
            }
            if (!text.startsWith(PREFIX)) return; // title calls
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
        log: () => {},
        suggestions: true,
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
    assert.equal(briefEvents().length, 2, 'the failed and the written call');
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
    assert.equal((await post(`/${id}/brief`, { ...anchor, text: 'wrong' })).status, 400);

    // The tutor's next turn never carries a brief explanation.
    await (await post(`/${id}/messages`, { text: 'And with two counters?' })).text();
    await app.settled();
    assert.doesNotMatch(JSON.stringify(tutor.at(-1)), /Een mutex|shared number/);
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
            if (!text.startsWith(PREFIX)) return;
            prompts.push(text);
            emit({ type: 'item', item: 'a', text: 'A mutex lets one thread in at a time.' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const chat = {
        generate: async (tree, text, emit) => {
            emit({ type: 'delta', item: 'answer', text: 'A ' });
            emit({ type: 'delta', item: 'answer', text: '**[[mutex]]** guards' });
            await gate;
            emit({ type: 'delta', item: 'answer', text: ' the shared counter.\n[[end]]' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    // saveEvery is long: after the first delta only the suggestion's arrival saves the streamed text.
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

test('the brief prompt asks for a paragraph skimmed in a second or two, inline marks only, with no word count', () => {
    assert.match(PREFIX, /one paragraph of a few short sentences/);
    assert.match(PREFIX, /skim in a second or two/);
    assert.match(PREFIX, /what it is or why it holds in this reply/);
    assert.match(PREFIX, /bold, italics, inline code and inline math/i);
    assert.match(PREFIX, /no headings, lists or links/i);
    assert.doesNotMatch(PREFIX, /\d|words/, 'no word count');
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
