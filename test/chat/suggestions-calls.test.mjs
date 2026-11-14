import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SAVED, start, until } from '../support/suggestion-kit.mjs';

const strip = (s) =>
  s.map(({ message, status, passages, usage }) => ({
    message,
    status,
    passages,
    usage: usage && { input: usage.input, output: usage.output, cacheRead: usage.cacheRead },
  }));

test('phrase-only suggestions anchor in order, then anywhere, then across whitespace; overlaps, missing phrases and split surrogates drop', async (t) => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-phrases-')));
  t.after(() => env.close());
  for (const provider of ['claude', 'codex']) {
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${tree.id}/model`, {
      provider,
      model: provider === 'claude' ? 'haiku' : 'fixture-model',
    });
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Check phrase anchors' });
    await env.settled();
    const saved = await env.get(`/api/trees/${tree.id}`),
      reply = saved.messages.at(-1);
    assert.equal(saved.suggestions[0].status, 'ready');
    assert.deepEqual(saved.suggestions[0].passages, [
      { start: 0, end: 2, text: '🪴' },
      { start: 3, end: 8, text: 'early' },
      { start: 11, end: 17, text: 'middle' },
      { start: 20, end: 25, text: 'early' },
      { start: 28, end: 32, text: 'late' },
      { start: 35, end: 49, text: 'shared \n\tstate' },
      { start: 52, end: 64, text: 'shared state' },
      { start: 67, end: 81, text: 'C++ (x.y) [z]?' },
      { start: 84, end: 85, text: 'a' },
      { start: 86, end: 89, text: 'a a' },
    ]);
    for (const passage of saved.suggestions[0].passages)
      assert.equal(reply.text.slice(passage.start, passage.end), passage.text);
    const request = env.requests.at(-1),
      input = JSON.parse(request.slice(request.indexOf('\n') + 1));
    assert.deepEqual(input, {
      inheritedContext: null,
      question: 'Check phrase anchors',
      answer: reply.text,
      knownConcepts: {},
      familiarity: {},
    });
    assert.equal(
      request.split(JSON.stringify(reply.text)).length - 1,
      1,
      'reply sent once with no offset table on either provider',
    );
  }
});

test('a completed reply gets one cheap-model suggestion call whose exact passages and usage are saved; reopening, switching and old replies never run it', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-'));
  // A reply saved before suggestions existed.
  let env = await start(dir, false);
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Before suggestions' });
  await env.close();

  env = await start(dir);
  assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).suggestions, []);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain brackets' });
  await env.settled();
  let saved = await env.get(`/api/trees/${tree.id}`);
  const reply = saved.messages.at(-1);
  assert.equal(env.suggestionCalls().length, 1);
  assert.equal(env.suggestionCalls()[0].model, 'haiku');
  const input = JSON.parse(
    env.suggestionCalls()[0].input.slice(env.suggestionCalls()[0].input.indexOf('\n') + 1),
  );
  assert.deepEqual(input, {
    inheritedContext: null,
    question: 'Explain brackets',
    answer: 'Authoritative original',
    knownConcepts: {},
    familiarity: {},
  });
  assert.deepEqual(strip(saved.suggestions), [
    {
      message: reply.id,
      status: 'ready',
      passages: SAVED,
      usage: { input: 103, output: 7, cacheRead: 40 },
    },
  ]);
  for (const p of saved.suggestions[0].passages)
    assert.equal(reply.text.slice(p.start, p.end), p.text);
  // The suggestion call's usage counts in today's total but not as a reply.
  assert.deepEqual((await env.get('/api/state')).usage, {
    input: 309,
    output: 21,
    cacheRead: 120,
    replies: 2,
  });

  // Isolation: a fresh tutor session replays saved history without suggestion instructions or results; so does branch compaction.
  env.store.forgetThread(tree.id);
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue, no usage' });
  await env.post(`/api/trees/${tree.id}/branches`, {
    messageId: reply.id,
    ...SAVED[0],
    question: 'What is that?',
  });
  for (const call of env.calls.filter((c) => !c.system.startsWith('You mark'))) {
    assert.doesNotMatch(
      call.system + call.input,
      /You mark passages|Mark every term|"suggestions"|"passages"|knownConcepts|"concepts"/,
    );
  }
  await env.settled();
  const calls = env.suggestionCalls().length;
  assert.equal(calls, 2, 'the second completed reply ran one call; compaction ran none');

  // Switching provider and reopening run nothing new.
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.close();
  env = await start(dir);
  saved = await env.get(`/api/trees/${tree.id}`);
  await env.settled();
  assert.equal(env.suggestionCalls().length, 0);
  assert.equal(saved.suggestions.length, 2);
  assert.ok(
    !saved.suggestions.some((s) => s.message === saved.messages[1].id),
    'the pre-feature reply stays without suggestions',
  );
});

test('failed, partial and canceled replies run no suggestions; Codex uses its Luna model', async (t) => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-codex-')));
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain rounds' });
  await env.settled();
  const saved = await env.get(`/api/trees/${tree.id}`);
  const expected = [
    {
      message: saved.messages.at(-1).id,
      status: 'ready',
      passages: SAVED,
      usage: { input: 30, output: 9, cacheRead: 20 },
    },
  ];
  assert.deepEqual(strip(saved.suggestions), expected);

  await env.post(`/api/trees/${tree.id}/messages`, { text: 'fail' });
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  const pending = env.post(`/api/trees/${tree.id}/messages`, { text: 'hold' });
  await until(() => env.turns.at(-1)?.input[0].text === 'hold');
  await env.post(`/api/trees/${tree.id}/stop`);
  await pending;
  await env.settled();
  const after = await env.get(`/api/trees/${tree.id}`);
  assert.deepEqual(
    after.messages.filter((m) => m.role === 'assistant').map((m) => m.status),
    ['completed', 'failed', 'interrupted'],
  );
  assert.deepEqual(strip(after.suggestions), expected);
});

test('a failed suggestion call is saved as failed with its usage and manual branching still works', async (t) => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-fail-')));
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, suggestions fail' });
  await env.settled();
  const saved = await env.get(`/api/trees/${tree.id}`);
  assert.deepEqual(strip(saved.suggestions), [
    {
      message: saved.messages[1].id,
      status: 'failed',
      passages: [],
      usage: { input: 103, output: 7, cacheRead: 40 },
    },
  ]);
  const child = JSON.parse(
    await env.post(`/api/trees/${tree.id}/branches`, {
      messageId: saved.messages[1].id,
      start: 0,
      end: 13,
      text: 'Authoritative',
      question: 'Why?',
    }),
  );
  assert.equal(child.branch.text, 'Authoritative');
});

test('two conversations run suggestions concurrently while chat stays usable', async (t) => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-concurrent-')));
  t.after(async () => {
    await env.close();
  });
  // An unstarted chat is reused, so each conversation is started before the next is created.
  const a = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain, slow suggestions' });
  const b = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain, slow suggestions' });
  assert.deepEqual(new Set((await env.get('/api/state')).suggesting), new Set([a.id, b.id]));
  // Chat continues while its suggestions are pending.
  assert.match(
    await env.post(`/api/trees/${a.id}/messages`, { text: 'Quick follow-up' }),
    /"status":"completed"/,
  );
  env.release();
  await env.settled();
  for (const tree of [a, b])
    assert.ok(
      (await env.get(`/api/trees/${tree.id}`)).suggestions.every((s) => s.status === 'ready'),
    );
  assert.equal(env.suggestionCalls().length, 3);
});

test('stopping during a suggestion call marks it failed on restart and does not rerun it', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-stop-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, slow suggestions' });
  await env.close();
  env = await start(dir);
  await env.settled();
  assert.deepEqual(
    (await env.get(`/api/trees/${tree.id}`)).suggestions.map((s) => s.status),
    ['failed'],
  );
  assert.equal(env.suggestionCalls().length, 0);
});

test('branching from a suggestion marks it explored with its child at every depth; manual branches and deleted children leave it unexplored', async (t) => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-suggest-explore-')));
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain brackets' });
  await env.settled();
  const reply = (await env.get(`/api/trees/${tree.id}`)).messages.at(-1);
  const passages = async (id) => (await env.get(`/api/trees/${id}`)).suggestions[0].passages;

  // A manual highlight of the same text is a branch but does not explore the suggestion.
  const manual = JSON.parse(
    await env.post(`/api/trees/${tree.id}/branches`, {
      messageId: reply.id,
      ...SAVED[0],
      question: 'Manual',
    }),
  );
  assert.deepEqual(await passages(tree.id), SAVED);
  const child = JSON.parse(
    await env.post(`/api/trees/${tree.id}/branches`, {
      messageId: reply.id,
      ...SAVED[0],
      suggestion: true,
      question: 'explain',
    }),
  );
  assert.deepEqual([child.branch.text, child.branch.question], ['Authoritative', 'explain']);
  assert.deepEqual(await passages(tree.id), [{ ...SAVED[0], child: child.id }, SAVED[1]]);
  // A stale second suggestion branch never steals the live child reference.
  const extra = JSON.parse(
    await env.post(`/api/trees/${tree.id}/branches`, {
      messageId: reply.id,
      ...SAVED[0],
      suggestion: true,
      question: 'again',
    }),
  );
  assert.equal((await passages(tree.id))[0].child, child.id);

  // Grandchild: the child's own reply gets suggestions and branching from one explores it there.
  await env.post(`/api/trees/${child.id}/messages`, { text: 'explain' });
  await env.settled();
  const childReply = (await env.get(`/api/trees/${child.id}`)).messages.at(-1);
  const grandchild = JSON.parse(
    await env.post(`/api/trees/${child.id}/branches`, {
      messageId: childReply.id,
      ...SAVED[1],
      suggestion: true,
      question: 'explain',
    }),
  );
  assert.equal((await passages(child.id))[1].child, grandchild.id);
  assert.equal(grandchild.branch.parent, child.id);

  // Deleting the explored child makes the underline unexplored again.
  await env.post(`/api/trees/${tree.id}/delete`, { conversation: child.id });
  assert.deepEqual(await passages(tree.id), SAVED);
  assert.ok([manual, extra].every(Boolean));
});
