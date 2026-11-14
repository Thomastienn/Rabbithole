import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { videoSource, mediaPath } from '../../server/media/videos.mjs';
import {
  directive,
  composition,
  spatial,
  mp4,
  fakeRender,
  complete,
  until,
  open,
  job,
} from '../support/video-kit.mjs';

test('out-of-workspace output, unreadable media, lost ownership and a failed save publish nothing', async () => {
  const outside = join(mkdtempSync(join(tmpdir(), 'tt-outside-')), 'elsewhere.mp4');
  writeFileSync(outside, mp4);
  const cases = {
    'symlink out of workspace': async (ws, output) => {
      symlinkSync(outside, output);
      return { durationInFrames: 30, fps: 30 };
    },
    'replaced out directory': async (ws, output) => {
      const { renameSync } = await import('node:fs');
      renameSync(join(ws, 'out'), join(ws, 'old'));
      symlinkSync(dirname(outside), join(ws, 'out'));
      writeFileSync(join(dirname(outside), output.split('/').at(-1)), mp4);
      return { durationInFrames: 30, fps: 30 };
    },
    'missing output': async () => ({ durationInFrames: 30, fps: 30 }),
    'unreadable media': async (ws, output) => {
      writeFileSync(output, Buffer.alloc(4096, 7));
      return { durationInFrames: 30, fps: 30 };
    },
    'render failure': async () => {
      throw new Error('Video rendering failed.');
    },
  };
  for (const [name, render] of Object.entries(cases)) {
    const { result, row, published } = await job(render);
    assert.ok(result, name);
    assert.equal(row.status, 'pending', name); // the app marks it failed; nothing became ready
    assert.equal(published, false, name);
  }
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
  assert.deepEqual(
    readFileSync(mediaPath(racing.dir, racing.row.id)),
    replacement ? newerMedia : mp4,
    'a superseded attempt must never overwrite newer ready media',
  );

  for (const bad of [
    composition.replace("from 'remotion'", "from '../../trees.sqlite'"),
    composition + "\nfetch('x');",
    composition + "\nconst m = import('fs');",
    composition.replace('// Description: ', '// '),
    composition + '\n<Img src="https://example.com/a.png" />',
    spatial.replace("from '@remotion/three'", "from '@react-three/drei'"),
    spatial + "\nnew TextureLoader().load('x.png');",
    spatial + "\nuseLoader(GLTFLoader, 'm.glb');",
  ])
    assert.throws(() => videoSource(bad));
  assert.equal(
    videoSource(
      spatial + "\nimport * as THREE from 'three';\nimport { useThree } from '@react-three/fiber';",
    ).description,
    'A lit cube rotates in 3D space.',
  );
  assert.equal(
    videoSource(composition + "\nimport { Scene, palette } from './kit';").description,
    'Two labelled boxes slide together into a final box.',
  );
  assert.throws(() => videoSource(composition + "\nimport x from './other';"));
  assert.equal(
    videoSource('```tsx\n' + composition + '\n```').description,
    'Two labelled boxes slide together into a final box.',
  );
  const [description, narration, ...code] = composition.split('\n');
  assert.ok(
    !videoSource([description, narration, '```tsx', ...code, '```'].join('\n')).source.includes(
      '`',
    ),
    'a fence after the header lines is not compiled as code',
  );
});

test('app marks a failed job failed without a playable result', async () => {
  const provider = {
    generate: async (tree, text, emit) =>
      complete(emit, tree.id ? 'Sure.' + directive : composition),
  };
  const env = await open(provider, {
    videoRender: async () => {
      throw new Error('Video rendering failed.');
    },
  });
  try {
    const tree = env.store.create('Video');
    await (
      await env.post(`/api/trees/${tree.id}/messages`, {
        text: 'Please make an animation of this.',
      })
    ).text();
    const failed = await until(() =>
      env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
    );
    assert.equal(failed.error, 'Video rendering failed.');
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
                  complete(emit, composition);
                  r();
                };
              });
            else emit({ type: 'status', status: 'failed' });
            return;
          }
          complete(emit, composition);
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
      const tree = env.store.create('Script failure');
      await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
      const failed = await until(() =>
        env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
      );
      await new Promise((r) => setTimeout(r, 80));
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
      assert.equal(calls, 2);
      assert.equal(renders, 1);
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
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(calls, 0);
    assert.equal(env.store.artifact(tree.id, job.id).status, 'canceled');
    assert.equal(existsSync(mediaPath(env.dir, job.id)), false);
  } finally {
    env.close();
  }
});
