import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { cleanTitle, readTitle, titlePrompt } from '../../server/http/jobs/title.mjs';

const data = (prompt) => JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));

test('title prompt: a root reads its question; a child also reads its inherited context', () => {
  const root = titlePrompt({ branch: null }, '¿Qué es un árbol de torneo?');
  assert.deepEqual(data(root), { nearestConcepts: [], question: '¿Qué es un árbol de torneo?' });
  const child = titlePrompt(
    { branch: { snapshot: 'Tournament trees pick winners.', text: 'winners', question: 'Why?' } },
    'Why winners?',
  );
  assert.deepEqual(data(child), {
    inheritedContext: { snapshot: 'Tournament trees pick winners.', selectedPassage: 'winners' },
    nearestConcepts: [],
    question: 'Why winners?',
  });
});

test('clean title keeps one plain line of about 60 characters at most', () => {
  assert.equal(cleanTitle('  "**Tournament trees**."\nextra'), 'Tournament trees');
  assert.equal(cleanTitle('# Heaps'), 'Heaps');
  const long = cleanTitle('word '.repeat(30));
  assert.ok(long.length <= 60 && !long.endsWith(' '), long);
  assert.equal(cleanTitle('x'.repeat(90)).length, 60);
  assert.equal(cleanTitle(' \n '), '');
});

test('read title: JSON title and concept, a plain line, and an unreadable concept', () => {
  assert.deepEqual(readTitle('```json\n{"title":"**Heaps**.","concept":" Heap "}\n```'), {
    title: 'Heaps',
    concept: 'Heap',
  });
  assert.deepEqual(readTitle('{"title":"Heaps","concept":null}'), {
    title: 'Heaps',
    concept: null,
  });
  assert.deepEqual(readTitle('{"title":"Heaps","concept":42}'), { title: 'Heaps', concept: null });
  assert.deepEqual(readTitle('Tournament trees'), { title: 'Tournament trees', concept: null });
  assert.deepEqual(readTitle('{"title":"Heaps",'), { title: '', concept: null });
});

test('the title job sets the explored concept once, from the nearest concepts or a new one', async (t) => {
  const store = new Store(
    join(mkdtempSync(join(tmpdir(), 'rabbithole-explored-')), 'trees.sqlite'),
  );
  const prompts = [];
  let answer;
  const quick = {
    models: async () => [{ model: 'quick-model', efforts: ['low'] }],
    generate: async (tree, text, emit) => {
      prompts.push(text);
      emit({ type: 'item', item: 't', text: answer });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const chat = {
    generate: async (tree, text, emit) => {
      emit({ type: 'item', item: 'a', text: 'An answer.' });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    providers: { codex: chat, claude: quick },
    auth: { status: () => ({ connected: true }) },
    log: () => {},
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    app.stop();
    store.close();
  });
  store.saveSuggestionSettings({
    enabled: false,
    model: { provider: 'claude', model: 'quick-model' },
    effort: 'low',
  });
  store.addGraph({
    concepts: [
      { name: 'Tournament trees', topics: ['Algorithms'] },
      { name: 'Winner tree', topics: ['Algorithms'] },
    ],
    links: [],
  });
  store.mergeConcepts('Winner tree', 'Tournament trees');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (route, body) =>
    fetch(`${origin}/api/trees${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const ask = async (text, reply) => {
    answer = reply;
    const id = (await (await post('', {})).json()).id;
    await (await post(`/${id}/messages`, { text })).text();
    await app.settled();
    return id;
  };
  const concept = (id) => store.list().find((c) => c.id === id).concept;

  // An alias resolves to its concept; the prompt carries the nearest concept names.
  const alias = await ask(
    'How do tournament trees pick a winner?',
    '{"title":"Tournament winners","concept":"winner tree"}',
  );
  assert.deepEqual(data(prompts.at(-1)).nearestConcepts, ['Tournament trees']);
  assert.equal(store.tree(alias).title, 'Tournament winners');
  assert.equal(concept(alias), 'Tournament trees');
  // Renaming keeps the explored concept.
  assert.equal((await post(`/${alias}/rename`, { title: 'Mine' })).status, 200);
  assert.equal(concept(alias), 'Tournament trees');

  // A new name creates a concept without topics.
  const fresh = await ask('What is a heap?', '{"title":"Heaps","concept":"Binary heap"}');
  assert.equal(concept(fresh), 'Binary heap');
  assert.deepEqual(store.graph().concepts.find((c) => c.name === 'Binary heap').topics, []);

  // An unreadable concept keeps the title and leaves the concept empty; none stays empty too.
  const unreadable = await ask('What is a trie?', '{"title":"Tries","concept":["Trie"]}');
  assert.equal(store.tree(unreadable).title, 'Tries');
  assert.equal(concept(unreadable), null);
  const none = await ask('Hello there', '{"title":"Greeting","concept":null}');
  assert.equal(concept(none), null);
  assert.equal(store.list().find((c) => c.id === none).learnerMessages, 1);
});

test('first question saves the placeholder, then quick thinking replaces it unless renamed, failed or unset', async (t) => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-titles-')), 'trees.sqlite'));
  const logs = [],
    prompts = [];
  let reply = async (emit) => {
    emit({ type: 'item', item: 't', text: 'Tournament trees' });
    emit({ type: 'status', status: 'completed' });
  };
  const quick = {
    models: async () => [{ model: 'quick-model', efforts: ['low'] }],
    generate: async (tree, text, emit) => {
      prompts.push({ tree, text });
      emit({ type: 'usage', usage: { input: 7, output: 3, cacheRead: 0 } });
      await reply(emit);
    },
  };
  const chat = {
    generate: async (tree, text, emit) => {
      emit({ type: 'item', item: 'a', text: 'An answer.' });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    providers: { codex: chat, claude: quick },
    auth: { status: () => ({ connected: true }) },
    log: (line) => logs.push(line),
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (route, body) =>
    fetch(`${origin}/api/trees${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const ask = async (text, id) => {
    id ??= (await (await post('', {})).json()).id;
    const stream = await (await post(`/${id}/messages`, { text })).text();
    assert.match(stream, /"status":"completed"/);
    assert.doesNotMatch(stream, /"type":"error"/);
    return id;
  };
  const title = (id) => store.tree(id).title;
  const warnings = () => logs.filter((l) => / WARN title kept placeholder/.test(l));

  // Unset quick thinking: placeholder kept, warning logged, no call.
  const question = 'How do tournament trees find the winner of many players quickly? '.repeat(4);
  const unset = await ask(question);
  await app.settled();
  assert.equal(title(unset), question.trim().slice(0, 200));
  assert.equal(prompts.length, 0);
  assert.equal(warnings().length, 1);
  assert.ok(!warnings()[0].includes('tournament'), 'the question stays out of logs');

  store.saveSuggestionSettings({
    enabled: false,
    model: { provider: 'claude', model: 'quick-model' },
    effort: 'low',
  });
  const root = await ask(question);
  await app.settled();
  assert.equal(title(root), 'Tournament trees');
  assert.deepEqual(data(prompts[0].text), { nearestConcepts: [], question });
  assert.equal(prompts[0].tree.thread, null);
  assert.deepEqual(
    store
      .usageEvents()
      .events.filter((e) => e.task === 'title')
      .map((e) => [e.provider, e.model, e.input, e.output]),
    [['claude', 'quick-model', 7, 3]],
  );
  // Only the first learner message titles a conversation.
  await ask('A second question', root);
  await app.settled();
  assert.equal(prompts.length, 1);

  // Rename during the job wins; the placeholder showed at once.
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const plain = reply;
  reply = async (emit) => {
    await gate;
    await plain(emit);
  };
  const renamed = await ask('What is a heap?');
  assert.equal(title(renamed), 'What is a heap?');
  assert.equal((await post(`/${renamed}/rename`, { title: 'My heaps' })).status, 200);
  release();
  await app.settled();
  assert.equal(title(renamed), 'My heaps');

  // Failed and empty results keep the placeholder with a warning only.
  for (const failure of [
    async (emit) => {
      emit({ type: 'status', status: 'failed' });
      throw new Error('Claude: overloaded.');
    },
    async (emit) => emit({ type: 'status', status: 'completed' }),
  ]) {
    reply = failure;
    const before = warnings().length;
    const id = await ask('What is a trie?');
    await app.settled();
    assert.equal(title(id), 'What is a trie?');
    assert.equal(warnings().length, before + 1);
  }

  // A child reads its inherited context; its placeholder is the branch question.
  reply = plain;
  const parent = store.tree(root);
  const child = store.branch(
    parent,
    {
      messageId: parent.messages[1].id,
      start: 0,
      end: 2,
      text: 'An',
      question: 'Why do winners move up?',
    },
    'Tournament trees compare pairs.',
  );
  assert.equal(title(child.id), 'Why do winners move up?');
  await ask('Why do winners move up?', child.id);
  await app.settled();
  assert.deepEqual(data(prompts.at(-1).text), {
    inheritedContext: { snapshot: 'Tournament trees compare pairs.', selectedPassage: 'An' },
    nearestConcepts: [],
    question: 'Why do winners move up?',
  });
  assert.equal(title(child.id), 'Tournament trees');
});

test('an older usage table gains the title task and keeps its rows', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-titles-upgrade-')), 'trees.sqlite');
  let store = new Store(path);
  store.record(
    'chat:old',
    'chat',
    { provider: 'codex', model: 'm' },
    { input: 1, output: 2, cacheRead: 3 },
  );
  // Recreate the previous task check in place.
  store.db
    .exec(`ALTER TABLE usage_events RENAME TO u; CREATE TABLE usage_events (id TEXT PRIMARY KEY, at INTEGER NOT NULL, provider TEXT, model TEXT, task TEXT NOT NULL CHECK(task IN ('chat','suggestions','compaction','diagram','video')),
    input INTEGER, output INTEGER, cacheRead INTEGER, message TEXT REFERENCES messages(id) ON DELETE SET NULL); INSERT INTO usage_events SELECT id,at,provider,model,task,input,output,cacheRead,message FROM u; DROP TABLE u;`);
  assert.throws(() => store.record('title:x', 'title', null, null));
  store.close();
  store = new Store(path);
  store.record('title:x', 'title', { provider: 'claude', model: 'q' }, null);
  assert.deepEqual(
    store.usageEvents().events.map((e) => [e.task, e.input]),
    [
      ['chat', 1],
      ['title', null],
    ],
  );
  store.close();
});
