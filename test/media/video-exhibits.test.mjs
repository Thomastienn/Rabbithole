import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { generateVideo } from '../../server/media/videos.mjs';
import { EXHIBITS_NOTE, CLIPS_NOTE } from '../../server/media/video-plan.mjs';
import { EXHIBIT_NOTE } from '../../server/media/video-cut.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { planFor, complete, fakeRender, noSnapshot, open } from '../support/video-kit.mjs';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), Buffer.alloc(32, 3)]);
const cut = `import { AbsoluteFill } from 'remotion';
import { Exhibit } from './kit';
export default function Video() { return <AbsoluteFill><Exhibit id="exhibit1" x={1200} y={460} /></AbsoluteFill>; }`;
const planned = [
  { kind: 'image', query: 'Ada Lovelace portrait', show: 'Ada' },
  { kind: 'image', query: 'broken', show: 'Nothing' },
  { kind: 'quote', query: 'Lovelace patterns', text: 'It weaves algebraic patterns.', by: 'Ada Lovelace' },
];
const fetched = {
  'Ada Lovelace portrait': {
    kind: 'image',
    url: 'https://museum.example/ada.png',
    title: 'Ada Lovelace portrait',
    site: 'museum.example',
    bytes: png,
    type: 'image/png',
  },
  'Apollo 11 landing footage': {
    kind: 'clip',
    url: 'https://video.example/watch?v=1',
    title: 'Apollo 11 landing',
    site: 'video.example',
    seconds: 6,
    bytes: Buffer.from('mp4 clip'),
    type: 'video/mp4',
  },
  'Lovelace patterns': {
    kind: 'quote',
    text: 'It weaves algebraic patterns.',
    by: 'Ada Lovelace',
    url: 'https://archive.example/notes',
    title: 'Notes',
    site: 'archive.example',
  },
};

async function run({ ready = true, off = false, plan, clips = false, narrate = fakeNarration } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-exhibits-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  if (off) store.saveTutorTool('web_search', false);
  const tree = store.create('Video', 'codex');
  const message = store.message(tree.id, 'assistant', 'Reply.', 'completed');
  const artifact = store.pendingArtifact(tree.id, message, 'Title', 'Planned.', 'video', '{"request":"Make a video."}');
  if (!plan) {
    plan = planFor(undefined, 2);
    plan.cuts[0].exhibits = planned.slice(0, 2);
    plan.cuts[1].exhibits = planned.slice(2);
  }
  const calls = [],
    staged = [],
    warnings = [];
  const result = await generateVideo({
    provider: {
      generate: async (t, text, emit) => {
        calls.push({ instructions: t.instructions, input: JSON.parse(text) });
        complete(emit, t.instructions.startsWith('You plan') ? JSON.stringify(plan) : cut);
      },
    },
    selection: {},
    store,
    dir,
    artifact,
    signal: new AbortController().signal,
    render: async (workspace, output, ...rest) => {
      // The joined render of several cuts has no host data of its own.
      if (existsSync(join(workspace, 'stock.json')))
        staged.push(JSON.parse(readFileSync(join(workspace, 'stock.json'), 'utf8')));
      return fakeRender(workspace, output, ...rest);
    },
    snapshot: noSnapshot,
    narrate,
    onWarning: (w) => warnings.push(w),
    search: { status: async () => ({ ready }) },
    exhibit: async (p, options) => {
      if (p.kind === 'clip') assert.equal(options.clips.ready, true);
      if (!fetched[p.query]) throw new Error('image returned HTTP 404');
      return { ...fetched[p.query], ...(p.sound && { sound: true, sentence: p.sentence }) };
    },
    clips: () => (clips ? { ready: true, ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' } : { ready: false, error: 'no yt-dlp' }),
  }).then(
    () => null,
    (error) => error.message,
  );
  return { result, calls, staged, warnings, store, tree, dir, artifact, row: store.artifact(tree.id, artifact.id) };
}

test('a video with exhibits fetches them, drops a failed one, hands the rest to the cut as data and credits them as resources', async () => {
  const { result, calls, staged, warnings, store, tree, row } = await run();
  assert.equal(result, null);
  assert.equal(row.status, 'ready');
  assert.ok(calls[0].instructions.includes(EXHIBITS_NOTE));
  const writers = calls.filter((c) => c.input.cut);
  assert.ok(writers.every((w) => w.instructions.includes(EXHIBIT_NOTE)));
  // The planned list never reaches the writers; each sees only its cut's fetched exhibits.
  assert.ok(writers.every((w) => w.input.cut.exhibits === undefined));
  assert.deepEqual(writers.map((w) => w.input.exhibits), [
    [{ id: 'exhibit1', kind: 'image', title: 'Ada Lovelace portrait', site: 'museum.example', show: 'Ada' }],
    [{ id: 'exhibit3', kind: 'quote', text: 'It weaves algebraic patterns.', by: 'Ada Lovelace', title: 'Notes', site: 'archive.example' }],
  ]);
  assert.deepEqual(warnings, ['WARN video exhibit dropped: image returned HTTP 404']);
  // The background render reads the same exhibits, the image inlined as a data URL.
  assert.deepEqual(staged, [
    { exhibit1: { kind: 'image', title: 'Ada Lovelace portrait', site: 'museum.example', show: 'Ada', src: `data:image/png;base64,${png.toString('base64')}` } },
    { exhibit3: { kind: 'quote', text: 'It weaves algebraic patterns.', by: 'Ada Lovelace', title: 'Notes', site: 'archive.example' } },
  ]);
  assert.deepEqual(
    store.resources(tree.id).map(({ url, title, site, kind }) => ({ url, title, site, kind })),
    [
      { url: 'https://museum.example/ada.png', title: 'Ada Lovelace portrait', site: 'museum.example', kind: 'image' },
      { url: 'https://archive.example/notes', title: 'Notes', site: 'archive.example', kind: 'quote' },
    ],
  );
  assert.deepEqual(store.pieceList().pieces, []);
});

test('without web search ready and switched on the planner gets no exhibit option and a plan naming exhibits is rejected', async () => {
  const { result, calls, store, tree } = await run({ ready: false });
  assert.ok(!calls[0].instructions.includes(EXHIBITS_NOTE));
  assert.match(result, /cut 1 exhibits/);
  assert.deepEqual(store.resources(tree.id), []);
  const off = await run({ off: true });
  assert.ok(!off.calls[0].instructions.includes(EXHIBITS_NOTE));
  assert.match(off.result, /cut 1 exhibits/);
  const plain = await run({ ready: false, plan: planFor() });
  assert.equal(plain.result, null);
  assert.deepEqual(plain.staged, [{}]);
});

test('live playback serves exhibit metadata and image bytes, never the private file name', async () => {
  const env = await open({ generate: async () => {} });
  try {
    const tree = env.store.create('Video', 'codex');
    const message = env.store.message(tree.id, 'assistant', 'Reply.', 'completed');
    const a = env.store.pendingArtifact(tree.id, message, 'Title', 'Planned.', 'video', '{}');
    const exhibits = [
      { id: 'exhibit1', cut: 0, kind: 'image', url: 'https://m.example/a.png', title: 'A', site: 'm.example', type: 'image/png', file: 'exhibits/exhibit1', show: 'A' },
      { id: 'exhibit2', cut: 0, kind: 'quote', url: 'https://q.example', title: 'Q', site: 'q.example', text: 'Words.' },
    ];
    env.store.videoData(tree.id, a.id, a.attempt, { plan: planFor(), cuts: [{ engine: 'remotion' }], exhibits });
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const folder = join(env.dir, 'video-work', a.id, a.attempt, 'cut-0', 'exhibits');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'exhibit1'), png);
    const base = `/api/trees/${tree.id}/artifacts/${a.id}/cuts`;
    const data = await (await env.get(base)).json();
    assert.deepEqual(data.exhibits, [
      { id: 'exhibit1', cut: 0, kind: 'image', title: 'A', site: 'm.example', media: true },
      { id: 'exhibit2', cut: 0, kind: 'quote', title: 'Q', site: 'q.example', text: 'Words.', media: false },
    ]);
    const image = await env.get(`${base}/0/exhibit`);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.ok(Buffer.from(await image.arrayBuffer()).equals(png));
    assert.equal((await env.get(`${base}/1/exhibit`)).status, 404);
  } finally {
    env.close();
  }
});

test('a muted clip exhibit is planned only with the downloader, staged for the MP4 render as a public file and credited as a resource', async () => {
  const clip = { kind: 'clip', query: 'Apollo 11 landing footage', show: 'The landing', start: 30, end: 36, sound: false };
  const plan = planFor();
  plan.cuts[0].exhibits = [clip, { ...clip, query: 'missing footage' }];
  const { result, calls, staged, warnings, store, tree, dir, artifact } = await run({ plan, clips: true });
  assert.equal(result, null);
  assert.ok(calls[0].instructions.includes(CLIPS_NOTE));
  const writer = calls.find((c) => c.input.cut);
  assert.deepEqual(writer.input.exhibits, [
    { id: 'exhibit1', kind: 'clip', title: 'Apollo 11 landing', site: 'video.example', seconds: 6, show: 'The landing' },
  ]);
  assert.deepEqual(warnings, ['WARN video exhibit dropped: image returned HTTP 404']);
  assert.deepEqual(staged, [
    { exhibit1: { kind: 'clip', title: 'Apollo 11 landing', site: 'video.example', seconds: 6, show: 'The landing', clip: 'exhibit1.mp4' } },
  ]);
  const work = join(dir, 'video-work', artifact.id, artifact.attempt, 'cut-0');
  assert.equal(readFileSync(join(work, 'public', 'exhibit1.mp4'), 'utf8'), 'mp4 clip');
  assert.deepEqual(
    store.resources(tree.id).map(({ url, kind }) => ({ url, kind })),
    [{ url: 'https://video.example/watch?v=1', kind: 'clip' }],
  );
  // Without the downloader the planner gets no clip option and a clip plan is rejected.
  const without = await run({ plan, clips: false });
  assert.ok(without.calls[0].instructions.includes(EXHIBITS_NOTE));
  assert.ok(!without.calls[0].instructions.includes(CLIPS_NOTE));
  assert.match(without.result, /cut 1 exhibits/);
});

test('a clip with sound puts a pause of its length into the narration after its sentence, where the cut plays its sound', async () => {
  const clip = { kind: 'clip', query: 'Apollo 11 landing footage', show: 'The landing', start: 30, end: 36, sound: true, sentence: 0 };
  const plan = planFor();
  plan.cuts[0].exhibits = [clip];
  // Two sentences over the fixture tone: the pause goes between them.
  const narrate = async () => ({
    ...(await fakeNarration()),
    sentenceBoundaries: [
      { offset: 0, duration: 8000000, text: 'Winners advance.' },
      { offset: 9000000, duration: 9000000, text: 'Losers rest.' },
    ],
    wordBoundaries: [
      { offset: 0, duration: 8000000, text: 'Winners advance.' },
      { offset: 9000000, duration: 9000000, text: 'Losers rest.' },
    ],
  });
  const { result, calls, staged, dir, artifact } = await run({ plan, clips: true, narrate });
  assert.equal(result, null);
  assert.deepEqual(calls.find((c) => c.input.cut).input.exhibits[0], {
    id: 'exhibit1', kind: 'clip', title: 'Apollo 11 landing', site: 'video.example', seconds: 6, sound: true, sentence: 0, show: 'The landing',
  });
  const work = join(dir, 'video-work', artifact.id, artifact.attempt, 'cut-0');
  const timing = JSON.parse(readFileSync(join(work, 'narration.json'), 'utf8'));
  // Sentence 0 ends at 0.8 s (frame 24); the 6-second clip is 180 frames of silence in the narration track.
  assert.deepEqual(timing.pause, { id: 'exhibit1', startFrame: 24, frames: 180 });
  assert.deepEqual(timing.sentences.map((x) => x.startMs), [0, 900 + 6000]);
  // The track itself is longer by the clip: the 1.92 s tone plus 6 s.
  assert.ok(timing.audioFrames >= 236 && timing.audioFrames <= 240, `narration frames ${timing.audioFrames}`);
  // Subtitles show only narration: no caption during the pause, the second one shifted past it.
  assert.deepEqual(timing.captions.map((c) => [c.text, c.startFrame]), [['Winners advance.', 0], ['Losers rest.', 207]]);
  assert.ok(timing.captions.every((c) => c.endFrame <= 24 || c.startFrame >= 204));
  assert.match(readFileSync(join(work, 'public', 'captions.vtt'), 'utf8'), /00:00:06\.900 --> 00:00:07\.800\nLosers rest\./);
  // The render's host data starts the footage at the pause whatever the cut passes.
  assert.equal(staged[0].exhibit1.from, 24);
});
