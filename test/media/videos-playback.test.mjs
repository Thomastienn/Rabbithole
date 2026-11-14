import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { RenderInternals, getVideoMetadata } from '@remotion/renderer';
import { mediaPath, SANDBOX } from '../../server/media/videos.mjs';
import {
  task,
  directive,
  composition,
  videoResponse,
  spatial,
  mp4,
  fakeRender,
  complete,
  until,
  open,
  job,
} from '../support/video-kit.mjs';

test('inline video exposes bounded live progress and its position, keeps inputs private, then serves seekable media', async () => {
  let gate, renderStarted;
  const started = new Promise((r) => {
    renderStarted = r;
  });
  let progress;
  const videoRender = async (workspace, output, signal, onProgress) => {
    progress = onProgress;
    renderStarted();
    onProgress(0.4);
    await new Promise((r) => {
      gate = r;
    });
    return fakeRender(workspace, output);
  };
  let release;
  const composing = new Promise((r) => {
    release = r;
  });
  const provider = {
    generate: async (tree, text, emit) => {
      if (tree.instructions?.includes('Remotion')) {
        await composing;
        return complete(emit, videoResponse(tree));
      }
      complete(emit, 'Before.\n' + directive + '\n\nAfter.');
    },
  };
  const env = await open(provider, { videoRender });
  try {
    const tree = env.store.create('Video'),
      other = env.store.create('Other');
    await (
      await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of this.' })
    ).text();
    const state = async () => (await env.get('/api/state')).json();
    const artifact = async (id) => (await (await env.get(`/api/trees/${id}`)).json()).artifacts[0];
    assert.deepEqual((await state()).videos, [tree.id]);
    assert.deepEqual((await state()).active, []);
    const pending = await artifact(tree.id);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.position, 8);
    assert.equal(pending.phase, 'planning');
    assert.ok(pending.startedAt <= Date.now() && pending.phaseStartedAt >= pending.startedAt);
    for (const key of ['progress', 'input', 'attempt']) assert.equal(pending[key], undefined);
    const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
    assert.equal(saved.messages.at(-1).text, 'Before.\n\n\nAfter.');
    assert.equal(await artifact(other.id), undefined);
    release();
    await started;
    const rendering = await artifact(tree.id);
    assert.equal(rendering.status, 'pending');
    assert.equal(rendering.phase, 'rendering');
    assert.equal(rendering.progress, 0.4);
    assert.equal(rendering.position, pending.position);
    for (const key of ['input', 'attempt']) assert.equal(rendering[key], undefined);
    const own = `/api/trees/${tree.id}/artifacts/${rendering.id}`;
    assert.equal((await (await env.get(own)).json()).progress, 0.4);
    assert.equal((await env.get(`/api/trees/${other.id}/artifacts/${rendering.id}`)).status, 404);
    progress(3);
    assert.equal((await artifact(tree.id)).progress, 1);
    progress(-1);
    assert.equal((await artifact(tree.id)).progress, 0);
    progress(NaN);
    assert.equal((await artifact(tree.id)).progress, undefined);
    const previews = await (await env.get(`/api/previews?id=${tree.id}&id=${other.id}`)).json();
    assert.deepEqual(previews[tree.id].at(-1).artifacts, [
      { id: rendering.id, kind: 'video', title: task.title, status: 'pending' },
    ]);
    assert.ok(!previews[other.id].some((m) => m.artifacts));
    gate();
    await until(() => env.store.artifact(tree.id, rendering.id).status === 'ready');
    await env.app.settled();
    assert.deepEqual((await state()).videos, []);
    const ready = await artifact(tree.id);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.phase, undefined);
    assert.equal(ready.progress, undefined);
    assert.equal(ready.position, pending.position);
    const media = `/api/trees/${tree.id}/artifacts/${ready.id}/media`;
    const whole = await env.get(media);
    assert.equal(whole.headers.get('accept-ranges'), 'bytes');
    assert.equal(Buffer.from(await whole.arrayBuffer()).length, mp4.length);
    const part = await fetch(whole.url, { headers: { Range: 'bytes=4-11' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 4-11/${mp4.length}`);
    assert.equal(Buffer.from(await part.arrayBuffer()).toString('latin1'), 'ftypisom');
    const tail = await fetch(whole.url, { headers: { Range: 'bytes=-10' } });
    assert.equal(Buffer.from(await tail.arrayBuffer()).length, 10);
    assert.equal(
      (await fetch(whole.url, { headers: { Range: `bytes=${mp4.length}-` } })).status,
      416,
    );
  } finally {
    env.close();
  }
});

const repo = fileURLToPath(new URL('../..', import.meta.url));
const browser = join(
  repo,
  'node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell',
);
const sandboxed = spawnSync('bwrap', ['--version']).status === 0 && existsSync(browser);
// Full Remotion renders take about 15s each; run them with npm run test:render.
const realRender = sandboxed && process.env.TREETUTOR_REAL_RENDER === '1';
const renderSkip =
  !realRender &&
  (sandboxed
    ? 'set TREETUTOR_REAL_RENDER=1 (npm run test:render)'
    : 'bwrap or Remotion browser missing');

test(
  'render sandbox hides home and app data, blocks network and confines writes to the workspace',
  { skip: !sandboxed && 'bwrap or Remotion browser missing' },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-sandbox-'));
    const workspace = join(dir, 'video-work', 'artifact', 'attempt');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(workspace, 'public'));
    writeFileSync(join(workspace, 'public', 'narration.mp3'), 'OWNED AUDIO');
    writeFileSync(join(workspace, 'narration.json'), '{}');
    writeFileSync(join(dir, 'trees.sqlite'), 'LEARNING DATA');
    const probe = `const fs = require('fs'); const r = {};
    const tryIt = (k, f) => { try { f(); r[k] = 'allowed'; } catch { r[k] = 'denied'; } };
    tryIt('appData', () => fs.readFileSync(${JSON.stringify(join(dir, 'trees.sqlite'))}));
    tryIt('home', () => fs.readdirSync(${JSON.stringify(join(homedir(), '.claude'))}));
    tryIt('repo', () => fs.readFileSync(${JSON.stringify(join(repo, 'package.json'))}));
    tryIt('writeOutside', () => fs.writeFileSync('/usr/x', ''));
    tryIt('writeWorkspace', () => fs.writeFileSync('ok', ''));
    r.audio = fs.readFileSync('public/narration.mp3', 'utf8');
    tryIt('mutateAudio', () => fs.writeFileSync('public/narration.mp3', 'changed'));
    tryIt('mutateTiming', () => fs.writeFileSync('narration.json', 'changed'));
    r.env = Object.keys(process.env).sort().join(',');
    require('net').connect(443, '1.1.1.1').on('connect', () => { r.network = 'allowed'; done(); }).on('error', () => { r.network = 'denied'; done(); });
    function done() { console.log(JSON.stringify(r)); process.exit(0); }`;
    const run = spawnSync('bwrap', [...SANDBOX(workspace), process.execPath, '-e', probe], {
      encoding: 'utf8',
      env: {},
    });
    assert.deepEqual(JSON.parse(run.stdout), {
      appData: 'denied',
      home: 'denied',
      repo: 'denied',
      writeOutside: 'denied',
      writeWorkspace: 'allowed',
      audio: 'OWNED AUDIO',
      mutateAudio: 'denied',
      mutateTiming: 'denied',
      env: 'HOME,PATH,PWD,TMPDIR',
      network: 'denied',
    });
  },
);

test(
  'one real short sandboxed Remotion render publishes a ready MP4',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    const { result, row, published, dir, phases } = await job(undefined);
    assert.equal(result, null);
    // Phases run in order; planning counts characters, rendering reports real 1% steps of a known frame total, ending at 100%.
    const order = phases.map(([phase]) => phase).filter((phase, i, all) => phase !== all[i - 1]);
    assert.deepEqual(order, ['planning', 'narrating', 'planning', 'rendering', 'saving']);
    assert.ok(phases.find(([phase]) => phase === 'planning')[2].characters > 0);
    const rendering = phases.filter(([phase]) => phase === 'rendering');
    assert.ok(rendering.length > 2 && rendering.every(([, , detail]) => detail.frames === 75));
    assert.deepEqual(rendering.at(-1).slice(0, 2), ['rendering', 1]);
    assert.equal(row.status, 'ready');
    assert.equal(row.duration, 2.5);
    assert.equal(published, true);
    assert.equal(readFileSync(mediaPath(dir, row.id)).toString('latin1', 4, 8), 'ftyp');
    const metadata = await getVideoMetadata(mediaPath(dir, row.id));
    assert.deepEqual([metadata.width, metadata.height, metadata.fps], [1920, 1080, 30]);
  },
);

test(
  'one real short sandboxed multi-cut render joins three narrated cuts with transitions',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    const { result, row, dir, published } = await job(undefined, undefined, spatial, 3);
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    assert.equal(published, true);
    const data = JSON.parse(row.source);
    assert.deepEqual(
      data.cuts.map((c) => c.timing.durationInFrames),
      [75, 75, 75],
    );
    assert.deepEqual(
      data.cuts.map((c) => c.status),
      ['ready', 'ready', 'ready'],
    );
    assert.equal(row.duration, 7.5);
    const metadata = await getVideoMetadata(mediaPath(dir, row.id));
    assert.deepEqual([metadata.width, metadata.height, metadata.fps], [1920, 1080, 30]);
    assert.ok(Math.abs(metadata.durationInSeconds - 7.5) < 1 / 30);
    const ffmpeg = RenderInternals.getExecutablePath({
      type: 'ffmpeg',
      indent: false,
      logLevel: 'error',
      binariesDirectory: null,
    });
    // Centre cube fades into the ground during the first pause, then returns in cut two.
    const pixel = (seconds) => {
      const png = execFileSync(ffmpeg, [
        '-v',
        'error',
        '-ss',
        String(seconds),
        '-i',
        mediaPath(dir, row.id),
        '-frames:v',
        '1',
        '-vf',
        'crop=2:2:960:540,format=rgb24',
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        '-',
      ]);
      const idat = png.indexOf('IDAT');
      return [...inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)))].slice(
        1,
        4,
      );
    };
    const before = pixel(1),
      pause = pixel(2.4667),
      after = pixel(3.5);
    assert.ok(before[0] > 100 && after[0] > 100, `expected visible cuts: ${before}, ${after}`);
    assert.ok(
      pause[0] < 40 && pause[1] < 40 && pause[2] < 40,
      `expected dark transition: ${pause}`,
    );
    assert.equal(metadata.audioCodec, 'aac');
  },
);

test(
  'one real short sandboxed Three.js scene renders through the same isolated Remotion path',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    const { result, row, dir } = await job(undefined, undefined, spatial);
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    const metadata = await getVideoMetadata(mediaPath(dir, row.id));
    assert.deepEqual([metadata.width, metadata.height, metadata.fps], [1920, 1080, 30]);
    // A non-blank WebGL frame: the orange cube is drawn, not just the background.
    const ffmpeg = RenderInternals.getExecutablePath({
      type: 'ffmpeg',
      indent: false,
      logLevel: 'error',
      binariesDirectory: null,
    });
    const png = execFileSync(ffmpeg, [
      '-v',
      'error',
      '-ss',
      '1',
      '-i',
      mediaPath(dir, row.id),
      '-frames:v',
      '1',
      '-vf',
      'crop=2:2:960:540,format=rgb24',
      '-f',
      'image2pipe',
      '-c:v',
      'png',
      '-',
    ]);
    const idat = png.indexOf('IDAT'),
      [, r, g, b] = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    assert.ok(r > 120 && b < 80, `expected cube colour at the centre, got ${[r, g, b]}`);
  },
);
