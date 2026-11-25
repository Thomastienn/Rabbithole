import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagramReply } from '../../server/media/reply-parser.mjs';
import { markerNotes } from '../../server/media/markers.mjs';
import { suggestionJobs } from '../../server/http/jobs/suggestions.mjs';
import { backgroundJobs } from '../../server/http/jobs/background.mjs';
import { start } from '../support/suggestion-kit.mjs';
// The conversation data a quick thinking call sends after its task line.
const data = (call) => JSON.parse(call.input.slice(call.input.lastIndexOf('\n') + 1));

const notesOf = (raw, final) => {
    const out = diagramReply(raw, final);
    return markerNotes(out.text, out.markers);
};

test('a stopped reply keeps its marks; a completed reply calls quick thinking once, for the hidden notes or for every note', () => {
    const calls = [];
    const store = {
        tree: () => ({}),
        suggestionSettings: () => ({ enabled: true }),
        pendingSuggestions: (...args) => calls.push(['pending', ...args]) > 0,
        finishSuggestions: (...args) => calls.push(['finish', ...args]),
        graph: () => ({ topics: [], concepts: [] }),
        mentioned: () => ({}),
    };
    const { noteSuggestions } = suggestionJobs({
        store,
        suggestions: true,
        jobs: backgroundJobs(),
        neighbourhood: async () => (calls.push(['quick']), { concepts: [] }),
        startBriefs: (...args) => calls.push(['briefs', ...args]),
    });
    const partial = notesOf('Use [[shared state]] and');
    noteSuggestions('c', 'r', 'interrupted', partial, 'Q', 'Use shared state and');
    assert.deepEqual(calls, [
        ['pending', 'c', 'r'],
        ['finish', 'c', 'r', [{ start: 4, end: 16, text: 'shared state' }], null, null, []],
    ]);
    calls.length = 0;
    // A completed reply without [[end]]: quick thinking writes every note.
    noteSuggestions('c', 'r', 'completed', partial, 'Q', 'Use shared state and');
    // A completed reply with [[end]]: its marks are ready at once and quick thinking names their concepts.
    noteSuggestions('c', 'r', 'completed', notesOf('Hi.\n[[end]]', true), 'Q', 'Hi.\n');
    noteSuggestions('c', 'r', 'interrupted', notesOf('Plain', false), 'Q', 'Plain');
    noteSuggestions('c', 'r', 'failed', partial, 'Q', 'Use shared state and');
    assert.deepEqual(calls, [
        ['pending', 'c', 'r'],
        ['quick'],
        ['pending', 'c', 'r'],
        ['finish', 'c', 'r', [], null, null, []],
        ['briefs', 'c', 'r'],
        ['quick'],
    ]);
});

test('a Claude reply with inline notes underlines at once and quick thinking names its concepts; one without [[end]] falls back', async (t) => {
    const env = await start(mkdtempSync(join(tmpdir(), 'tt-notes-')));
    t.after(() => env.close());
    const tree = JSON.parse(await env.post('/api/trees'));
    const streamed = await env.post(`/api/trees/${tree.id}/messages`, {
        text: 'Use the notes fixture reply',
    });
    assert.match(streamed, /"type":"questions","questions":\["Why does originality matter\?"/);
    assert.match(streamed, /"type":"suggestions"/);
    assert.doesNotMatch(streamed, /\[\[|groundwork:|next:/);
    await env.settled();
    let saved = await env.get(`/api/trees/${tree.id}`);
    assert.equal(saved.messages.at(-1).text, '\nAuthoritative original\n\n\n');
    assert.deepEqual(saved.messages.at(-1).questions, [
        'Why does originality matter?',
        'What if two works match?',
    ]);
    // One quick thinking call names the concept of each marked suggestion and fills the graph.
    assert.equal(env.suggestionCalls().length, 1);
    assert.deepEqual(
        data(env.suggestionCalls()[0]).suggestions,
        ['original'],
        'it gets the marked terms',
    );
    assert.equal(saved.suggestions[0].status, 'ready');
    assert.deepEqual(saved.suggestions[0].passages, [
        { start: 15, end: 23, text: 'original', concept: 'Originality' },
    ]);
    assert.deepEqual(saved.suggestions[0].groundwork, ['Copyright']);
    assert.deepEqual(
        env.store.graph().concepts.map((c) => [c.name, c.topics]),
        [
            ['Copyright', []],
            ['Originality', ['Writing']],
        ],
    );

    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Use the cut notes fixture' });
    await env.settled();
    saved = await env.get(`/api/trees/${tree.id}`);
    assert.equal(env.suggestionCalls().length, 2);
    assert.equal(
        data(env.suggestionCalls()[1]).suggestions,
        undefined,
        'it marks the terms itself',
    );
    // Quick thinking stands in for the end section's next questions too.
    assert.deepEqual(saved.messages.at(-1).questions, ['What counts as plagiarism?']);
    assert.equal(saved.suggestions.at(-1).status, 'ready');
    assert.ok(saved.suggestions.at(-1).usage.input >= 0);
    // Quick thinking stands in for groundwork too: empty names drop, an existing concept keeps its name.
    assert.deepEqual(saved.suggestions.at(-1).groundwork, ['Plagiarism', 'Copyright']);
    assert.ok(env.store.graph().concepts.some((c) => c.name === 'Plagiarism'));
});

test('a completed reply without [[end]] starts its briefs once quick thinking has marked it, applying any memory edits first', async () => {
    const calls = [],
        logs = [],
        prompts = [];
    let note = '- Knows Python\n' + 'x'.repeat(7980);
    const store = {
        tree: () => ({ provider: 'claude' }),
        suggestionSettings: () => ({ enabled: true }),
        pendingSuggestions: () => true,
        finishSuggestions: (...args) => calls.push(['finish', ...args.slice(0, 3)]),
        nextQuestions: () => {},
        addGraph: () => {},
        graph: () => ({ topics: [], concepts: [] }),
        mentioned: () => ({}),
        memoryNote: () => note,
        saveMemoryNote: (text, message) => ((note = text), calls.push(['memory', message])),
    };
    let memory;
    const quick = {
        models: async () => [{ model: 'haiku' }],
        generate: async (tree, text, emit) => {
            prompts.push(text);
            const answer = { suggestions: [{ text: 'shared state', concept: 'State' }], memory };
            emit({ type: 'item', item: 'a', text: JSON.stringify(answer) });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const jobs = backgroundJobs();
    const { noteSuggestions } = suggestionJobs({
        store,
        suggestions: true,
        jobs,
        neighbourhood: async () => ({ concepts: [] }),
        pick: () => quick,
        logged: (provider) => provider,
        log: (line) => logs.push(line),
        toolCapable: async () => false,
        quickModel: async () => ({ provider: 'claude', model: 'haiku', effort: null }),
        startBriefs: (...args) => calls.push(['briefs', ...args]),
    });
    const run = async (message) => {
        calls.length = 0;
        noteSuggestions(
            'c',
            message,
            'completed',
            notesOf('Use shared state'),
            'Q',
            'Use shared state',
        );
        await jobs.get('suggestion', message).done;
    };
    const finished = (message) => [
        ['finish', 'c', message, [{ start: 4, end: 16, text: 'shared state', concept: 'State' }]],
        ['briefs', 'c', message],
    ];
    // No memory field: the note stays as it was.
    await run('r');
    assert.deepEqual(calls, finished('r'));
    assert.equal(data({ input: prompts[0] }).memoryNote, note, 'the call reads the current note');
    // An edit within the limit saves for its reply; one that grows the note past it is refused.
    memory = [
        { operation: 'rewrite', old_text: '- Knows Python', text: '- Knows Rust' },
        { operation: 'add', text: '- Likes long proofs' },
        'not an edit',
    ];
    await run('s');
    assert.deepEqual(calls, [['memory', 's'], ...finished('s')]);
    assert.equal(note, '- Knows Rust\n' + 'x'.repeat(7980));
    assert.equal(logs.length, 2);
    assert.match(logs[0], /INFO suggestions memory edit id="s"/);
    assert.match(logs[1], /WARN suggestions memory edit refused id="s".*limit/);
});

test('a mark that names its concept stores it, and quick thinking names only the other marks', async () => {
    const calls = [],
        prompts = [];
    let failed = false;
    const store = {
        tree: () => ({ provider: 'claude' }),
        suggestionSettings: () => ({ enabled: true }),
        pendingSuggestions: () => true,
        finishSuggestions: (...args) => calls.push(['finish', args[2]]),
        nameSuggestions: (...args) => calls.push(['name', args[2]]),
        addGraph: () => {},
        graph: () => ({ topics: [], concepts: [] }),
        mentioned: () => ({}),
        memoryNote: () => '',
    };
    const quick = {
        models: async () => [{ model: 'haiku' }],
        generate: async (tree, text, emit) => {
            if (failed) throw new Error('Quick thinking is unavailable');
            prompts.push(text);
            const answer = {
                suggestions: [
                    { text: 'safe', concept: 'Safety' },
                    { text: 'mutex', concept: 'Mutex' },
                ],
            };
            emit({ type: 'item', item: 'a', text: JSON.stringify(answer) });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const jobs = backgroundJobs();
    const { noteSuggestions } = suggestionJobs({
        store,
        suggestions: true,
        jobs,
        neighbourhood: async () => ({ concepts: [] }),
        pick: () => quick,
        logged: (provider) => provider,
        toolCapable: async () => false,
        quickModel: async () => ({ provider: 'claude', model: 'haiku', effort: null }),
        startBriefs: () => {},
    });
    const notes = notesOf('A [[safe state|safe]] run and a [[mutex]].\n[[end]]', true);
    noteSuggestions('c', 'r', 'completed', notes, 'Q', 'A safe run and a mutex.\n');
    await jobs.get('suggestion', 'r').done;
    const safe = { start: 2, end: 6, text: 'safe', concept: 'safe state' };
    assert.deepEqual(calls, [
        ['finish', [safe, { start: 17, end: 22, text: 'mutex' }]],
        ['name', [safe, { start: 17, end: 22, text: 'mutex', concept: 'Mutex' }]],
    ]);
    assert.deepEqual(data({ input: prompts[0] }).suggestions, ['mutex']);

    calls.length = 0;
    failed = true;
    const unfinished = notesOf('A [[safe state|safe]] run and a [[mutex]].', true);
    noteSuggestions('c', 's', 'completed', unfinished, 'Q', 'A safe run and a mutex.');
    await jobs.get('suggestion', 's').done;
    assert.deepEqual(calls, [['finish', [safe]]]);
});
