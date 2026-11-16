import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../support/diagram-kit.mjs';
import { tutorSystem } from '../../server/media/diagrams.mjs';
import { verdictPrompt } from '../../server/http/jobs/verdicts.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const block = (entries) => '\n```rabbithole-verdict\n' + JSON.stringify(entries) + '\n```';
const observation = (concept, level, confidence = 'high') => ({ concept, level, confidence });

test('streamed verdicts save only observations, resolve aliases, create concepts, and retry replaces the learner message observations', async (t) => {
  let env,
    id,
    fail = false;
  let raw =
    'Yes, that is right.' +
    block([
      observation('Mutex', 5),
      observation('mutex', 4, 'low'),
      observation('Mutual exclusion', 3),
      observation('A new concept', 2, 'low'),
    ]) +
    '\nThe rest of the explanation.';
  const calls = [];
  const provider = {
    generate: async (tree, question, emit) => {
      calls.push({ tree, question });
      assert.match(tutorSystem(tree), /rabbithole-verdict/);
      for (const character of raw) {
        emit({ type: 'delta', item: 'answer', text: character });
        const saved = env.store.tree(id).messages.at(-1).text;
        assert.doesNotMatch(saved, /rabbithole|confidence|"concept"|"level"/);
      }
      emit({ type: 'item', item: 'answer', text: raw });
      if (fail) throw new Error('Fixture interrupted provider reply');
      emit({ type: 'status', status: 'completed' });
    },
  };
  env = await open(provider);
  t.after(env.close);
  id = (await (await env.post('/api/trees')).json()).id;
  env.store.addGraph({
    concepts: [
      { name: 'Mutex', topics: ['Concurrency'] },
      { name: 'Mutual exclusion', topics: ['Concurrency'] },
    ],
    links: [],
  });
  env.store.mergeConcepts('Mutual exclusion', 'Mutex');
  const ask = async (text, route = 'messages') => {
    const response = await env.post(`/api/trees/${id}/${route}`, { text });
    assert.equal(response.status, 200);
    const wire = await response.text();
    assert.doesNotMatch(wire, /rabbithole-verdict|confidence|"concept"|"level"/);
    return wire;
  };
  const graph = () => env.store.graph();
  const concept = (name) => graph().concepts.find((c) => c.name === name);
  await ask('A mutex prevents simultaneous access, right?');
  const [user, reply] = env.store.tree(id).messages;
  assert.equal(reply.text, 'Yes, that is right.\nThe rest of the explanation.');
  assert.deepEqual(concept('Mutex').observations, [0, 0, 0, 1, 0, 0]);
  assert.deepEqual(concept('A new concept').observations, [0, 0, 1, 0, 0, 0]);
  assert.deepEqual(concept('A new concept').topics, []);
  assert.equal(graph().concepts.length, 2);
  assert.deepEqual(
    env.store.db
      .prepare('SELECT DISTINCT message FROM observations')
      .all()
      .map((r) => r.message),
    [user.id],
  );
  assert.equal(env.store.tree(id).artifacts.length, 0, 'verdicts create no media');

  // A failed answer may already carry a complete verdict; a successful retry replaces its set.
  fail = true;
  raw = 'Let me clarify.' + block([observation('Mutex', 0), observation('Earlier verdict', 1)]);
  assert.match(await ask('A mutex lets everyone access it together?'), /"status":"failed"/);
  const failedUser = env.store.tree(id).messages.at(-2);
  assert.deepEqual(concept('Mutex').observations, [1, 0, 0, 1, 0, 0]);
  fail = false;
  raw = 'Here is the correction.' + block([observation('MUTEX', 2, 'low')]);
  assert.match(await ask(undefined, 'retry'), /"status":"completed"/);
  assert.equal(env.store.tree(id).messages.at(-2).id, failedUser.id);
  assert.deepEqual(concept('Mutex').observations, [0, 0, 1, 1, 0, 0]);
  assert.deepEqual(concept('Earlier verdict').observations, [0, 0, 0, 0, 0, 0]);
  assert.equal(
    env.store.db
      .prepare('SELECT COUNT(*) AS n FROM observations WHERE message=?')
      .get(failedUser.id).n,
    1,
  );

  raw = 'You are welcome.';
  await ask('Thanks!');
  assert.equal(env.store.tree(id).messages.at(-1).text, raw);
  assert.equal(env.store.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n, 3);
  assert.equal(calls.length, 4, 'no extra model calls for verdict tags');
  assert.equal(
    calls.at(-1).tree.messages.some((m) => /rabbithole-verdict/.test(m.text)),
    false,
  );
});

test('a reply with no readable verdict block asks quick thinking once and saves its verdicts; a failed call records nothing', async (t) => {
  const store = new Store(
    join(mkdtempSync(join(tmpdir(), 'rabbithole-verdicts-')), 'trees.sqlite'),
  );
  let raw, judge;
  const prompts = [];
  const quick = {
    models: async () => [{ model: 'quick-model', efforts: ['low'] }],
    generate: async (tree, text, emit) => {
      if (!text.startsWith(verdictPrompt('', '').split('{')[0])) return; // title calls
      prompts.push({ tree, text });
      await judge(emit);
    },
  };
  const chat = {
    generate: async (tree, text, emit) => {
      emit({ type: 'item', item: 'answer', text: raw });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    providers: { codex: chat, claude: quick },
    auth: { status: () => ({ connected: true }) },
    log: () => {},
    verdicts: true,
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
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (route, body) =>
    fetch(`${origin}/api/trees${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const id = (await (await post('', {})).json()).id;
  const ask = async (text) => {
    const stream = await (await post(`/${id}/messages`, { text })).text();
    assert.match(stream, /"status":"completed"/);
    await app.settled();
    return store.tree(id).messages.slice(-2);
  };
  const observed = (message) =>
    store.db.prepare('SELECT COUNT(*) AS n FROM observations WHERE message=?').get(message).n;
  const concept = (name) => store.graph().concepts.find((c) => c.name === name);
  judge = (emit) => {
    emit({
      type: 'item',
      item: 'v',
      text: '```json\n' + JSON.stringify([observation('Heap', 3), observation('bad', 9)]) + '\n```',
    });
    emit({ type: 'status', status: 'completed' });
  };

  // Readable block: no fallback call.
  raw = 'Right.' + block([observation('Heap', 2)]);
  await ask('A heap keeps the smallest on top?');
  assert.equal(prompts.length, 0);

  // Missing block: one call with the learner message and the reply; verdicts saved against the message.
  raw = 'A heap is a tree where each parent beats its children.';
  const [user] = await ask('So a heap parent is always smaller than its children?');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].tree.model, 'quick-model');
  assert.equal(prompts[0].tree.thread, null);
  assert.deepEqual(JSON.parse(prompts[0].text.slice(prompts[0].text.indexOf('\n') + 1)), {
    message: 'So a heap parent is always smaller than its children?',
    reply: raw,
  });
  assert.equal(observed(user.id), 1);
  assert.deepEqual(concept('Heap').observations, [0, 0, 1, 1, 0, 0]);

  // Malformed block: one more call.
  raw = 'Yes.\n```rabbithole-verdict\n[{"concept": "Heap",\n```\nMore.';
  const [malformed] = await ask('And a max-heap flips it?');
  assert.equal(prompts.length, 2);
  assert.equal(observed(malformed.id), 1);

  // Failed fallback: nothing recorded, the reply stays intact.
  judge = async () => {
    throw new Error('Fixture quick thinking failure');
  };
  raw = 'Exactly.';
  const [failedUser, reply] = await ask('Insertion bubbles up?');
  assert.equal(prompts.length, 3);
  assert.equal(observed(failedUser.id), 0);
  assert.equal(reply.text, 'Exactly.');
  assert.equal(reply.status, 'completed');
  assert.deepEqual(
    [
      ...new Set(
        store
          .usageEvents()
          .events.filter((e) => e.task === 'verdict')
          .map((e) => e.model),
      ),
    ],
    ['quick-model'],
  );
});

test('the usage task check widens to verdict on an existing database', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-verdict-usage-')), 'trees.sqlite');
  const old = new Store(path);
  const sql = old.db.prepare("SELECT sql FROM sqlite_master WHERE name='usage_events'").get().sql;
  old.db.exec(`ALTER TABLE usage_events RENAME TO usage_events_new;
    ${sql.replace(",'verdict'", '')};
    DROP TABLE usage_events_new;`);
  assert.throws(() => old.record('verdict:x', 'verdict', {}, null), /CHECK/);
  old.close();
  const store = new Store(path);
  store.record('verdict:x', 'verdict', { provider: 'claude', model: 'quick-model' }, null);
  assert.equal(store.usageEvents().events.at(-1).task, 'verdict');
  store.close();
});
