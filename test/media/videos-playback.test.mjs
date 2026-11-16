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
import { manimBindings } from '../../server/media/manim-cut.mjs';
import { detectManim } from '../../server/media/manim.mjs';
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
  planFor,
  sandboxed,
  renderSkip,
  pixel,
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
    const tree = env.store.create('Video', 'codex'),
      other = env.store.create('Other', 'codex');
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
    assert.equal(rendering.phase, 'saving');
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
    const { result, row, published, dir, phases, audits } = await job(undefined);
    assert.equal(result, null);
    // Real stills from the sandbox reach the audit: one per sentence end plus the last frame.
    assert.deepEqual(
      audits.map((images) => images.map((i) => i.type)),
      [['image/jpeg', 'image/jpeg']],
    );
    // Phases run in order; planning counts characters, saving reports real 1% render steps of a known frame total, ending at 100%.
    const steps = ['planning', 'writing', 'narrating', 'auditing', 'playable', 'saving'];
    const order = phases.map(([phase]) => phase).filter((phase, i, all) => phase !== all[i - 1]);
    assert.deepEqual(
      order,
      [...order].sort((a, b) => steps.indexOf(a) - steps.indexOf(b)),
    );
    assert.deepEqual([order[0], order.at(-2), order.at(-1)], ['planning', 'playable', 'saving']);
    assert.ok(phases.find(([phase]) => phase === 'planning')[2].characters > 0);
    const rendering = phases.filter(([phase]) => phase === 'saving');
    assert.ok(rendering.length > 2 && rendering.every(([, , detail]) => detail.frames === 75));
    assert.deepEqual(rendering.at(-1).slice(0, 2), ['saving', 1]);
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
    const video = mediaPath(dir, row.id),
      before = pixel(video, 1),
      pause = pixel(video, 2.4667),
      after = pixel(video, 3.5);
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

test(
  'one real short sandboxed cut draws the cursor, sketch and lifting pen tip timed to its sentence',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    const plan = planFor(composition);
    // Fixture narration has one 1.8 s sentence (frames 0 to 54); the overlay fades by the pause.
    plan.cuts[0].emphasis = [
      { tool: 'cursor', sentence: 0, x: 400, y: 300, label: 'Winner' },
      {
        tool: 'sketch',
        shape: 'underline',
        sentence: 0,
        points: [
          [600, 800],
          [1300, 800],
        ],
      },
    ];
    const { result, row, dir } = await job(undefined, undefined, composition, 1, { plan });
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    const video = mediaPath(dir, row.id),
      pen = pixel(video, 1, 960, 799),
      cursor = pixel(video, 1, 406, 322),
      faded = pixel(video, 2.2, 960, 799);
    await import('../support/tsx.mjs');
    const { penAt } = await import('../../server/media/video-kit.tsx');
    const tip = penAt(plan.cuts[0].emphasis[1], [{ startFrame: 0, endFrame: 54 }], 6);
    const x = Math.round(tip.x + 20),
      y = Math.round(tip.y - 24);
    const drawing = pixel(video, 0.2, x, y),
      lifted = pixel(video, 1, x, y);
    assert.ok(
      drawing.every((c) => c > 180),
      `expected paper pen tip while drawing: ${drawing}`,
    );
    assert.ok(
      lifted.every((c) => c < 60),
      `expected pen tip to lift away: ${lifted}`,
    );
    assert.ok(pen[0] > 150 && pen[2] < 120, `expected amber underline: ${pen}`);
    assert.ok(
      cursor.every((c) => c > 180),
      `expected paper cursor: ${cursor}`,
    );
    assert.ok(
      faded.every((c) => c < 60),
      `expected faded underline: ${faded}`,
    );
  },
);

test(
  'one real short sandboxed Manim cut joins a Remotion cut with house fonts, math, narration and subtitles',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    const runtime = detectManim();
    assert.equal(runtime.ready, true, runtime.error);
    const root = mkdtempSync(join(tmpdir(), 'tt-python-sandbox-'));
    const workspace = join(root, 'video-work', 'artifact', 'attempt', 'cut-0');
    mkdirSync(join(workspace, 'tmp'), { recursive: true });
    mkdirSync(join(workspace, 'public'));
    writeFileSync(join(root, 'trees.sqlite'), 'PRIVATE APP DATA');
    writeFileSync(join(workspace, 'public/narration.mp3'), 'OWNED AUDIO');
    const probe = `import json, os, socket
from pathlib import Path
results = {}
def check(name, operation):
    try:
        operation()
        results[name] = 'allowed'
    except OSError:
        results[name] = 'denied'
check('appData', lambda: Path(${JSON.stringify(join(root, 'trees.sqlite'))}).read_text())
check('home', lambda: list(Path(${JSON.stringify(join(homedir(), '.claude'))}).iterdir()))
check('repo', lambda: Path(${JSON.stringify(join(repo, 'package.json'))}).read_text())
check('writeRuntime', lambda: Path(${JSON.stringify(join(repo, '.venv/UNEXPECTED'))}).write_text('bad'))
check('writeOutside', lambda: Path('/usr/UNEXPECTED').write_text('bad'))
check('writeWorkspace', lambda: Path('ok').write_text('ok'))
check('mutateAudio', lambda: Path('public/narration.mp3').write_text('bad'))
check('network', lambda: socket.create_connection(('1.1.1.1',443), timeout=1))
results['env'] = sorted(k for k in os.environ if k not in ['HOME','PATH','PWD','TMPDIR','LC_CTYPE'])
print(json.dumps(results))`;
    const probeResult = spawnSync(
      'bwrap',
      [...SANDBOX(workspace), ...manimBindings(runtime.python), runtime.python, '-I', '-c', probe],
      { encoding: 'utf8', env: {} },
    );
    assert.equal(probeResult.status, 0, probeResult.stderr);
    assert.deepEqual(JSON.parse(probeResult.stdout), {
      appData: 'denied',
      home: 'denied',
      repo: 'denied',
      writeRuntime: 'denied',
      writeOutside: 'denied',
      writeWorkspace: 'allowed',
      mutateAudio: 'denied',
      network: 'denied',
      env: [],
    });
    const plan = planFor(composition, 2);
    plan.cuts[1].engine = 'manim';
    const { result, row, dir, published } = await job(undefined, undefined, composition, 2, {
      plan,
    });
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    assert.equal(published, true);
    const data = JSON.parse(row.source);
    assert.deepEqual(
      data.cuts.map((c) => c.engine),
      ['remotion', 'manim'],
    );
    assert.deepEqual(
      data.cuts.map((c) => c.status),
      ['ready', 'ready'],
    );
    const clip = join(dir, 'video-work', row.id, row.attempt, data.cuts[1].clip);
    for (const path of [clip, mediaPath(dir, row.id)]) {
      const metadata = await getVideoMetadata(path);
      assert.deepEqual([metadata.width, metadata.height, metadata.fps], [1920, 1080, 30]);
      assert.ok(Math.abs(metadata.durationInSeconds - (path === clip ? 2.5 : 5)) < 1 / 30);
    }
    assert.equal((await getVideoMetadata(mediaPath(dir, row.id))).audioCodec, 'aac');
    const ffmpeg = RenderInternals.getExecutablePath({
      type: 'ffmpeg',
      indent: false,
      logLevel: 'error',
      binariesDirectory: null,
    });
    const region = (file, seconds, crop) =>
      execFileSync(ffmpeg, [
        '-v',
        'error',
        '-ss',
        String(seconds),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        `crop=${crop},format=rgb24`,
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        '-pred',
        'none',
        '-',
      ]);
    const bright = (buffer) => {
      const chunks = [];
      const width = buffer.readUInt32BE(16);
      for (let offset = 8; offset < buffer.length;) {
        const size = buffer.readUInt32BE(offset);
        if (buffer.toString('ascii', offset + 4, offset + 8) === 'IDAT')
          chunks.push(buffer.subarray(offset + 8, offset + 8 + size));
        offset += size + 12;
      }
      const pixels = inflateSync(Buffer.concat(chunks));
      let count = 0;
      for (let row = 0; row < pixels.length; row += width * 3 + 1) {
        assert.equal(pixels[row], 0, 'PNG uses unfiltered RGB rows');
        for (let i = row + 1; i < row + width * 3 + 1; i += 3) if (pixels[i] > 100) count++;
      }
      return count;
    };
    const equation = '600:200:660:400';
    assert.ok(
      bright(region(clip, 0.7, equation)) > 500,
      'Manim draws an equation, not just the ground',
    );
    assert.ok(
      bright(region(mediaPath(dir, row.id), 3.2, equation)) > 500,
      'the rendered math reaches its ordered timeline position',
    );
    const band = '1680:120:120:960';
    assert.equal(bright(region(clip, 0.7, band)), 0, 'raw math leaves the subtitle band empty');
    assert.ok(
      bright(region(mediaPath(dir, row.id), 3.2, band)) > 100,
      'the shared wrapper draws subtitles over the Manim clip',
    );
    assert.equal(
      bright(region(mediaPath(dir, row.id), 4.9667, equation)),
      0,
      'Manim fades into the same dark pause',
    );
  },
);
