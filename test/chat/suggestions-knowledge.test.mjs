import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SAVED, start } from '../support/suggestion-kit.mjs';

// Graph shape without the derived familiarity fields.
const shape = (g) => ({ ...g, concepts: g.concepts.map(({ name, topics }) => ({ name, topics })) });

const GRAPH = {
  topics: ['Concurrency', 'operating systems'],
  concepts: [
    { name: 'Mutual exclusion', topics: ['Concurrency', 'operating systems'] },
    { name: "Peterson's algorithm", topics: ['Concurrency'] },
  ],
  links: [{ from: "Peterson's algorithm", to: 'Mutual exclusion', kind: 'builds on' }],
};

test('the same suggestion call fills one global knowledge graph that survives restart and reuses concepts across learning trees', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-graph-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  // One tutor call and one suggestion call: graph data adds no model call.
  assert.equal(env.calls.length, 2);
  assert.equal(env.suggestionCalls().length, 1);
  assert.deepEqual(
    shape(await env.get('/api/graph')),
    GRAPH,
    'invalid concepts and links are dropped',
  );
  assert.equal((await env.get(`/api/trees/${a.id}`)).suggestions[0].passages.length, 2);
  await env.close();

  env = await start(dir);
  assert.deepEqual(shape(await env.get('/api/graph')), GRAPH);
  // Another learning tree on another provider: the known names are sent, and the model reuses "Peterson's algorithm" instead of "Peterson lock".
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain locks again' });
  await env.settled();
  assert.equal((await env.get(`/api/trees/${b.id}`)).suggestions[0].status, 'ready');
  // A differently cased name reuses its concept; the new link joins the existing concepts.
  assert.deepEqual(shape(await env.get('/api/graph')), {
    ...GRAPH,
    links: [
      { from: 'Mutual exclusion', to: "Peterson's algorithm", kind: 'related' },
      ...GRAPH.links,
    ],
  });
  // Graph data never enters tutor history.
  env.store.forgetThread(a.id);
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Continue' });
  await env.settled();
  for (const call of env.calls.filter((c) => !c.system.startsWith('You mark')))
    assert.doesNotMatch(call.system + call.input, /Peterson|knownConcepts|"concepts"/);
  const last = env.suggestionCalls().at(-1).input,
    newline = last.indexOf('\n');
  // The known topics go out with the instruction to reuse them and keep topics broad and few.
  assert.match(last.slice(0, newline), /keep topics broad and few/);
  assert.match(last.slice(0, newline), /reuse a known topic whenever one fits/);
  assert.deepEqual(JSON.parse(last.slice(newline + 1)).knownConcepts, {
    Concurrency: ['Mutual exclusion', "Peterson's algorithm"],
    'operating systems': ['Mutual exclusion'],
  });
});

test('state reports the concept-name list size so Settings can warn past about 2k tokens', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-graph-warn-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain many concepts' });
  await env.settled();
  assert.ok((await env.get('/api/state')).conceptNameTokens < 2000);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain more' });
  await env.settled();
  const tokens = (await env.get('/api/state')).conceptNameTokens;
  assert.ok(tokens > 2000, `${tokens} tokens`);
  await env.close();
  env = await start(dir);
  assert.equal((await env.get('/api/state')).conceptNameTokens, tokens);
});

test('meeting, asking about, using and ignoring a concept add evidence; familiarity follows it, corrections outrank it and the suggestion call receives it', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-evidence-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const concept = async (name) =>
    (await env.get('/api/graph')).concepts.find((c) => c.name === name);
  const sent = () =>
    JSON.parse(
      env
        .suggestionCalls()
        .at(-1)
        .input.slice(env.suggestionCalls().at(-1).input.indexOf('\n') + 1),
    ).familiarity;
  const P = "Peterson's algorithm",
    M = 'Mutual exclusion';

  // Met: every concept of a saved reply, once per reply.
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  assert.deepEqual(await concept(M), {
    name: M,
    topics: ['Concurrency', 'operating systems'],
    familiarity: 0.1,
    evidence: { met: 1, asked: 0, used: 0, ignored: 0 },
    correction: null,
  });
  assert.equal((await concept(P)).familiarity, 0.1);

  // Asked: branching from the passage the call tagged with the concept.
  const reply = (await env.get(`/api/trees/${a.id}`)).messages.at(-1);
  await env.post(`/api/trees/${a.id}/branches`, {
    messageId: reply.id,
    ...SAVED[0],
    suggestion: true,
    question: 'explain',
  });
  assert.deepEqual([(await concept(M)).evidence.asked, (await concept(M)).familiarity], [1, 0.3]);
  // A highlight with no concept in it adds nothing.
  await env.post(`/api/trees/${a.id}/branches`, {
    messageId: reply.id,
    ...SAVED[1],
    question: 'explain',
  });
  assert.equal((await concept(P)).evidence.asked, 0);

  // Met again in another tree under another wording; its tagged underline is left unexplored.
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain locks again' });
  await env.settled();
  assert.deepEqual([(await concept(M)).evidence.met, (await concept(P)).familiarity], [2, 0.2]);

  // Used: the learner names a concept; ignored: asking on moves past the unexplored underline. The call gets the relevant familiarity.
  await env.post(`/api/trees/${b.id}/messages`, { text: `What about ${P.toLowerCase()}?` });
  await env.settled();
  assert.deepEqual((await concept(P)).evidence, { met: 2, asked: 0, used: 1, ignored: 0 });
  assert.equal((await concept(P)).familiarity, 0.5);
  assert.deepEqual((await concept(M)).evidence, { met: 2, asked: 1, used: 0, ignored: 1 });
  assert.equal(
    (await concept(M)).familiarity,
    0.45,
    'an ignored underline moves familiarity only slightly',
  );
  assert.deepEqual(sent(), { [P]: 0.5 });
  // The same ignored underline never counts twice.
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Thanks' });
  await env.settled();
  assert.equal((await concept(M)).evidence.ignored, 1);

  // A correction outranks inference, including later evidence, and survives restart; the latest correction wins.
  assert.equal(env.store.correct(M, 'known'), true);
  await env.post(`/api/trees/${a.id}/messages`, { text: `Explain ${M} once more` });
  await env.settled();
  assert.deepEqual(sent(), { [M]: 1 });
  assert.deepEqual(
    [
      (await concept(M)).evidence.used,
      (await concept(M)).familiarity,
      (await concept(M)).correction,
    ],
    [1, 1, 'known'],
  );
  await env.close();
  env = await start(dir);
  assert.equal((await concept(M)).familiarity, 1);
  env.store.correct(M, 'unknown');
  assert.deepEqual([(await concept(M)).familiarity, (await concept(M)).correction], [0, 'unknown']);
});

test('Knowledge and tagged passage corrections validate over HTTP, persist, and override later inference in suggestion inputs', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-corrections-'));
  let env = await start(dir);
  t.after(async () => env.close());
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  const saved = await env.get(`/api/trees/${tree.id}`);
  const { concept: name, text } = saved.suggestions[0].passages[0];
  assert.equal(name, 'Mutual exclusion');
  assert.notEqual(text, name, 'passage wording need not be the concept name');
  for (const body of [
    null,
    {},
    { name, kind: 'met' },
    { name: '', kind: 'known' },
    { name: 1, kind: 'unknown' },
  ])
    assert.equal((await env.request('/api/graph/correct', body)).status, 400);
  assert.equal(
    (await env.request('/api/graph/correct', { name: 'missing', kind: 'known' })).status,
    404,
  );
  assert.equal(
    (await env.request('/api/graph/correct', { name, kind: 'known' }, { 'X-TreeTutor-CSRF': '' }))
      .status,
    403,
  );
  const concept = async () => (await env.get('/api/graph')).concepts.find((c) => c.name === name);
  const sent = () =>
    JSON.parse(env.suggestionCalls().at(-1).input.split('\n').slice(1).join('\n')).familiarity[
      name
    ];
  for (const [kind, value] of [
    ['known', 1],
    ['unknown', 0],
  ]) {
    const calls = env.suggestionCalls().length;
    assert.equal((await env.request('/api/graph/correct', { name, kind })).status, 200);
    assert.equal(env.suggestionCalls().length, calls, 'correcting adds no model call');
    assert.deepEqual(
      (await env.get(`/api/trees/${tree.id}`)).suggestions[0],
      saved.suggestions[0],
      'correcting leaves saved underlines intact',
    );
    await env.close();
    env = await start(dir);
    assert.deepEqual([(await concept()).correction, (await concept()).familiarity], [kind, value]);
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Mutual exclusion locks' });
    await env.settled();
    assert.equal(sent(), value, 'explicit correction outranks additional use and ignored evidence');
    assert.equal((await concept()).familiarity, value);
  }
});

test('Knowledge merge combines cross-tree topics, evidence, links and latest correction; aliases and passages keep working after restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-merge-'));
  let env = await start(dir);
  t.after(async () => env.close());
  const keep = "Peterson's algorithm",
    from = 'Peterson lock',
    mutex = 'Mutual exclusion';
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain duplicate locks' });
  await env.settled();
  // Seed one overlapping source event and a tagged saved passage, as a model can return both names for the same reply.
  const reply = (await env.get(`/api/trees/${b.id}`)).messages.at(-1);
  env.store.addGraph({ concepts: [{ name: keep, topics: ['Concurrency'] }], links: [] }, reply.id);
  env.store.db
    .prepare('UPDATE suggestions SET passages=? WHERE message=?')
    .run(JSON.stringify([{ start: 0, end: 13, text: 'Authoritative', concept: from }]), reply.id);
  await env.post(`/api/trees/${a.id}/messages`, { text: "Peterson's algorithm and Peterson lock" });
  await env.settled();
  await env.post('/api/graph/correct', { name: keep, kind: 'unknown' });
  await env.post('/api/graph/correct', { name: from, kind: 'known' });
  // Move the older correction into the concept with a newer correction; insertion during merge must not reverse them.
  const merged = await env.request('/api/graph/merge', { from: keep, into: from });
  assert.equal(merged.status, 200);
  let graph = await merged.json(),
    c = graph.concepts.find((c) => c.name === from);
  assert.equal(graph.concepts.length, 2);
  assert.deepEqual(c.topics, ['Algorithms', 'Concurrency']);
  assert.deepEqual(c.evidence, { met: 2, asked: 0, used: 1, ignored: 0 });
  assert.deepEqual([c.correction, c.familiarity], ['known', 1]);
  assert.deepEqual(graph.links, [
    { from: mutex, to: from, kind: 'related' },
    { from, to: mutex, kind: 'builds on' },
  ]);
  assert.ok(graph.links.every((l) => l.from !== l.to));
  await env.close();
  env = await start(dir);
  assert.deepEqual(await env.get('/api/graph'), graph);
  // Merge back through a third canonical name, retaining aliases transitively and rewriting the old passage tag.
  env.store.addGraph({
    concepts: [{ name: 'Peterson mutex', topics: ['Concurrency'] }],
    links: [],
  });
  await env.post('/api/graph/merge', { from, into: 'Peterson mutex' });
  assert.equal(
    (await env.get(`/api/trees/${b.id}`)).suggestions[0].passages[0].concept,
    'Peterson mutex',
  );
  const branched = JSON.parse(
    await env.post(`/api/trees/${b.id}/branches`, {
      messageId: reply.id,
      start: 0,
      end: 13,
      text: 'Authoritative',
      question: 'Explain',
    }),
  );
  assert.ok(branched.id);
  await env.post('/api/graph/correct', { name: keep, kind: 'unknown' });
  await env.post(`/api/trees/${a.id}/messages`, {
    text: "Peterson's algorithm and Peterson lock duplicate locks",
  });
  await env.settled();
  graph = await env.get('/api/graph');
  c = graph.concepts.find((c) => c.name === 'Peterson mutex');
  assert.equal(
    graph.concepts.length,
    2,
    'old names from the next suggestion result do not recreate duplicates',
  );
  assert.equal(c.evidence.asked, 1, 'tagged passage still adds evidence after merge');
  assert.equal(
    c.evidence.used,
    2,
    'both before and after merge, one question mentioning both names counts once',
  );
  assert.deepEqual([c.familiarity, c.correction], [0, 'unknown']);
  const familiarity = JSON.parse(
    env.suggestionCalls().at(-1).input.split('\n').slice(1).join('\n'),
  ).familiarity;
  assert.equal(familiarity[keep], 0);
  assert.equal(familiarity[from], 0);
  const before = graph;
  for (const body of [
    null,
    {},
    { from },
    { from, into: from },
    { from: 'Peterson mutex', into: keep },
  ])
    assert.equal((await env.request('/api/graph/merge', body)).status, 400);
  assert.equal(
    (await env.request('/api/graph/merge', { from: 'missing', into: from })).status,
    404,
  );
  assert.equal(
    (await env.request('/api/graph/merge', { from: mutex, into: from }, { 'X-TreeTutor-CSRF': '' }))
      .status,
    403,
  );
  assert.deepEqual(
    await env.get('/api/graph'),
    before,
    'invalid requests leave the graph unchanged',
  );
});

test('a failed Knowledge merge rolls back evidence, topics, links, aliases and saved passage references', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-merge-rollback-')),
    env = await start(dir);
  t.after(async () => env.close());
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain locks' });
  await env.settled();
  const graph = await env.get('/api/graph'),
    saved = await env.get(`/api/trees/${tree.id}`);
  env.store.db.exec(
    "CREATE TRIGGER reject_concept_delete BEFORE DELETE ON concepts BEGIN SELECT RAISE(ABORT, 'fixture merge failure'); END;",
  );
  assert.equal(
    (
      await env.request('/api/graph/merge', {
        from: "Peterson's algorithm",
        into: 'Mutual exclusion',
      })
    ).status,
    500,
  );
  assert.deepEqual(await env.get('/api/graph'), graph);
  assert.deepEqual(await env.get(`/api/trees/${tree.id}`), saved);
  assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
  env.store.db.exec('DROP TRIGGER reject_concept_delete');
  assert.equal(
    (
      await env.request('/api/graph/merge', {
        from: "Peterson's algorithm",
        into: 'Mutual exclusion',
      })
    ).status,
    200,
  );
});
