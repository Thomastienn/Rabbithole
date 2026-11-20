import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagramReply } from '../../server/media/diagrams.mjs';
import { markerNotes } from '../../server/media/markers.mjs';
import { suggestionJobs } from '../../server/http/jobs/suggestions.mjs';
import { start } from '../support/suggestion-kit.mjs';

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
        suggesting: new Map(),
        neighbourhood: async () => (calls.push(['quick']), { concepts: [] }),
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
    assert.match(env.suggestionCalls()[0].input, /^The tutor already marked/);
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
    assert.match(env.suggestionCalls()[1].input, /^Mark every term/);
    // Quick thinking stands in for the end section's next questions too.
    assert.deepEqual(saved.messages.at(-1).questions, ['What counts as plagiarism?']);
    assert.equal(saved.suggestions.at(-1).status, 'ready');
    assert.ok(saved.suggestions.at(-1).usage.input >= 0);
    // Quick thinking stands in for groundwork too: empty names drop, an existing concept keeps its name.
    assert.deepEqual(saved.suggestions.at(-1).groundwork, ['Plagiarism', 'Copyright']);
    assert.ok(env.store.graph().concepts.some((c) => c.name === 'Plagiarism'));
});
