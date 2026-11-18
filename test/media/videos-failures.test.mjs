import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { mediaPath } from '../../server/media/videos.mjs';
import { cutSource } from '../../server/media/video-plan.mjs';
import {
  directive,
  composition,
  videoResponse,
  styleBrief,
  spatial,
  mp4,
  fakeRender,
  complete,
  until,
  open,
  job,
  repairAnswer,
} from '../support/video-kit.mjs';

test('lost ownership and a failed save publish nothing', async () => {
  const lost = await job(fakeRender, (store) =>
    store.db.prepare("UPDATE artifacts SET attempt='superseded'").run(),
  );
  assert.equal(lost.result, 'Video job no longer owns this output.');
  assert.equal(lost.published, false);
  const failedSave = await job(fakeRender, (store) => {
    store.finishVideo = () => {
      throw new Error('disk full /secret/path');
    };
  });
  assert.equal(failedSave.result, 'Video could not be saved.');
  assert.equal(failedSave.published, false);
  assert.notEqual(failedSave.row.status, 'ready');

  // Queue cancellation at the publication boundary; if still pending, a new attempt owns different ready media.
  let replacement;
  const newerMedia = Buffer.concat([mp4, Buffer.from('new attempt')]);
  const racing = await job(fakeRender, (store, artifact, dir) => {
    const lookup = store.artifact.bind(store);
    let queued = false;
    store.artifact = (...args) => {
      const row = lookup(...args);
      if (!queued && row?.status === 'pending') {
        queued = true;
        queueMicrotask(() => {
          if (lookup(...args)?.status !== 'pending') return;
          store.cancelVideo(...args);
          replacement = store.retryVideo(...args);
          mkdirSync(join(dir, 'videos'), { recursive: true });
          writeFileSync(mediaPath(dir, artifact.id), newerMedia);
          store.finishVideo(...args, replacement.attempt, {
            description: 'New attempt.',
            duration: 1,
          });
        });
      }
      return row;
    };
  });
  assert.equal(racing.row.status, 'ready');
  assert.equal(racing.row.attempt, replacement?.attempt ?? racing.row.attempt);
  if (replacement)
    assert.deepEqual(
      readFileSync(mediaPath(racing.dir, racing.row.id)),
      newerMedia,
      'a superseded attempt must never touch newer ready media',
    );
  else assert.equal(racing.exported, false, 'generation saves no MP4');

  for (const bad of [
    composition.replace("from 'remotion'", "from '../../trees.sqlite'"),
    composition + "\nfetch('x');",
    composition + "\nconst m = import('fs');",
    composition + '\n<Img src="https://example.com/a.png" />',
    spatial.replace("from '@remotion/three'", "from '@react-three/drei'"),
    spatial + "\nnew TextureLoader().load('x.png');",
    spatial + "\nuseLoader(GLTFLoader, 'm.glb');",
  ])
    assert.throws(() => cutSource(bad, styleBrief));
  assert.ok(
    cutSource(
      spatial + "\nimport * as THREE from 'three';\nimport { useThree } from '@react-three/fiber';",
      styleBrief,
    ),
  );
  assert.ok(cutSource(composition + "\nimport { Scene, palette } from './kit';", styleBrief));
  assert.throws(() => cutSource(composition + "\nimport x from './other';", styleBrief));
  assert.equal(cutSource('```tsx\n' + composition + '\n```', styleBrief), composition);
  const [description, narration, ...code] = composition.split('\n');
  assert.ok(
    !cutSource([description, narration, '```tsx', ...code, '```'].join('\n'), styleBrief).includes(
      '`',
    ),
    'a fence after the header lines is not compiled as code',
  );
});

test('app marks a failed job failed without a playable result', async () => {
  // The cut keeps an off-brief colour through every repair.
  const invalid = composition.replace('fontSize: 40', "fontSize: 40, color: 'blue'");
  const provider = {
    generate: async (tree, text, emit) =>
      complete(
        emit,
        tree.id
          ? 'Sure.' + directive
          : tree.instructions.startsWith('You plan')
            ? videoResponse(tree)
            : repairAnswer(tree, text, invalid),
      ),
  };
  const env = await open(provider);
  try {
    const tree = env.store.create('Video', 'codex');
    await (
      await env.post(`/api/trees/${tree.id}/messages`, {
        text: 'Please make an animation of this.',
      })
    ).text();
    const failed = await until(() =>
      env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
    );
    assert.match(failed.error, /^Cut 1 of 1: \S.*\. Retry keeps the other cuts\.$/);
    assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${failed.id}/media`)).status, 404);
  } finally {
    env.close();
  }
});

test('failed or timed-out script calls stay final; only explicit Retry calls again and late script output is ignored', async () => {
  for (const timeout of [false, true]) {
    let calls = 0,
      renders = 0,
      late;
    const env = await open(
      {
        generate: async (tree, text, emit) => {
          if (tree.id) return complete(emit, 'Here.' + directive);
          if (++calls === 1) {
            if (timeout)
              await new Promise((r) => {
                late = () => {
                  complete(emit, videoResponse(tree));
                  r();
                };
              });
            else emit({ type: 'status', status: 'failed' });
            return;
          }
          complete(emit, videoResponse(tree));
        },
      },
      {
        videoTimeout: timeout ? 50 : 1000,
        videoRender: async (...args) => {
          renders++;
          return fakeRender(...args);
        },
      },
    );
    try {
      const tree = env.store.create('Script failure', 'codex');
      await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
      const failed = await until(() =>
        env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
      );
      await env.app.settled();
      assert.equal(calls, 1);
      assert.equal(renders, 0);
      assert.equal(
        (await env.get(`/api/trees/${tree.id}/artifacts/${failed.id}/media`)).status,
        404,
      );
      await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
      await until(() => env.store.artifact(tree.id, failed.id).status === 'ready');
      late?.();
      await new Promise((r) => setImmediate(r));
      assert.equal(calls, 3);
      assert.equal(renders, 0, 'saving renders no MP4');
      assert.equal(env.store.artifact(tree.id, failed.id).status, 'ready');
    } finally {
      env.close();
    }
  }
});

test('cancel during smart capability lookup prevents inference, including a late successful lookup', async () => {
  let release,
    calls = 0;
  const env = await open({
    models: () =>
      new Promise((r) => {
        release = () => r([{ model: 'smart-model', isDefault: true }]);
      }),
    generate: async (tree, text, emit) => {
      if (!tree.id) calls++;
      complete(emit, 'Here.' + directive);
    },
  });
  try {
    env.store.saveSmartSettings({
      model: { provider: 'codex', model: 'smart-model' },
      followEffort: false,
      effort: null,
    });
    const tree = env.store.create('Cancel lookup', 'codex', 'chat-model');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
    await until(() => release);
    const job = env.store.tree(tree.id).artifacts[0];
    await env.post(`/api/trees/${tree.id}/artifacts/${job.id}/cancel`);
    release();
    await env.app.settled();
    assert.equal(calls, 0);
    assert.equal(env.store.artifact(tree.id, job.id).status, 'canceled');
    assert.equal(existsSync(mediaPath(env.dir, job.id)), false);
  } finally {
    env.close();
  }
});
