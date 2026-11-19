import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  renameSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { mediaPath } from '../../server/media/videos.mjs';
import { exportVideo } from '../../server/media/video-export.mjs';
import {
  directive,
  composition,
  planFor,
  mp4,
  fakeRender,
  complete,
  until,
  open,
  planText,
} from '../support/video-kit.mjs';

// Export progress is not a store change, so the gated check polls.
const poll = async (check) => {
  for (let i = 0; i < 500; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition timed out');
};

// A two-cut video saved through the app, so the export concatenates.
async function saved(options = {}) {
  const provider = {
    generate: async (tree, text, emit) =>
      complete(
        emit,
        tree.id
          ? 'Sure.' + directive
          : tree.instructions.startsWith('You plan')
            ? planText(planFor(composition, 2))
            : composition,
      ),
  };
  const logs = [];
  const env = await open(provider, { log: (line) => logs.push(line), ...options });
  const tree = env.store.create('Video', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  const video = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
  );
  await env.app.settled();
  const exportState = async () => (await env.get(`/api/videos/${video.id}/export`)).json();
  const press = async () => (await env.post(`/api/videos/${video.id}/export`)).json();
  return { env, tree, video, logs, exportState, press };
}

test('export renders each cut from saved code with progress, shares one job, then downloads and stays exported', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const renders = [];
  const { env, tree, video, logs, exportState, press } = await saved({
    videoRender: async (workspace, output, signal, progress) => {
      renders.push(workspace);
      if (existsSync(join(workspace, 'Video.tsx')))
        assert.equal(readFileSync(join(workspace, 'Video.tsx'), 'utf8'), composition);
      progress(0.5);
      await gate;
      progress(1);
      return fakeRender(workspace, output);
    },
  });
  try {
    const work = join(env.dir, 'video-work', video.id, video.attempt);
    // A rejected audit fix left in the folder never reaches the export.
    writeFileSync(join(work, 'cut-0', 'Video.tsx'), 'REJECTED FIX');
    assert.deepEqual(await exportState(), { exported: false });
    const first = await press(),
      second = await press();
    assert.equal(first.exporting, true);
    assert.equal(second.exporting, true);
    await poll(async () => (await exportState()).progress === 0.25);
    assert.equal(renders.length, 1, 'two presses share one export job');
    release();
    await env.app.settled();
    assert.equal((await exportState()).exported, true);
    assert.deepEqual(renders, [join(work, 'cut-0'), join(work, 'cut-1'), work]);
    assert.ok(!existsSync(join(work, 'cuts.json')));
    assert.ok(!existsSync(join(work, 'cut-0', 'out')));
    assert.deepEqual(readFileSync(mediaPath(env.dir, video.id)), mp4);
    assert.deepEqual(
      logs
        .filter((l) => l.includes(' media render ') && l.includes('task="export"'))
        .map((l) => Number(/progress=(\d+)/.exec(l)[1])),
      [25, 50, 75, 100],
    );
    assert.ok(logs.some((l) => l.includes(' media exported ')));

    const download = await env.get(`/api/videos/${video.id}/media?download`);
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition'), /^attachment; filename="video\.mp4"/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), mp4);
    assert.equal(
      (await env.get(`/api/videos/${video.id}/media`)).headers.get('content-disposition'),
      null,
    );

    // A second export downloads at once with no render, and the library now offers Show in folder.
    assert.deepEqual(await press(), { exported: true });
    assert.equal(renders.length, 3);
    const [row] = await (await env.get('/api/videos')).json();
    assert.equal(row.exported, true);
    const artifact = (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts[0];
    assert.equal(artifact.exported, true);
  } finally {
    env.close();
  }
});

test('a failed export shows a path-free error with Retry and leaves the video playable and unchanged', async () => {
  let fail = true,
    renders = 0;
  const { env, tree, video, exportState, press } = await saved({
    videoRender: async (workspace, output) => {
      renders++;
      if (fail) throw new Error(`Video rendering failed at ${workspace}/index.tsx.`);
      return fakeRender(workspace, output);
    },
  });
  try {
    const source = env.store.artifact(tree.id, video.id).source;
    await press();
    await env.app.settled();
    assert.deepEqual(await exportState(), {
      exported: false,
      error: 'Video rendering failed at [path]',
    });
    assert.equal(renders, 1, 'a render failure never rewrites or repairs cut code');
    assert.ok(!existsSync(mediaPath(env.dir, video.id)));
    assert.equal(env.store.artifact(tree.id, video.id).source, source);
    assert.equal(env.store.artifact(tree.id, video.id).status, 'ready');
    assert.equal((await env.get(`/api/videos/${video.id}/cuts`)).status, 200);
    assert.equal((await env.get(`/api/videos/${video.id}/cuts/0/narration`)).status, 200);
    // Retry is another press.
    fail = false;
    assert.equal((await press()).exporting, true);
    await env.app.settled();
    assert.equal((await exportState()).exported, true);
  } finally {
    env.close();
  }
});

test('closing the app cancels a running export and keeps no MP4', async () => {
  let signal;
  const { env, video, press } = await saved({
    videoRender: (workspace, output, s) => {
      signal = s;
      return new Promise((_, reject) => s.addEventListener('abort', () => reject(s.reason)));
    },
  });
  await press();
  await poll(() => signal);
  env.close();
  await env.app.settled();
  assert.ok(signal.aborted);
  assert.ok(!existsSync(mediaPath(env.dir, video.id)));
});

test('export refuses unknown videos and videos without saved work', async () => {
  const { env, video } = await saved();
  try {
    assert.equal((await env.post('/api/videos/missing/export')).status, 404);
    const { rmSync } = await import('node:fs');
    rmSync(join(env.dir, 'video-work', video.id), { recursive: true, force: true });
    assert.equal((await env.post(`/api/videos/${video.id}/export`)).status, 409);
  } finally {
    env.close();
  }
});

test('out-of-workspace, missing, unreadable or mismatched render output keeps no MP4', async () => {
  const outside = join(mkdtempSync(join(tmpdir(), 'tt-outside-')), 'elsewhere.mp4');
  writeFileSync(outside, mp4);
  const cases = {
    'symlink out of workspace': async (ws, output) => {
      symlinkSync(outside, output);
      return { durationInFrames: 30, fps: 30 };
    },
    'replaced out directory': async (ws, output) => {
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
    'fps mismatch': async (ws, output) => {
      writeFileSync(output, mp4);
      return { durationInFrames: 30, fps: 24 };
    },
    'duration mismatch': async (ws, output) => {
      writeFileSync(output, mp4);
      return { durationInFrames: 31, fps: 30 };
    },
  };
  const plan = planFor(composition, 1);
  const source = JSON.stringify({
    plan,
    cuts: [
      {
        engine: 'remotion',
        status: 'written',
        code: composition,
        timing: { fps: 30, durationInFrames: 30 },
      },
    ],
  });
  for (const [name, render] of Object.entries(cases)) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-export-'));
    mkdirSync(join(dir, 'video-work', 'v', 'a', 'cut-0', 'public'), { recursive: true });
    await assert.rejects(
      exportVideo({
        dir,
        id: 'v',
        attempt: 'a',
        source,
        signal: new AbortController().signal,
        render,
      }),
      /^Error: Rendered video is (?:outside its workspace|unreadable)\.$/,
      name,
    );
    assert.ok(!existsSync(mediaPath(dir, 'v')), name);
  }
});
