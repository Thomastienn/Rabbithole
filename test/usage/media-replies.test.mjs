import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { Store } from '../../server/store.mjs';
import {
  open,
  complete,
  composition,
  planFor,
  directive,
  until,
  fixerTask,
  repairAnswer,
  planText,
} from '../support/video-kit.mjs';
import { block, source, visualAnswer } from '../support/visual-kit.mjs';

const counts = (n) => ({ input: n, output: n + 1, cacheRead: 1 });
const measurement = (task, n) => ({ task, ...counts(n) });

test('reply API attributes retried visuals and every video call, reports running usage, retains retries and survives restart and deletion', async (t) => {
  const planGate = Promise.withResolvers(),
    visualGate = Promise.withResolvers(),
    repairGate = Promise.withResolvers();
  let visualAttempts = 0,
    cutCalls = 0,
    regenerating = false,
    closed = false;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) {
          emit({ type: 'usage', usage: counts(100) });
          return complete(
            emit,
            text === 'More' ? 'Another answer.' : 'Explanation.' + block() + directive,
          );
        }
        // A failed explicit Retry (it reuses the plan, so this is its cut call) reports no measurement.
        if (regenerating) throw new Error('Fixture unavailable');
        if (tree.instructions.startsWith('You plan')) {
          emit({ type: 'usage', usage: counts(20) });
          await planGate.promise;
          return complete(emit, planText(planFor()));
        }
        if (fixerTask(text).cut) {
          cutCalls++;
          emit({ type: 'usage', usage: counts(30) });
          // A cut repair must count as a separate call too; it is held, then still invalid, so the video fails.
          if (cutCalls === 2) await repairGate.promise;
          return complete(
            emit,
            repairAnswer(
              tree,
              text,
              composition.replace('fontSize: 40', "fontSize: 40, color: 'blue'"),
            ),
          );
        }
        visualAttempts++;
        emit({ type: 'usage', usage: counts(visualAttempts === 1 ? 5 : 10) });
        if (visualAttempts === 1) return complete(emit, 'not markup');
        await visualGate.promise;
        // A later cumulative measurement replaces this call's earlier count, not a second call.
        emit({ type: 'usage', usage: counts(12) });
        return complete(emit, visualAnswer(text, source));
      },
    },
    {
      videoSnapshot: async () => {},
    },
  );
  t.after(async () => {
    planGate.resolve();
    visualGate.resolve();
    repairGate.resolve();
    await env.app.stop();
    if (!closed) env.store.close();
  });
  const root = env.store.create('Media usage', 'codex');
  await (
    await env.post(`/api/trees/${root.id}/messages`, { text: 'Show a video and visual' })
  ).text();
  await until(() => visualAttempts === 2);
  // Mixed media requests reject the video; its existing explicit Retry starts it on this reply.
  const pendingVideo = env.store.tree(root.id).artifacts.find((a) => a.kind === 'video');
  assert.equal(
    (await env.post(`/api/trees/${root.id}/artifacts/${pendingVideo.id}/retry`)).status,
    200,
  );
  await until(() =>
    env.store
      .replyMediaUsage(pendingVideo.message)
      .some((e) => e.task === 'video' && e.input === 20),
  );
  const read = async () => await (await env.get(`/api/trees/${root.id}`)).json();
  let tree = await read();
  const reply = tree.messages.at(-1).id;
  assert.ok(tree.artifacts.every((a) => a.status === 'pending'));
  assert.deepEqual(tree.messages.at(-1).mediaUsage, [
    measurement('diagram', 5),
    measurement('diagram', 10),
    measurement('video', 20),
  ]);
  assert.deepEqual(tree.messages.at(-1).usage.input, 100);

  visualGate.resolve();
  planGate.resolve();
  await until(() => cutCalls === 2);
  await until(() =>
    env.store.tree(root.id).artifacts.find((a) => a.kind === 'visual' && a.status === 'ready'),
  );
  tree = await read();
  const video = tree.artifacts.find((a) => a.kind === 'video');
  assert.equal(video.status, 'pending', 'reported cut calls appear before the video finishes');
  const expected = [
    measurement('diagram', 5),
    measurement('diagram', 12),
    measurement('video', 20),
    measurement('video', 30),
    measurement('video', 30),
  ];
  assert.deepEqual(tree.messages.at(-1).mediaUsage, expected);
  repairGate.resolve();
  await env.app.settled();
  // The second repair, still invalid, is the last attempt.
  expected.push(measurement('video', 30));

  await (await env.post(`/api/trees/${root.id}/messages`, { text: 'More' })).text();
  tree = await read();
  assert.deepEqual(tree.messages.find((m) => m.id === reply).mediaUsage, expected);
  assert.equal(
    tree.messages.at(-1).mediaUsage,
    undefined,
    'a new reply never borrows prior media usage',
  );
  const other = env.store.create('Other conversation', 'codex');
  assert.deepEqual(env.store.tree(other.id).messages, []);

  regenerating = true;
  const response = await env.post(`/api/trees/${root.id}/artifacts/${video.id}/retry`);
  assert.equal(response.status, 200);
  await env.app.settled();
  expected.push({ task: 'video', input: null, output: null, cacheRead: null });
  assert.deepEqual((await read()).messages.find((m) => m.id === reply).mediaUsage, expected);
  const history = (await (await env.get('/api/usage')).json()).events;
  assert.equal(history.filter((e) => e.task === 'diagram').length, 2);
  assert.equal(history.filter((e) => e.task === 'video').length, 5);

  await env.app.stop();
  env.store.close();
  closed = true;
  // The reopened store uses persisted attribution, independent of current job attempts.
  const reopened = new Store(join(env.dir, 'trees.sqlite'));
  assert.deepEqual(
    reopened
      .tree(root.id)
      .messages.find((m) => m.id === reply)
      .mediaUsage.map((u) => ({ ...u })),
    expected,
  );
  reopened.remove(root.id, root.id, () => {});
  // Deleting the tree drops its live attribution; the counts stay.
  assert.deepEqual(
    reopened.usageEvents().events.map((u) => ({ ...u })),
    history.map((e) => ({ ...e, tree: null, treeTitle: null })),
  );
  assert.ok(
    reopened.db
      .prepare('SELECT message FROM usage_events')
      .all()
      .every((e) => e.message === null),
  );
  reopened.close();
});

test('older media events acquire identifiable reply links without inventing unavailable measurements', (t) => {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-media-upgrade-')), 'trees.sqlite');
  let store = new Store(path);
  const tree = store.create('Older media', 'codex');
  const reply = store.message(tree.id, 'assistant', 'Answer', 'completed');
  const visual = store.pendingArtifact(tree.id, reply, 'Visual', 'Alt', 'visual', '{}');
  const video = store.pendingArtifact(tree.id, reply, 'Video', 'Alt', 'video', '{}');
  const diagram = store.pendingArtifact(tree.id, reply, 'Diagram', 'Alt', 'mermaid', '{}');
  store.pendingArtifact(tree.id, reply, 'Unreported visual', 'Alt', 'visual', '{}');
  store.record(`diagram:${visual.id}:call`, 'diagram', {}, counts(10));
  store.record(`diagram:${diagram.id}`, 'diagram', {}, null);
  store.record(`video:${video.attempt}:call`, 'video', {}, counts(20));
  store.db.exec('DROP INDEX usage_events_message; ALTER TABLE usage_events DROP COLUMN message');
  // Read raw: the old schema has no message column for usageEvents() to join on.
  const history = store.db
    .prepare(
      'SELECT at,provider,model,task,input,output,cacheRead,reasoning FROM usage_events ORDER BY at,rowid',
    )
    .all()
    .map((e) => ({ ...e }));
  store.close();
  store = new Store(path);
  t.after(() => store.close());
  const { events } = store.usageEvents();
  assert.deepEqual(
    events.map(({ tree, treeTitle, ...e }) => ({ ...e })),
    history,
  );
  // The upgrade's reply links also give the events their learning tree.
  assert.ok(events.every((e) => e.tree === tree.id && e.treeTitle === 'Older media'));
  assert.deepEqual(
    store.tree(tree.id).messages[0].mediaUsage.map((u) => ({ ...u })),
    [
      measurement('diagram', 10),
      { task: 'diagram', input: null, output: null, cacheRead: null },
      measurement('video', 20),
      { task: 'diagram', input: null, output: null, cacheRead: null },
    ],
  );
});
