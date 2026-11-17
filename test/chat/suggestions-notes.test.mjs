import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagramReply } from '../../server/media/diagrams.mjs';
import { suggestionJobs } from '../../server/http/jobs/suggestions.mjs';
import { conversationUsageLine } from '../../src/chat/turn.ts';
import { start } from '../support/suggestion-kit.mjs';

const lines =
  '{"suggestion":"shared state","concept":"Shared state"}\n{"concept":"Shared state","topics":["Concurrency"]}\n{"from":"Shared state","to":"Mutex","kind":"builds on"}\n';
const block = '\n```rabbithole-notes\n' + lines + '```';

test('the notes block stays hidden at every streamed boundary and its lines parse tolerantly', () => {
  for (let i = 0; i <= block.length; i++)
    assert.equal(
      diagramReply('Use shared state.' + block.slice(0, i)).text.trim(),
      'Use shared state.',
    );
  const done = diagramReply(
    'Use shared state.' + block.replace('\n{"from"', '\nnot json\n{"from"'),
    true,
  );
  assert.equal(done.text, 'Use shared state.');
  assert.equal(done.requested, false);
  assert.deepEqual(done.notes, {
    suggestions: [{ text: 'shared state', concept: 'Shared state' }],
    concepts: [{ name: 'Shared state', topics: ['Concurrency'] }],
    links: [{ from: 'Shared state', to: 'Mutex', kind: 'builds on' }],
    readable: true,
  });
  // A stopped reply keeps the complete lines that arrived; the cut-off one drops.
  const cut = diagramReply('Use shared state.' + block.slice(0, block.indexOf('"to"')));
  assert.equal(cut.notes.readable, false);
  assert.equal(cut.notes.suggestions.length, 1);
  assert.equal(cut.notes.links.length, 0);
  assert.equal(diagramReply('Plain.', true).notes, null);
  assert.equal(diagramReply('A\n```rabbithole-notes\n```', true).notes.readable, true);
  assert.equal(diagramReply('A\n```rabbithole-notes\nnot json\n```', true).notes.readable, false);
});

test('a stopped reply keeps its partial notes; a completed reply without a readable block falls back once', () => {
  const calls = [];
  const store = {
    tree: () => ({}),
    suggestionSettings: () => ({ enabled: true }),
    pendingSuggestions: (...args) => calls.push(['pending', ...args]) > 0,
    addGraph: (graph) => calls.push(['graph', graph]),
    finishSuggestions: (...args) => calls.push(['finish', ...args]),
    graph: () => (calls.push(['fallback']), { topics: [], concepts: [] }),
  };
  const { noteSuggestions } = suggestionJobs({ store, suggestions: true, suggesting: new Map() });
  const partial = diagramReply(
    'Use shared state.' + block.slice(0, block.indexOf('"topics"')),
  ).notes;
  noteSuggestions('c', 'r', 'interrupted', partial, 'Q', 'Use shared state.');
  assert.deepEqual(calls, [
    ['pending', 'c', 'r'],
    ['graph', { concepts: [], links: [] }],
    [
      'finish',
      'c',
      'r',
      [{ start: 4, end: 16, text: 'shared state', concept: 'Shared state' }],
      null,
      null,
    ],
  ]);
  calls.length = 0;
  noteSuggestions('c', 'r', 'completed', partial, 'Q', 'Use shared state.');
  noteSuggestions('c', 'r', 'interrupted', null, 'Q', 'Use shared state.');
  noteSuggestions('c', 'r', 'failed', partial, 'Q', 'Use shared state.');
  assert.deepEqual(
    calls.filter((c) => c[0] === 'fallback'),
    [['fallback']],
    'only the completed reply called quick thinking',
  );
});

test('a reply with a notes block underlines and fills the graph with no suggestion call or usage; a cut block falls back', async (t) => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-notes-')));
  t.after(() => env.close());
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Use the notes fixture reply' });
  await env.settled();
  let saved = await env.get(`/api/trees/${tree.id}`);
  assert.equal(saved.messages.at(-1).text, 'Authoritative original');
  assert.equal(env.suggestionCalls().length, 0);
  assert.deepEqual(saved.suggestions, [
    {
      message: saved.messages.at(-1).id,
      status: 'ready',
      passages: [{ start: 14, end: 22, text: 'original', concept: 'Originality' }],
    },
  ]);
  assert.deepEqual(
    env.store.graph().concepts.map((c) => [c.name, c.topics]),
    [['Originality', ['Writing']]],
  );
  assert.equal(
    conversationUsageLine(saved.messages, saved.suggestions).includes('Suggestions'),
    false,
  );

  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Use the cut notes fixture' });
  await env.settled();
  saved = await env.get(`/api/trees/${tree.id}`);
  assert.equal(env.suggestionCalls().length, 1);
  assert.equal(saved.suggestions.at(-1).status, 'ready');
  assert.ok(saved.suggestions.at(-1).usage.input >= 0);
});
