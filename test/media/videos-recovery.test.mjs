import { test } from 'node:test';
import { fakeNarration } from '../support/fake-narration.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { tutorContext } from '../../server/media/diagrams.mjs';
import { mediaPath } from '../../server/media/videos.mjs';
import {
  directive,
  composition,
  videoResponse,
  mp4,
  fakeRender,
  noSnapshot,
  complete,
  until,
  open,
  job,
} from '../support/video-kit.mjs';

test('cancel stops only its own job, late output cannot publish, and retry reuses the frozen input without a new message', async () => {
  const renders = [],
    workers = [],
    progress = [];
  // Each render waits until the test releases it and ignores cancellation, like output arriving late.
  const videoRender = (workspace, output, signal, onProgress) => {
    progress.push(onProgress);
    return new Promise((done) =>
      renders.push(() => {
        writeFileSync(output, mp4);
        done({ durationInFrames: 75, fps: 30 });
      }),
    );
  };
  const provider = {
    generate: async (tree, text, emit) => {
      if (!tree.id) {
        if (tree.instructions.startsWith('You plan')) workers.push(text);
        return complete(emit, videoResponse(tree));
      }
      complete(emit, /video/.test(text) ? 'Sure.' + directive : 'Answer in another chat.');
    },
  };
  const env = await open(provider, { videoRender });
  try {
    const a = env.store.create('A', 'codex'),
      b = env.store.create('B', 'codex');
    await (await env.post(`/api/trees/${a.id}/messages`, { text: 'Make a video of A.' })).text();
    await until(() => renders.length === 1); // Jobs are detached; renders[0] must be A's.
    await (await env.post(`/api/trees/${b.id}/messages`, { text: 'Make a video of B.' })).text();
    await until(() => renders.length === 2);
    const jobA = env.store.tree(a.id).artifacts[0],
      jobB = env.store.tree(b.id).artifacts[0];
    const messages = env.store.tree(a.id).messages.length;

    // Cancel is scoped to the owning conversation; another chat stays usable while B runs.
    assert.equal((await env.post(`/api/trees/${b.id}/artifacts/${jobA.id}/cancel`)).status, 404);
    const canceled = await (
      await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/cancel`)
    ).json();
    assert.equal(canceled.status, 'canceled');
    assert.equal(canceled.position, jobA.position);
    assert.equal(canceled.phase, undefined);
    assert.equal(canceled.progress, undefined);
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/cancel`)).status, 409);
    const other = env.store.create('Other', 'codex');
    assert.match(
      await (await env.post(`/api/trees/${other.id}/messages`, { text: 'Hello' })).text(),
      /Answer in another chat/,
    );
    assert.equal(env.store.artifact(b.id, jobB.id).status, 'pending');

    const canceledWork = env.app.settled(jobA.id);
    // Retry: same row, new attempt, same frozen input, no learner message added.
    const response = await (await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).json();
    assert.equal(response.input, undefined);
    assert.equal(response.attempt, undefined);
    assert.equal(response.position, jobA.position);
    assert.equal(response.phase, 'planning');
    assert.equal(response.progress, undefined);
    const retried = env.store.artifact(a.id, jobA.id);
    assert.equal(retried.status, 'pending');
    assert.notEqual(retried.attempt, jobA.attempt);
    assert.equal(retried.input, jobA.input);
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).status, 409); // already running
    await until(() => renders.length === 3);
    assert.deepEqual(workers.slice(-1), [jobA.input]);
    progress[2](0.5);
    progress[0](0.9); // The canceled attempt cannot overwrite the new attempt's progress.
    assert.equal(
      (await (await env.get(`/api/trees/${a.id}/artifacts/${jobA.id}`)).json()).progress,
      0.5,
    );
    assert.equal(
      (await (await env.get(`/api/trees/${b.id}/artifacts/${jobB.id}`)).json()).progress,
      0,
    );

    // The canceled attempt's late output arrives first and is ignored; the retry publishes.
    renders[0]();
    await canceledWork;
    assert.equal(env.store.artifact(a.id, jobA.id).status, 'pending');
    assert.equal(existsSync(mediaPath(env.dir, jobA.id)), false);
    renders[2]();
    const ready = await until(
      () =>
        env.store.artifact(a.id, jobA.id).status === 'ready' && env.store.artifact(a.id, jobA.id),
    );
    assert.equal(ready.attempt, retried.attempt);
    assert.equal(ready.position, jobA.position);
    assert.equal(env.store.tree(a.id).messages.length, messages);
    assert.equal(env.store.tree(a.id).artifacts.length, 1);
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).status, 409); // ready media needs no retry
    renders[1]();
    await until(() => env.store.artifact(b.id, jobB.id).status === 'ready');

    // A changed request is a new job.
    await (
      await env.post(`/api/trees/${a.id}/messages`, { text: 'Make a video of something else.' })
    ).text();
    assert.equal(env.store.tree(a.id).artifacts.length, 2);
  } finally {
    env.close();
  }
});

test('render, composition and save failures stay honest and retry the same request', async () => {
  let fail = true;
  const videoRender = async (ws, output) => {
    if (fail) throw new Error('Video rendering failed.');
    return fakeRender(ws, output);
  };
  let compose = 0;
  const provider = {
    generate: async (tree, text, emit) => {
      if (tree.id) return complete(emit, 'Sure.' + directive);
      if (tree.instructions.startsWith('You plan')) compose++;
      complete(emit, compose === 1 ? 'not a composition' : videoResponse(tree));
    },
  };
  const env = await open(provider, { videoRender });
  try {
    const tree = env.store.create('Video', 'codex');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
    const { id } = await until(() =>
      env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
    );
    assert.equal(env.store.artifact(tree.id, id).error, 'Video plan or style brief is malformed.');
    await env.post(`/api/trees/${tree.id}/artifacts/${id}/retry`);
    await until(() => env.store.artifact(tree.id, id).status === 'failed');
    assert.equal(
      env.store.artifact(tree.id, id).error,
      'Cut 1 of 1: Video rendering failed. Retry keeps the other cuts.',
    );
    fail = false;
    const finish = env.store.finishVideo.bind(env.store);
    env.store.finishVideo = (c, i, at, result, error) => {
      if (!error) throw new Error('disk full');
      return finish(c, i, at, result, error);
    };
    await env.post(`/api/trees/${tree.id}/artifacts/${id}/retry`);
    await until(() => env.store.artifact(tree.id, id).status === 'failed');
    assert.equal(env.store.artifact(tree.id, id).error, 'Video could not be saved.');
    assert.equal(existsSync(mediaPath(env.dir, id)), false);
    env.store.finishVideo = finish;
    await env.post(`/api/trees/${tree.id}/artifacts/${id}/retry`);
    await until(() => env.store.artifact(tree.id, id).status === 'ready');
    assert.equal(compose, 2, 'retries after a saved plan make no plan call');
    assert.deepEqual(
      env.store.tree(tree.id).messages.map((m) => m.role),
      ['user', 'assistant'],
    );
    // Generation errors and work never enter tutor history.
    const history = JSON.stringify(tutorContext(env.store.tree(tree.id)));
    for (const secret of [
      'rendering failed',
      'could not be saved',
      'PRIVATE_SOURCE_MARKER',
      'not a composition',
    ])
      assert.ok(!history.includes(secret), secret);
  } finally {
    env.close();
  }
});

test('restart marks unfinished videos interrupted, keeps ready media and offers regeneration for missing files without inference', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-restart-'));
  const path = join(dir, 'trees.sqlite');
  // A database written before the job statuses existed is rebuilt in place.
  const old = new Store(path);
  old.db
    .exec(`PRAGMA user_version=0; PRAGMA foreign_keys=OFF; DROP TABLE artifacts; CREATE TABLE artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('mermaid','video')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')), title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL, position INTEGER);`);
  const tree = old.create('Video', 'codex');
  const reply = old.message(tree.id, 'assistant', 'Reply.', 'completed');
  const running = old.pendingArtifact(
    tree.id,
    reply,
    'Running',
    'Planned.',
    'video',
    '{"request":"Make a video."}',
    3,
  );
  const kept = old.pendingArtifact(tree.id, reply, 'Kept', 'Planned.', 'video', '{}');
  const lost = old.pendingArtifact(tree.id, reply, 'Lost', 'Planned.', 'video', '{}');
  for (const a of [kept, lost])
    old.finishVideo(tree.id, a.id, a.attempt, { description: 'Shows boxes.', duration: 1 });
  mkdirSync(join(dir, 'videos'));
  writeFileSync(mediaPath(dir, kept.id), mp4);
  old.close();

  const calls = [];
  const store = new Store(path);
  const app = createApp({
    store,
    provider: {
      models: async () => [{ model: 'fixture-model', isDefault: true }],
      generate: async (...args) => {
        calls.push(args);
        complete(args[2], videoResponse(args[0]));
      },
    },
    auth: { status: () => ({ connected: true }) },
    dir,
    videoRender: fakeRender,
    videoSnapshot: noSnapshot,
    videoNarrate: fakeNarration,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const saved = await (await fetch(`${origin}/api/trees/${tree.id}`)).json();
    const by = Object.fromEntries(saved.artifacts.map((a) => [a.title, a]));
    assert.equal(by.Running.status, 'interrupted');
    assert.equal(by.Running.position, 3);
    assert.equal(by.Running.phase, undefined);
    assert.equal(by.Running.progress, undefined);
    assert.equal(by.Kept.status, 'ready');
    assert.equal(by.Kept.position, null);
    assert.equal(by.Kept.available, undefined);
    assert.equal(
      (await fetch(`${origin}/api/trees/${tree.id}/artifacts/${kept.id}/media`)).status,
      200,
    );
    assert.equal(by.Lost.status, 'ready');
    assert.equal(by.Lost.available, false);
    const rows = (await (await fetch(`${origin}/api/previews?id=${tree.id}`)).json())[tree.id].at(
      -1,
    ).artifacts;
    assert.deepEqual(
      rows.map((a) => [a.title, a.status, a.available]),
      [
        ['Running', 'interrupted', undefined],
        ['Kept', 'ready', undefined],
        ['Lost', 'ready', false],
      ],
    );
    assert.equal(calls.length, 0); // reopening never replays inference
    const post = (id) =>
      fetch(`${origin}/api/trees/${tree.id}/artifacts/${id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
        body: '{}',
      });
    assert.equal((await post(kept.id)).status, 409);
    assert.equal((await post(lost.id)).status, 200);
    assert.equal((await post(running.id)).status, 200);
    await app.settled();
    assert.ok(store.tree(tree.id).artifacts.every((a) => a.status === 'ready'));
    assert.equal(calls.length, 4);
    assert.equal(
      JSON.parse(calls.find((c) => c[1].includes('Make a video.'))?.[1]).request,
      JSON.parse(running.input).request,
    );
    assert.ok(existsSync(mediaPath(dir, lost.id)));
    assert.equal(store.artifact(tree.id, running.id).position, 3);
  } finally {
    app.stop();
    store.close();
  }
});

test('stopping the app during a job marks it interrupted before exit and keeps it interrupted on restart', async () => {
  let started;
  const rendering = new Promise((r) => {
    started = r;
  });
  const videoRender = (ws, output, signal) =>
    new Promise((_, reject) => {
      started();
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  const env = await open(
    {
      generate: async (tree, text, emit) =>
        complete(emit, tree.id ? 'Sure.' + directive : videoResponse(tree)),
    },
    { videoRender },
  );
  const tree = env.store.create('Video', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  await rendering;
  await env.app.stop();
  assert.equal(env.store.tree(tree.id).artifacts[0].status, 'interrupted');
  env.store.close();
  const reopened = new Store(join(env.dir, 'trees.sqlite'));
  assert.equal(reopened.tree(tree.id).artifacts[0].status, 'interrupted');
  reopened.close();
});
