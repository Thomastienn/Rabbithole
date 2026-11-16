import test from 'node:test';
import assert from 'node:assert/strict';
import { discussionNeighbourhood, discussionText } from '../../server/media/discussion-context.mjs';
import { compactionMessages, tutorContext } from '../../server/media/diagrams.mjs';
import { discussion } from '../fixtures/discussion.mjs';

test('discussion neighbourhood uses whole names and aliases, nearest hops, guesses and unknowns with bounds', () => {
  const concept = (name, observed = false) => ({
    name,
    familiarity: 0.8,
    topics: ['Biology'],
    observations: [0, 0, 0, observed ? 1 : 0, 0, 0],
  });
  const graph = {
    concepts: [concept('Root'), concept('Hyphae', true), concept('Fungus'), concept('Soil')],
    links: [
      { from: 'Root', to: 'Hyphae', kind: 'builds on' },
      { from: 'Hyphae', to: 'Fungus', kind: 'related' },
      { from: 'Fungus', to: 'Soil', kind: 'related' },
    ],
  };
  const names = [
    ...graph.concepts.map((c, id) => ({ id, name: c.name })),
    { id: 0, name: 'Plant roots' },
  ];
  const result = discussionNeighbourhood(graph, names, 'Plant roots?');
  assert.deepEqual(
    result.concepts.map((c) => c.name),
    ['Root', 'Hyphae', 'Fungus'],
  );
  assert.equal(result.concepts[0].guess, 0.8);
  assert.equal(result.concepts[1].familiarity, 0.8);
  assert.deepEqual(result.links, [graph.links[0]]);
  assert.equal(discussionNeighbourhood(graph, names, 'Soil').concepts[0].familiarity, 'unknown');
  assert.deepEqual(discussionNeighbourhood(graph, names, 'Uproot').concepts, []);
  for (let i = 0; i < 100; i++) {
    graph.concepts.push(concept(`Connected ${i}`));
    graph.links.push({ from: 'Root', to: `Connected ${i}`, kind: 'builds on' });
  }
  const bounded = discussionNeighbourhood(graph, names, 'Root');
  assert.equal(bounded.concepts[0].name, 'Root');
  assert.equal(bounded.concepts.length, 24);
  assert.ok(bounded.links.every((l) => bounded.concepts.some((c) => c.name === l.to)));
  assert.ok(JSON.stringify(bounded).length < 12000);
});

test('open discussion context has lines without levels; closed context and branch compaction use its paragraph', () => {
  const artifact = {
    id: 'd',
    message: 'm',
    conversation: 'c',
    kind: 'discussion',
    status: 'ready',
    position: 6,
    source: JSON.stringify(discussion),
  };
  const tree = {
    id: 'c',
    messages: [{ id: 'm', role: 'assistant', status: 'completed', text: 'BeforeAfter' }],
    artifacts: [artifact],
  };
  assert.match(discussionText(artifact), /Is the fungus a parasite/);
  assert.doesNotMatch(discussionText(artifact), /level|below|above/);
  assert.match(tutorContext(tree).messages[0].text, /Is the fungus a parasite/);
  artifact.source = JSON.stringify({
    ...discussion,
    closed: true,
    summary: 'They discussed the trade.',
  });
  for (const messages of [tutorContext(tree).messages, compactionMessages(tree)]) {
    assert.match(messages[0].text, /They discussed the trade/);
    assert.doesNotMatch(messages[0].text, /Is the fungus a parasite|speaker|classmates/);
  }
  assert.match(
    compactionMessages(tree)[0].text,
    /^Before\n\[Discussion: They discussed the trade\.\]\nAfter$/,
  );
});
