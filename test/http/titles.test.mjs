import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { cleanTitle, titlePrompt } from '../../server/http/jobs/title.mjs';

const data = (prompt) => JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));

test('title prompt: a root reads its question; a child also reads its inherited context', () => {
  const root = titlePrompt({ branch: null }, '¿Qué es un árbol de torneo?');
  assert.match(root, /at most 60 characters/);
  assert.match(root, /language of "question"/);
  assert.deepEqual(data(root), { question: '¿Qué es un árbol de torneo?' });
  const child = titlePrompt(
    { branch: { snapshot: 'Tournament trees pick winners.', text: 'winners', question: 'Why?' } },
    'Why winners?',
  );
  assert.deepEqual(data(child), {
    inheritedContext: { snapshot: 'Tournament trees pick winners.', selectedPassage: 'winners' },
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

test('first question saves the placeholder, then quick thinking replaces it unless renamed, failed or unset', async (t) => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-titles-')), 'trees.sqlite'));
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
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
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
  assert.deepEqual(data(prompts[0].text), { question });
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
    question: 'Why do winners move up?',
  });
  assert.equal(title(child.id), 'Tournament trees');
});

test('an older usage table gains the title task and keeps its rows', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-titles-upgrade-')), 'trees.sqlite');
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
    input INTEGER, output INTEGER, cacheRead INTEGER, message TEXT REFERENCES messages(id) ON DELETE SET NULL); INSERT INTO usage_events SELECT * FROM u; DROP TABLE u;`);
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
