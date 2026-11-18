import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadManager } from '../../server/downloads.mjs';
import { open } from '../support/video-kit.mjs';

// A fake tool: ready() answers from `installed`; run() waits for the test to settle it.
function fakeTools(installed = {}) {
  const runs = [],
    pending = {};
  const tool = (id, video) => ({
    id,
    name: id.toUpperCase(),
    video,
    ready: async () => Boolean(installed[id]),
    run: ({ report }) =>
      new Promise((resolve, reject) => {
        runs.push(id);
        pending[id] = { resolve, reject, report };
      }),
  });
  return { tools: [tool('manim', true), tool('browser', true), tool('python')], runs, pending };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const states = (manager) => manager.list().map((d) => `${d.id}:${d.state}`);

test('downloads run one at a time in order, skip ready tools, and list ready ones until seen', async () => {
  const { tools, runs, pending } = fakeTools({ python: true });
  const manager = downloadManager(tools);
  const events = [];
  manager.subscribe((list) => events.push(list));
  const done = manager.start();
  await tick();
  assert.deepEqual(states(manager), ['manim:running', 'browser:queued']);
  assert.deepEqual(runs, ['manim'], 'one at a time');
  pending.manim.report({ percent: 40.2 });
  assert.equal(manager.list()[0].percent, 40);
  assert.equal(manager.videoWaiting(), 'Video tools are still downloading (20%).');
  pending.manim.resolve();
  await tick();
  assert.deepEqual(runs, ['manim', 'browser']);
  pending.browser.report({ bytes: 5e6, total: 1e8, percent: 5 });
  assert.deepEqual(
    { bytes: manager.list()[1].bytes, total: manager.list()[1].total },
    { bytes: 5e6, total: 1e8 },
  );
  pending.browser.resolve();
  await done;
  assert.deepEqual(states(manager), ['manim:ready', 'browser:ready'], 'ready stays listed');
  assert.equal(manager.videoWaiting(), null);
  assert.ok(events.length > 3, 'every change streams');
  manager.seen();
  assert.deepEqual(manager.list(), [], 'opening the list once clears ready downloads');
});

test('a failed download keeps its message until Retry runs it again', async () => {
  const { tools, runs, pending } = fakeTools({ browser: true, python: true });
  const manager = downloadManager(tools);
  const done = manager.start();
  await tick();
  pending.manim.reject(new Error('Manim setup requires uv.'));
  await done;
  assert.deepEqual(manager.list(), [
    {
      id: 'manim',
      name: 'MANIM',
      state: 'failed',
      bytes: null,
      total: null,
      percent: null,
      error: 'Manim setup requires uv.',
    },
  ]);
  manager.seen();
  assert.equal(manager.list().length, 1, 'a failure is not cleared by opening the list');
  assert.equal(manager.retry('python'), false, 'only a failed download retries');
  assert.equal(manager.retry('manim'), true);
  await tick();
  assert.deepEqual(runs, ['manim', 'manim']);
  assert.deepEqual(states(manager), ['manim:running']);
  pending.manim.resolve();
  await manager.idle();
  assert.deepEqual(states(manager), ['manim:ready']);
});

test('a download stopped mid-way restarts from the start on the next launch', async () => {
  const installed = { python: true };
  const first = fakeTools(installed);
  const before = downloadManager(first.tools);
  void before.start();
  await tick();
  first.pending.manim.report({ percent: 70 });
  before.stop();
  first.pending.manim.reject(new Error('aborted'));
  await tick();
  assert.equal(before.list()[0].state, 'running', 'a stopped download is not reported failed');
  const next = fakeTools(installed);
  const after = downloadManager(next.tools);
  void after.start();
  await tick();
  assert.deepEqual(states(after), ['manim:running', 'browser:queued']);
  assert.equal(after.list()[0].percent, null);
});

test('routes stream the list, retry failures, mark seen, and setup starts downloads; a video waits for its tools', async (t) => {
  const { tools, pending } = fakeTools({ python: true });
  const downloads = downloadManager(tools);
  const env = await open(
    { generate: async () => assert.fail('no video work starts') },
    { downloads },
  );
  t.after(env.close);
  assert.equal(downloads.list().length, 0, 'nothing downloads before setup ends');
  await (await env.post('/api/setup')).json();
  await tick();
  const stream = await env.get('/api/downloads');
  assert.equal(stream.headers.get('content-type'), 'text/event-stream');
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.deepEqual(
    JSON.parse(first.replace(/^data: /, '')).map((d) => d.state),
    ['running', 'queued'],
  );
  await reader.cancel();

  pending.manim.report({ percent: 80 });
  const tree = env.store.create('Video', 'codex');
  const message = env.store.message(tree.id, 'assistant', 'Reply.', 'completed');
  const artifact = env.store.pendingArtifact(
    tree.id,
    message,
    'Title',
    'Planned.',
    'video',
    '{"request":"Make a video."}',
  );
  env.store.finishVideo(tree.id, artifact.id, artifact.attempt, {}, 'Earlier failure.');
  assert.equal(
    (await env.post(`/api/trees/${tree.id}/artifacts/${artifact.id}/retry`)).status,
    200,
  );
  await env.app.settled(artifact.id);
  const row = env.store.artifact(tree.id, artifact.id);
  assert.equal(row.status, 'failed');
  assert.equal(row.error, 'Video tools are still downloading (40%).');

  pending.manim.reject(new Error('Network down.'));
  await tick();
  assert.equal((await env.post('/api/downloads/browser/retry')).status, 409);
  const retried = await (await env.post('/api/downloads/manim/retry')).json();
  assert.deepEqual(
    retried.map((d) => d.state),
    ['queued', 'running'],
  );
  pending.browser.resolve();
  await tick();
  pending.manim.resolve();
  await downloads.idle();
  assert.deepEqual(await (await env.post('/api/downloads/seen')).json(), []);
});
