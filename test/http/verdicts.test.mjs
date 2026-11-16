import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../support/diagram-kit.mjs';
import { tutorSystem } from '../../server/media/diagrams.mjs';

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
