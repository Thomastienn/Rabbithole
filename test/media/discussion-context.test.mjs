import test from 'node:test';
import assert from 'node:assert/strict';
import { discussionText } from '../../server/media/discussion-context.mjs';
import { conceptNeighbourhood } from '../../server/neighbourhood.mjs';
import { compactionMessages } from '../../server/media/compaction-messages.mjs';
import { tutorContext } from '../../server/media/tutor-context.mjs';
import { discussion } from '../fixtures/discussion.mjs';

test('concept neighbourhood uses whole names and aliases, nearest hops, guesses and unknowns with bounds', () => {
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
    const result = conceptNeighbourhood(graph, names, 'Plant roots?');
    assert.deepEqual(
        result.concepts.map((c) => c.name),
        ['Root', 'Hyphae', 'Fungus'],
    );
    assert.equal(result.concepts[0].guess, 0.8);
    assert.equal(result.concepts[1].familiarity, 0.8);
    assert.deepEqual(result.links, [graph.links[0]]);
    assert.equal(conceptNeighbourhood(graph, names, 'Soil').concepts[0].familiarity, 'unknown');
    assert.deepEqual(conceptNeighbourhood(graph, names, 'Uproot').concepts, []);
    for (let i = 0; i < 100; i++) {
        graph.concepts.push(concept(`Connected ${i}`));
        graph.links.push({ from: 'Root', to: `Connected ${i}`, kind: 'builds on' });
    }
    const bounded = conceptNeighbourhood(graph, names, 'Root');
    assert.equal(bounded.concepts[0].name, 'Root');
    assert.equal(bounded.concepts.length, 15);
    assert.ok(bounded.links.every((l) => bounded.concepts.some((c) => c.name === l.to)));
    assert.ok(JSON.stringify(bounded).length < 12000);
});

test('neighbourhood guesses average unique directly observed neighbours, including outside the selected set', () => {
    const graph = {
        concepts: [
            { name: 'Centre', topics: [], familiarity: 0.3, observations: [0] },
            { name: 'Low', topics: [], familiarity: 0.2, observations: [1] },
            { name: 'High', topics: [], familiarity: 0.8, observations: [1] },
            { name: 'Unobserved', topics: [], familiarity: 0.3, observations: [0] },
        ],
        links: [
            { from: 'Centre', to: 'Low', kind: 'related' },
            { from: 'Low', to: 'Centre', kind: 'builds on' },
            { from: 'High', to: 'Centre', kind: 'related' },
            { from: 'Centre', to: 'Unobserved', kind: 'related' },
        ],
    };
    const names = graph.concepts.map((c, id) => ({ id, name: c.name }));
    const result = conceptNeighbourhood(graph, names, 'Centre');
    assert.equal(result.concepts[0].guess, 0.5, 'two links to Low count that concept only once');
    assert.deepEqual(result.links, [graph.links[1]], 'builds-on direction stays intact');
    graph.concepts[0].topics = ['x'.repeat(7880)];
    const trimmed = conceptNeighbourhood(graph, names, 'Centre');
    assert.deepEqual(
        trimmed.concepts.map((c) => c.name),
        ['Centre'],
    );
    assert.equal(
        trimmed.concepts[0].guess,
        0.5,
        'a guess still uses neighbours outside the budget',
    );
    assert.deepEqual(trimmed.links, []);
    assert.ok(JSON.stringify(trimmed).length <= 8000);
});

test('direct matches precede ranked semantic matches and neither is displaced by neighbours', () => {
    const graph = {
        concepts: ['Exact', 'Semantic best', 'Semantic next', 'Linked', 'Distant', 'Too far'].map(
            (name) => ({ name, topics: [], familiarity: 0.3, observations: [0] }),
        ),
        links: [
            { from: 'Linked', to: 'Distant', kind: 'related' },
            { from: 'Distant', to: 'Too far', kind: 'related' },
            { from: 'Semantic best', to: 'Linked', kind: 'builds on' },
        ],
    };
    const names = graph.concepts.map((c, id) => ({ id, name: c.name }));
    const result = conceptNeighbourhood(graph, names, 'Exact', ['Semantic best', 'Semantic next']);
    assert.deepEqual(
        result.concepts.map((c) => c.name),
        ['Exact', 'Semantic best', 'Semantic next', 'Linked', 'Distant'],
    );
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
