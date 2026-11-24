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
import { NOTES_RULE } from '../../server/suggestions.mjs';
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

test('a completed reply without [[end]] starts its briefs once quick thinking has marked it', async () => {
    const calls = [];
    const store = {
        tree: () => ({ provider: 'claude' }),
        suggestionSettings: () => ({ enabled: true }),
        pendingSuggestions: () => true,
        finishSuggestions: (...args) => calls.push(['finish', ...args.slice(0, 3)]),
        nextQuestions: () => {},
        addGraph: () => {},
        graph: () => ({ topics: [], concepts: [] }),
        mentioned: () => ({}),
    };
    const quick = {
        models: async () => [{ model: 'haiku' }],
        generate: async (tree, text, emit) => {
            emit({
                type: 'item',
                item: 'a',
                text: JSON.stringify({ suggestions: [{ text: 'shared state', concept: 'State' }] }),
            });
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
        startBriefs: (...args) => calls.push(['briefs', ...args]),
    });
    noteSuggestions('c', 'r', 'completed', notesOf('Use shared state'), 'Q', 'Use shared state');
    await jobs.get('suggestion', 'r').done;
    assert.deepEqual(calls, [
        ['finish', 'c', 'r', [{ start: 4, end: 16, text: 'shared state', concept: 'State' }]],
        ['briefs', 'c', 'r'],
    ]);
});

test('the suggestion notes ask the tutor to mark a term it would bold', () => {
    const paragraph = NOTES_RULE.split('\n\n').find((p) => p.startsWith('Suggestion notes:'));
    assert.match(
        paragraph,
        /When you would bold a term because it matters, the learner may not fully understand it yet, so mark it as a suggestion instead of only bolding it\./,
    );
});
