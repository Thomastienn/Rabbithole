import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const auth = {
  status: () => ({ connected: false }),
  start: () => 'https://auth.openai.com/',
  callback: async () => {
    throw new Error('denied');
  },
};
const dir = mkdtempSync(join(tmpdir(), 'rabbithole-retry-'));
async function open(path, generate) {
  const store = new Store(path);
  const app = createApp({ store, auth, provider: { generate } });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const state = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body, headers = {}) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': state.csrf, ...headers },
      body: JSON.stringify(body),
    });
  return {
    store,
    app,
    post,
    close: async () => {
      await app.stop();
      store.close();
    },
  };
}

test('failed latest reply retries in place with the current model; no duplicate question; library videos kept', async () => {
  const calls = [];
  const rawQuestion = 'Second question about roots and fungi. '.repeat(40);
  let fail = true;
  const env = await open(join(dir, 'failed.sqlite'), async (tree, text, emit, saveThread) => {
    calls.push({
      text,
      model: tree.model,
      thread: tree.thread,
      history: tree.messages.map((m) => m.text),
    });
    saveThread('thread-1');
    emit({ type: 'delta', item: 'a', text: 'Partial' });
    if (fail) throw new Error('Provider failed.');
    emit({ type: 'item', item: 'a', text: `Answer: ${text}` });
    emit({ type: 'usage', usage: { input: 3, output: 4, cacheRead: 0 } });
    emit({ type: 'status', status: 'completed' });
  });
  try {
    const tree = await (await env.post('/api/trees', {})).json();
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Zero' })).text();
    fail = false;
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'First' })).text();
    // An earlier failed reply never retries once a later reply exists.
    assert.equal(env.store.tree(tree.id).messages[1].status, 'failed');
    assert.equal((await env.post(`/api/trees/${tree.id}/retry`, {})).status, 409);
    fail = true;
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: rawQuestion })).text();
    let saved = env.store.tree(tree.id);
    const failed = saved.messages.at(-1);
    assert.equal(failed.status, 'failed');
    const discarded = env.store.pendingArtifact(
      tree.id,
      failed.id,
      'Visual',
      'Failed visual',
      'visual',
      '{}',
    );
    env.store.finishArtifact(tree.id, discarded.id, null, 'Tutor reply did not complete.');
    const video = env.store.pendingArtifact(
      tree.id,
      failed.id,
      'Video',
      'Kept in library',
      'video',
      '{}',
    );
    env.store.finishVideo(tree.id, video.id, video.attempt, {
      description: 'Kept in library',
      duration: 1,
    });
    assert.ok(env.store.libraryVideo(video.id));
    assert.equal(
      (await env.post(`/api/trees/${tree.id}/retry`, {}, { 'X-Rabbithole-CSRF': 'wrong' })).status,
      403,
    );
    env.store.model(tree.id, 'model-now', null);
    fail = false;
    const response = await env.post(`/api/trees/${tree.id}/retry`, {});
    assert.equal(response.status, 200);
    const stream = await response.text();
    assert.match(stream, new RegExp(`"replaced":"${failed.id}"`));
    assert.match(stream, /"type":"done","status":"completed"/);
    saved = env.store.tree(tree.id);
    assert.deepEqual(
      saved.messages.map((m) => [m.role, m.text, m.status]),
      [
        ['user', 'Zero', 'completed'],
        ['assistant', 'Partial', 'failed'],
        ['user', 'First', 'completed'],
        ['assistant', 'Answer: First', 'completed'],
        ['user', rawQuestion, 'completed'],
        ['assistant', `Answer: ${rawQuestion}`, 'completed'],
      ],
    );
    assert.notEqual(saved.messages[5].id, failed.id);
    assert.deepEqual(
      saved.messages[5].usage && [saved.messages[5].usage.input, saved.messages[5].usage.output],
      [3, 4],
    );
    assert.equal(saved.artifacts.filter((a) => a.message === failed.id).length, 0);
    assert.ok(env.store.libraryVideo(video.id));
    const retry = calls.at(-1);
    assert.deepEqual(
      [retry.text, retry.model, retry.thread, retry.history],
      [rawQuestion, 'model-now', null, ['Zero', 'Partial', 'First', 'Answer: First']],
    );
    assert.equal(saved.model, 'model-now');
    // A completed latest reply is not retried.
    assert.equal((await env.post(`/api/trees/${tree.id}/retry`, {})).status, 409);
  } finally {
    await env.close();
  }
});

test('learner Stop is recorded and never offers Retry', async () => {
  const env = await open(
    join(dir, 'stopped.sqlite'),
    async (tree, text, emit, saveThread, signal) => {
      emit({ type: 'delta', item: 'a', text: 'Partial' });
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    },
  );
  try {
    const tree = await (await env.post('/api/trees', {})).json();
    const reply = env.post(`/api/trees/${tree.id}/messages`, { text: 'Stop me' });
    const response = await reply;
    await env.post(`/api/trees/${tree.id}/stop`, {});
    await response.text();
    const stopped = env.store.tree(tree.id).messages.at(-1);
    assert.deepEqual([stopped.status, stopped.stopped], ['interrupted', 'learner']);
    assert.equal((await env.post(`/api/trees/${tree.id}/retry`, {})).status, 409);
    assert.equal(env.store.tree(tree.id).messages.length, 2);
  } finally {
    await env.close();
  }
});

test('crash-interrupted reply survives restart as retryable; older databases migrate without guessing', async () => {
  const path = join(dir, 'crash.sqlite');
  let store = new Store(path);
  const crashed = store.create('Crashed', 'codex');
  store.message(crashed.id, 'user', 'Question', 'completed');
  store.message(crashed.id, 'assistant', 'Partial', 'streaming');
  const legacy = store.create('Legacy', 'codex');
  store.message(legacy.id, 'user', 'Old question', 'completed');
  store.message(legacy.id, 'assistant', 'Old partial', 'interrupted');
  store.close();
  // Simulate a database from before stop reasons existed.
  const raw = new DatabaseSync(path);
  raw.exec('ALTER TABLE messages DROP COLUMN stopped');
  raw.close();
  const env = await open(path, async (tree, text, emit) => {
    emit({ type: 'item', item: 'a', text: `Again: ${text}` });
    emit({ type: 'status', status: 'completed' });
  });
  try {
    const reply = env.store.tree(crashed.id).messages.at(-1);
    assert.deepEqual([reply.status, reply.stopped], ['interrupted', 'shutdown']);
    assert.equal(env.store.tree(legacy.id).messages.at(-1).stopped, undefined);
    assert.equal((await env.post(`/api/trees/${legacy.id}/retry`, {})).status, 409);
    const response = await env.post(`/api/trees/${crashed.id}/retry`, {});
    assert.equal(response.status, 200);
    await response.text();
    assert.deepEqual(
      env.store.tree(crashed.id).messages.map((m) => [m.text, m.status]),
      [
        ['Question', 'completed'],
        ['Again: Question', 'completed'],
      ],
    );
  } finally {
    await env.close();
  }
  store = new Store(path);
  try {
    assert.equal(store.tree(legacy.id).messages.at(-1).status, 'interrupted');
  } finally {
    store.close();
  }
});
