import { test } from 'node:test';
import { fakeNarration } from '../support/fake-narration.mjs';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RenderInternals } from '@remotion/renderer';
import {
  directive,
  composition,
  videoResponse,
  mp4,
  fakeRender,
  complete,
  until,
  open,
} from '../support/video-kit.mjs';

test('narration stages measured audio, returned timings and subtitles without exposing production or adding model calls', async (t) => {
  let calls = 0,
    speech = 0;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (!tree.id) calls++;
        complete(emit, tree.id ? 'Watch.' + directive : videoResponse(tree));
      },
    },
    {
      videoNarrate: async (script, signal) => {
        speech++;
        assert.equal(script, 'Winners advance.');
        assert.equal(signal.aborted, false);
        return { ...(await fakeNarration()), duration: 999 }; // Ignore the client's estimated duration.
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Narration', 'codex');
  const stream = await (
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a narrated video.' })
  ).text();
  const ready = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
  );
  // The saved cut keeps the timing and entry its export renders with.
  const workspace = join(env.dir, 'video-work', ready.id, ready.attempt, 'cut-0');
  const captured = JSON.parse(readFileSync(join(workspace, 'narration.json')));
  assert.equal(captured.durationInFrames, 75);
  assert.equal(captured.sentences[0].endFrame, 54);
  assert.match(
    readFileSync(join(workspace, 'index.tsx'), 'utf8'),
    /durationInFrames=\{timing.durationInFrames\}/,
  );
  assert.deepEqual(
    JSON.parse(readFileSync(join(workspace, 'public', 'timing.json'))).captions,
    captured.captions,
  );
  assert.match(
    readFileSync(join(workspace, 'public', 'captions.vtt'), 'utf8'),
    /00:00:00.000 --> 00:00:01.800\nWinners advance\./,
  );
  assert.equal(
    readFileSync(join(workspace, 'public', 'narration.mp3')).length,
    (await fakeNarration()).audio.length,
  );
  assert.ok(!stream.includes('Narration:'));
  const publicData = await (await env.get(`/api/trees/${tree.id}`)).text();
  for (const secret of [
    'Narration:',
    'startFrame',
    'sentenceBoundaries',
    'narration.mp3',
    ready.attempt,
  ])
    assert.ok(!publicData.includes(secret));
  assert.equal(
    (await env.get(`/api/trees/${tree.id}/artifacts/${ready.id}/cuts/0/narration`)).status,
    200,
  );
  assert.equal(calls, 2);
  assert.equal(speech, 1);
});

test('TTS failure and invalid returned timing stay final until explicit Retry; cancel rejects late speech and preserves attempt ownership', async (t) => {
  let calls = 0,
    speech = 0,
    renders = 0,
    release,
    mode = 'failure';
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (!tree.id) calls++;
        complete(emit, tree.id ? 'Watch.' + directive : videoResponse(tree));
      },
    },
    {
      videoNarrate: async () => {
        speech++;
        if (mode === 'failure') throw new Error('Video narration failed.');
        if (mode === 'late')
          return new Promise((r) => {
            release = async () => r(await fakeNarration());
          });
        if (mode === 'invalid')
          return {
            ...(await fakeNarration()),
            wordBoundaries: [{ offset: -1, duration: 1, text: 'bad' }],
          };
        return fakeNarration();
      },
      videoRender: async (...args) => {
        renders++;
        return fakeRender(...args);
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Failure', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  const failed = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
  );
  await env.app.settled();
  assert.equal(speech, 1);
  assert.equal(calls, 2);
  assert.equal(renders, 0);
  mode = 'invalid';
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  await until(() => env.store.artifact(tree.id, failed.id).status === 'failed');
  assert.equal(speech, 2);
  assert.equal(renders, 0);
  mode = 'late';
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  await until(() => release);
  const old = env.store.artifact(tree.id, failed.id);
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/cancel`);
  assert.equal(env.store.artifact(tree.id, failed.id).status, 'canceled');
  mode = 'ready';
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  const ready = await until(() => {
    const a = env.store.artifact(tree.id, failed.id);
    return a.status === 'ready' && a;
  });
  await release();
  await env.app.settled();
  assert.notEqual(ready.attempt, old.attempt);
  assert.equal(ready.input, old.input);
  assert.equal(env.store.artifact(tree.id, failed.id).attempt, ready.attempt);
  // Retries after a failure reuse the plan; the retry after Cancel plans fresh.
  assert.equal(calls, 6);
  assert.equal(speech, 4);
  assert.equal(renders, 0, 'saving renders no MP4');
  assert.equal(existsSync(join(env.dir, 'video-work', failed.id, old.attempt, 'public')), false);
});

test('duration follows measured narration beyond two minutes rather than the generated source duration export', async (t) => {
  const ffmpeg = RenderInternals.getExecutablePath({
    type: 'ffmpeg',
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
  });
  const tone = execFileSync(
    ffmpeg,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=24000:cl=mono',
      '-t',
      '125',
      '-b:a',
      '48k',
      '-f',
      'mp3',
      'pipe:1',
    ],
    { maxBuffer: 1024 * 1024 },
  );
  const env = await open(
    {
      generate: async (tree, text, emit) =>
        complete(emit, tree.id ? 'Watch.' + directive : videoResponse(tree)),
    },
    {
      videoNarrate: async () => ({ ...(await fakeNarration()), audio: tone }),
      videoRender: async (workspace, output) => {
        const timing = JSON.parse(readFileSync(join(workspace, 'narration.json')));
        assert.ok(timing.durationInFrames > 120 * 30);
        writeFileSync(output, mp4);
        return { durationInFrames: timing.durationInFrames, fps: 30 };
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Longer', 'codex');
  await (
    await env.post(`/api/trees/${tree.id}/messages`, {
      text: 'Make a longer video, about two minutes ten seconds.',
    })
  ).text();
  const ready = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
  );
  assert.ok(ready.duration > 120);
});
