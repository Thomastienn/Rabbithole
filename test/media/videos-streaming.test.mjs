import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  directive,
  composition,
  videoResponse,
  complete,
  until,
  open,
} from '../support/video-kit.mjs';

test('a closed video block starts its job mid-reply, completes once and survives Stop after the reply', async (t) => {
  const closeBlock = Promise.withResolvers(),
    finishReply = Promise.withResolvers(),
    finishVideo = Promise.withResolvers();
  let calls = 0,
    workerSignal;
  const env = await open({
    generate: async (tree, text, emit, save, signal) => {
      if (!tree.id) {
        calls++;
        workerSignal = signal;
        await finishVideo.promise;
        return complete(emit, videoResponse(tree));
      }
      emit({ type: 'delta', item: 'answer', text: 'Before.' + directive.slice(0, -3) });
      await closeBlock.promise;
      emit({ type: 'delta', item: 'answer', text: '```\nAfter.' });
      await finishReply.promise;
      emit({ type: 'status', status: 'completed' });
    },
  });
  t.after(async () => {
    closeBlock.resolve();
    finishReply.resolve();
    finishVideo.resolve();
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Early video');
  const response = await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' });
  const stream = response.text();
  assert.equal(calls, 0, 'an open request block starts no worker');
  assert.equal(env.store.tree(tree.id).artifacts.length, 0);
  closeBlock.resolve();
  await until(() => workerSignal);
  const during = await (await env.get(`/api/trees/${tree.id}`)).json();
  assert.equal(during.messages.at(-1).status, 'streaming');
  assert.equal(during.messages.at(-1).text, 'Before.\nAfter.');
  assert.equal(during.artifacts.length, 1);
  assert.equal(during.artifacts[0].status, 'pending');
  assert.equal(during.artifacts[0].phase, 'planning');
  assert.equal(during.artifacts[0].position, 'Before.'.length);
  assert.equal(during.artifacts[0].input, undefined);
  assert.equal(during.artifacts[0].attempt, undefined);
  finishReply.resolve();
  const events = await stream;
  assert.match(events, /"type":"artifact"/);
  assert.doesNotMatch(events, /treetutor-video|PRIVATE_SOURCE_MARKER|"selection"|"attempt"/);
  assert.match(events, /"type":"done","status":"completed"/);
  assert.equal(workerSignal.aborted, false);
  assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
  assert.equal(workerSignal.aborted, false, 'Stop after completion leaves the video running');
  finishVideo.resolve();
  await env.app.settled();
  const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
  assert.equal(saved.artifacts.length, 1);
  assert.equal(saved.artifacts[0].status, 'ready');
  assert.equal(saved.messages.at(-1).status, 'completed');
  assert.equal(calls, 2, 'one plan and one cut; finishing the reply never starts a second job');
});

test('Stop during the reply cancels its video and rejects late worker output', async (t) => {
  const finishReply = Promise.withResolvers(),
    finishVideo = Promise.withResolvers();
  let workerSignal,
    calls = 0;
  const env = await open({
    generate: async (tree, text, emit, save, signal) => {
      if (!tree.id) {
        calls++;
        workerSignal = signal;
        await finishVideo.promise;
        return complete(emit, videoResponse(tree));
      }
      emit({ type: 'item', item: 'answer', text: 'Keep this.' + directive });
      await finishReply.promise;
    },
  });
  t.after(async () => {
    finishReply.resolve();
    finishVideo.resolve();
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Stop early video');
  const stream = env
    .post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })
    .then((r) => r.text());
  await until(() => workerSignal);
  assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
  const events = await stream;
  assert.equal(workerSignal.aborted, true);
  const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
  assert.equal(saved.messages.at(-1).text, 'Keep this.');
  assert.equal(saved.messages.at(-1).status, 'interrupted');
  assert.equal(saved.artifacts[0].status, 'canceled');
  assert.equal(saved.artifacts[0].error, null);
  assert.match(events, /"status":"canceled"/);
  finishReply.resolve();
  finishVideo.resolve();
  await env.app.settled();
  assert.deepEqual(await (await env.get(`/api/trees/${tree.id}`)).json(), saved);
  assert.equal((await (await env.get('/api/videos')).json()).length, 0);
  assert.equal(calls, 1);
});

test('a video ready before the reply finishes is preserved by Stop', async (t) => {
  const finishReply = Promise.withResolvers();
  const env = await open({
    generate: async (tree, text, emit) => {
      if (!tree.id) return complete(emit, videoResponse(tree));
      emit({ type: 'item', item: 'answer', text: 'Watch.' + directive });
      await finishReply.promise;
    },
  });
  t.after(async () => {
    finishReply.resolve();
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Ready early video');
  const stream = env
    .post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })
    .then((r) => r.text());
  const ready = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
  );
  assert.equal(env.store.tree(tree.id).messages.at(-1).status, 'streaming');
  await env.post(`/api/trees/${tree.id}/stop`);
  assert.match(await stream, /"status":"interrupted"/);
  assert.deepEqual(env.store.artifact(tree.id, ready.id), ready);
  assert.equal((await env.get(`/api/videos/${ready.id}/media`)).status, 200);
});

test('a later conflicting media block fails the pending video without publishing late output', async (t) => {
  const more = Promise.withResolvers(),
    finishVideo = Promise.withResolvers();
  let workerSignal;
  const env = await open({
    generate: async (tree, text, emit, save, signal) => {
      if (!tree.id) {
        workerSignal = signal;
        await finishVideo.promise;
        return complete(emit, videoResponse(tree));
      }
      emit({ type: 'delta', item: 'answer', text: 'Watch.' + directive });
      await more.promise;
      emit({ type: 'delta', item: 'answer', text: directive });
      emit({ type: 'status', status: 'completed' });
    },
  });
  t.after(async () => {
    more.resolve();
    finishVideo.resolve();
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Conflicting requests');
  const stream = env
    .post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })
    .then((r) => r.text());
  await until(() => workerSignal);
  more.resolve();
  await stream;
  assert.equal(workerSignal.aborted, true);
  const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
  assert.equal(saved.artifacts.length, 2);
  assert.ok(
    saved.artifacts.every(
      (a) => a.status === 'failed' && a.error.includes('video with other requests'),
    ),
  );
  finishVideo.resolve();
  await env.app.settled();
  assert.equal((await (await env.get('/api/videos')).json()).length, 0);
  assert.deepEqual(await (await env.get(`/api/trees/${tree.id}`)).json(), saved);
});

test('a tutor failure after request close leaves its detached video running', async (t) => {
  const finishVideo = Promise.withResolvers();
  let workerSignal;
  const env = await open({
    generate: async (tree, text, emit, save, signal) => {
      if (!tree.id) {
        workerSignal = signal;
        await finishVideo.promise;
        return complete(emit, videoResponse(tree));
      }
      emit({ type: 'item', item: 'answer', text: 'Watch.' + directive });
      throw new Error('Tutor failed after the request.');
    },
  });
  t.after(async () => {
    finishVideo.resolve();
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Detached video');
  const stream = await (
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })
  ).text();
  assert.match(stream, /"type":"done","status":"failed"/);
  await until(() => workerSignal);
  assert.equal(workerSignal.aborted, false);
  assert.equal(env.store.tree(tree.id).artifacts[0].status, 'pending');
  finishVideo.resolve();
  await env.app.settled();
  assert.equal(env.store.tree(tree.id).artifacts[0].status, 'ready');
});
