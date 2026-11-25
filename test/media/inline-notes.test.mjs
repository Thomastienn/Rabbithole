import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';
import { diagramReply } from '../../server/media/reply-parser.mjs';
import { markerNotes } from '../../server/media/markers.mjs';
import { complete, open, until } from '../support/visual-kit.mjs';

const notesOf = (raw, final = true, hasMedia = false) => {
    const out = diagramReply(raw, final);
    return { text: out.text, ...markerNotes(out.text, out.markers, hasMedia) };
};

test('the tutor’s inline notes leave the text and keep the notes reader’s limits', () => {
    const raw =
        '[[groundwork: Threads; Memory; threads; Caches; Disks]]\nA [[mutex]] guards [[shared state]] between threads. [[groundwork: Late]]\n' +
        'A [[mutex]] again, and [[one two three four five six seven]].\n' +
        '[[next: Why can a mutex deadlock?]]\n[[next: How do locks queue?]]\n[[video offer: Can you make a video of a mutex?]]\n[[next: What is a semaphore?]]\n[[end]]';
    const notes = notesOf(raw);
    assert.equal(
        notes.text,
        '\nA mutex guards shared state between threads. \nA mutex again, and one two three four five six seven.\n\n\n\n\n',
    );
    assert.doesNotMatch(notes.text, /\[|\]|groundwork|next|end\b/);
    // Only the first groundwork line counts, at most three names without repeats.
    assert.deepEqual(notes.groundwork, ['Threads', 'Memory', 'Caches']);
    // Each term is a passage of the stripped text; a repeat or a term over six words is skipped.
    assert.deepEqual(notes.passages, [
        { start: 3, end: 8, text: 'mutex' },
        { start: 16, end: 28, text: 'shared state' },
    ]);
    for (const p of notes.passages) assert.equal(notes.text.slice(p.start, p.end), p.text);
    // At most three next questions, the video offer among them.
    assert.deepEqual(notes.questions, [
        'Why can a mutex deadlock?',
        'How do locks queue?',
        'Can you make a video of a mutex?',
    ]);
    assert.equal(notes.ended, true);
});

test('groundwork after reply text is ignored, a video offer beside media is skipped, and a reply without [[end]] has not ended', () => {
    const late = notesOf('Text first. [[groundwork: Threads]]');
    assert.deepEqual(late.groundwork, []);
    assert.equal(late.ended, false);
    const offer = notesOf(
        '[[video offer: Can you make a video?]]\n[[video offer: And another?]]\n[[end]]',
    );
    assert.deepEqual(offer.questions, ['Can you make a video?']);
    assert.deepEqual(notesOf('[[video offer: A video?]]\n[[end]]', true, true).questions, []);
    // A casual turn closes with [[end]] alone.
    assert.deepEqual(notesOf('Hi there!\n[[end]]'), {
        text: 'Hi there!\n',
        questions: [],
        passages: [],
        groundwork: [],
        ended: true,
    });
});

test('text after [[end]] is dropped, while a call written after it still runs', () => {
    const raw =
        'A mutex guards state.\n[[next: Why?]]\n[[end]]\n\nA mutex guards state. [[next: Again?]]\n<tool_call>{"name":"show_visual","arguments":{"title":"Lock"}}</tool_call> More.\n[[end]]';
    const out = diagramReply(raw, true);
    assert.equal(out.text, 'A mutex guards state.\n\n');
    assert.deepEqual(markerNotes(out.text, out.markers).questions, ['Why?']);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].position, out.text.length);
    // [[end]] inside code is text and ends nothing.
    assert.equal(diagramReply('Write `[[end]]` last.', true).text, 'Write `[[end]]` last.');
});

test('notes stream as their markers close', () => {
    const raw = '[[groundwork: Threads]]\nA [[mutex]] guards state.\n[[next: Why?]]\n[[end]]';
    for (let i = 1; i <= raw.length; i++) {
        const partial = notesOf(raw.slice(0, i), false);
        assert.doesNotMatch(partial.text, /\[|\]/);
        assert.equal(partial.groundwork.length, i >= 23 ? 1 : 0);
        assert.equal(partial.passages.length, i >= raw.indexOf('mutex]]') + 7 ? 1 : 0);
        assert.equal(partial.questions.length, i >= raw.indexOf('Why?]]') + 6 ? 1 : 0);
    }
});

test('a mark may name its concept: only the shown words stay, underlined, in tables too', () => {
    const shown = (raw) => {
        const notes = notesOf(raw);
        return [notes.text, notes.passages.map(({ text, concept }) => [text, concept ?? null])];
    };
    assert.deepEqual(shown('A [[safe state|safe]] one.'), [
        'A safe one.',
        [['safe', 'safe state']],
    ]);
    assert.deepEqual(shown('A [[safe state\\|safe]] one.'), [
        'A safe one.',
        [['safe', 'safe state']],
    ]);
    assert.deepEqual(shown('A [[mutex]] one.'), ['A mutex one.', [['mutex', null]]]);
    // An empty side leaves a plain mark of the other.
    assert.deepEqual(shown('A [[ |safe]] and [[lock| ]].'), [
        'A safe and lock.',
        [
            ['safe', null],
            ['lock', null],
        ],
    ]);
    assert.deepEqual(shown('A [[|]] b.'), ['A  b.', []]);
    // In a table row, either bar leaves a clean row of two cells.
    for (const bar of ['|', '\\|'])
        assert.equal(
            notesOf(`| Term | Use |\n| --- | --- |\n| [[safe state${bar}safe]] | ok |`).text,
            '| Term | Use |\n| --- | --- |\n| safe | ok |',
        );
    // A mark cut off at the end of its line shows only its shown words.
    assert.equal(notesOf('A [[safe state|safe\nNext.').text, 'A safe\nNext.');
    // While streaming, neither the bar nor the concept ever shows.
    const raw = 'A [[safe state\\|safe]] one.\n[[end]]';
    for (let i = 1; i <= raw.length; i++) {
        const partial = notesOf(raw.slice(0, i), false);
        assert.doesNotMatch(partial.text, /\||state|\[|\]/);
        assert.equal(partial.passages.length, i >= raw.indexOf(']]') + 2 ? 1 : 0);
    }
});

// Reads server-sent events as they arrive, so a test can wait on one mid-reply.
const watch = (response) => {
    const seen = [];
    const done = (async () => {
        let buffer = '';
        for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
            buffer += chunk;
            const frames = buffer.split('\n\n');
            buffer = frames.pop();
            for (const f of frames) if (f.startsWith('data: ')) seen.push(JSON.parse(f.slice(6)));
        }
    })();
    return { seen, done };
};

test('notes reach the learner while the reply streams, and quick thinking writes the hidden notes after it', async () => {
    const quick = [];
    let watched,
        ended = true;
    const waitFor = async (check) => {
        while (!watched?.seen.some(check)) await new Promise((r) => setTimeout(r, 5));
        assert.ok(!watched.seen.some((e) => e.type === 'done'));
    };
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.role === 'suggestions') {
                    quick.push(text);
                    // The hidden notes for a reply that ended; the fallback for one that did not.
                    return complete(
                        emit,
                        ended
                            ? '{"suggestions":[{"text":"mutex","concept":"Mutex"}],"concepts":[{"name":"Mutex","topics":["Concurrency"]}],"links":[]}'
                            : '{"suggestions":[{"text":"semaphore"}],"groundwork":["Counting"],"next_questions":["Why count permits?"]}',
                    );
                }
                if (tree.role === 'verdict') {
                    quick.push('verdicts');
                    return complete(emit, '[{"concept":"Mutex","level":1,"confidence":"low"}]');
                }
                if (!ended) return complete(emit, 'A semaphore counts permits.');
                const delta = (t) => emit({ type: 'delta', item: 'answer', text: t });
                delta('[[groundwork: Threads]]\nA ');
                // Groundwork shows before the reply's text finishes.
                await waitFor((e) => e.type === 'suggestions' && e.suggestions.groundwork.length);
                delta('[[mutex]] guards');
                // The underline appears with its term while the reply still streams.
                await waitFor((e) => e.type === 'suggestions' && e.suggestions.passages.length);
                delta(' state.\n[[next: Why can a mutex deadlock?]]\n[[end]]');
                emit({ type: 'status', status: 'completed' });
            },
        },
        { generate: () => {} },
        { suggestions: true, verdicts: true },
    );
    try {
        const { tree, store } = env;
        watched = watch(await env.post(`/api/trees/${tree.id}/messages`, { text: 'Mutex?' }));
        await watched.done;
        const live = watched.seen.find(
            (e) => e.type === 'suggestions' && e.suggestions.passages.length,
        );
        assert.deepEqual(live.suggestions.passages, [{ start: 3, end: 8, text: 'mutex' }]);
        assert.deepEqual(live.suggestions.groundwork, ['Threads']);
        const kinds = watched.seen.map((e) => e.type);
        assert.ok(kinds.lastIndexOf('text') < kinds.indexOf('questions'));
        for (const e of watched.seen.filter((e) => e.type === 'text'))
            assert.doesNotMatch(e.text, /\[|\]/);
        await until(() => quick.length === 2);
        await env.app.settled();
        const saved = await env.get(`/api/trees/${tree.id}`);
        const reply = saved.messages.at(-1);
        assert.equal(reply.text, '\nA mutex guards state.\n\n');
        assert.deepEqual(reply.questions, ['Why can a mutex deadlock?']);
        // The tutor's suggestion keeps its place; quick thinking names its concept and fills the graph.
        assert.equal(saved.suggestions[0].status, 'ready');
        assert.deepEqual(saved.suggestions[0].groundwork, ['Threads']);
        assert.deepEqual(saved.suggestions[0].passages, [
            { start: 3, end: 8, text: 'mutex', concept: 'Mutex' },
        ]);
        assert.match(
            quick.find((q) => q !== 'verdicts'),
            /"suggestions":\["mutex"\]/,
        );
        const concepts = () => Object.fromEntries(store.graph().concepts.map((c) => [c.name, c]));
        assert.deepEqual(concepts().Mutex.topics, ['Concurrency']);
        assert.ok(concepts().Threads);
        // The verdict keeps its own call.
        assert.deepEqual(concepts().Mutex.observations, [0, 1, 0, 0, 0, 0]);

        // A reply without [[end]] gets its suggestions, groundwork and next questions from the same call.
        ended = false;
        quick.length = 0;
        watched = watch(await env.post(`/api/trees/${tree.id}/messages`, { text: 'Semaphore?' }));
        await watched.done;
        await until(() => quick.length === 2);
        await env.app.settled();
        const after = await env.get(`/api/trees/${tree.id}`);
        assert.deepEqual(after.messages.at(-1).questions, ['Why count permits?']);
        assert.deepEqual(after.suggestions.at(-1).passages, [
            { start: 2, end: 11, text: 'semaphore' },
        ]);
        assert.deepEqual(after.suggestions.at(-1).groundwork, ['Counting']);
    } finally {
        await env.close();
    }
});

test('a custom endpoint marks its notes inline in one request', async (t) => {
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
    const dir = mkdtempSync(join(tmpdir(), 'tt-inline-notes-')),
        store = new Store(join(dir, 'trees.sqlite'));
    const app = createApp({
        store,
        dir,
        endpoint: new OpenAI(dir),
        providers: {},
        defaultProvider: 'claude',
        auth: { status: () => ({ connected: false }) },
        log: () => {},
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (path, body) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const endpoint = (
        await (
            await post('/api/settings/endpoints', {
                name: 'Local',
                baseUrl: fake.baseUrl,
                apiKey: 'sk-test',
            })
        ).json()
    ).at(-1).id;
    const chats = [];
    fake.reply = (req, res, body) => {
        chats.push(body);
        streamReply(res, ['A [[mu', 'tex]] guards state.\n[[next: Why deadlock?]]\n[[end]]']);
    };
    const id = store.create('Notes', endpoint, 'tooled').id;
    const events = (await (await post(`/api/trees/${id}/messages`, { text: 'Mutex?' })).text())
        .split('\n\n')
        .filter((f) => f.startsWith('data: '))
        .map((f) => JSON.parse(f.slice(6)));
    assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
    assert.equal(chats.length, 1);
    const saved = store.tree(id);
    assert.equal(saved.messages.at(-1).text, 'A mutex guards state.\n\n');
    assert.deepEqual(saved.messages.at(-1).questions, ['Why deadlock?']);
    assert.deepEqual(saved.suggestions[0].passages, [{ start: 2, end: 7, text: 'mutex' }]);
});
