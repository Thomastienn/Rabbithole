import { observe, observeStore, observeProvider } from './events.mjs';
import { fakeNarration } from './fake-narration.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { generateVideo, mediaPath } from '../../server/media/videos.mjs';
import { readFileSync } from 'node:fs';

export const task = {
  title: 'Winners advance',
  description: 'Two winners meet in the final.',
  intent: 'Animate two winners advancing.',
  excerpt: 'A and B advance to the final.',
};
export const directive = '\n```treetutor-video\n' + JSON.stringify(task) + '\n```';
export const composition = `// Description: Two labelled boxes slide together into a final box.
// Narration: "Winners advance."
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
// PRIVATE_SOURCE_MARKER
export const durationInFrames = 30;
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 20], [0, 1]) }}>A + B → Final</AbsoluteFill>;
}`;
export const spatial = `// Description: A lit cube rotates in 3D space.
// Narration: "A cube turns."
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { palette } from './kit';
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: palette.ground }}><ThreeCanvas width={1920} height={1080} camera={{ position: [0, 0, 4] }}>
    <ambientLight intensity={0.5} /><directionalLight position={[2, 2, 3]} />
    <mesh rotation={[frame / 20, frame / 15, 0]}><boxGeometry args={[1.4, 1.4, 1.4]} /><meshStandardMaterial color={palette.amber} /></mesh>
  </ThreeCanvas></AbsoluteFill>;
}`;
export const manimCut = `from kit import HouseScene, MathTex, Text, VGroup, TransformMatchingTex, Write, FadeIn, colors, fonts, point
class Cut(HouseScene):
    def construct(self):
        title = Text("Winner", font_size=48).move_to(point(960, 180))
        note = Text("A term moves across the equals sign.", font=fonts["reading"], font_size=32).move_to(point(960, 780))
        start = MathTex("x + 1 = 2", color=colors["winner"]).scale(2).move_to(point(960, 500))
        end = MathTex("x = 1", color=colors["winner"]).scale(2).move_to(point(960, 500))
        self.play(FadeIn(VGroup(title, note)), Write(start), run_time=0.5)
        self.play(TransformMatchingTex(start, end), run_time=0.5)
`;
export const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(4096, 1),
]);
// Writes no stills, so the cut audit is skipped; audit tests inject their own snapshot.
export const noSnapshot = async () => {};
export const fakeRender = async (workspace, output) => {
  writeFileSync(output, mp4);
  return {
    durationInFrames: JSON.parse(readFileSync(join(workspace, 'narration.json'))).durationInFrames,
    fps: 30,
  };
};
export const styleBrief = {
  layoutAreas: [{ name: 'stage', description: 'Winner above the final at the centre.' }],
  paletteRoles: { winner: 'amber' },
  recurringObjects: [{ name: 'Winner', position: 'centre', colorRole: 'winner' }],
  exactTerms: ['Winner', 'Final'],
};
export const planFor = (source = composition, count = 1) => ({
  title: task.title,
  description: /^\/\/ Description: (.+)$/m.exec(source)?.[1] ?? task.description,
  styleBrief,
  cuts: Array.from({ length: count }, (_, i) => ({
    purpose: `Step ${i + 1}`,
    engine: 'remotion',
    dimension: '2d',
    narration: JSON.parse(/^\/\/ Narration: (.+)$/m.exec(source)?.[1] ?? '"Winners advance."'),
    endState: `Winner at position ${i + 1}`,
  })),
});
export const videoResponse = (tree, source = composition) =>
  tree.instructions?.startsWith('You plan') && source.startsWith('// Description:')
    ? JSON.stringify(planFor(source))
    : source;
export const complete = (emit, text) => {
  emit({ type: 'item', item: 'answer', text });
  emit({ type: 'status', status: 'completed' });
};
export { until } from './events.mjs';

export async function open(provider, options = {}) {
  observe(options, ['videoRender', 'videoNarrate', 'videoSnapshot']);
  provider = { models: async () => [{ model: 'fixture-model', isDefault: true }], ...provider };
  const dir = mkdtempSync(join(tmpdir(), 'tt-videos-'));
  const store = observeStore(new Store(join(dir, 'trees.sqlite')));
  const app = createApp({
    store,
    provider: observeProvider(provider),
    auth: { status: () => ({ connected: true }) },
    dir,
    videoRender: fakeRender,
    videoSnapshot: noSnapshot,
    videoNarrate: fakeNarration,
    ...options,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  return {
    store,
    app,
    dir,
    get: (path) => fetch(origin + path),
    post: (path, body = {}) =>
      fetch(origin + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(body),
      }),
    close: () => {
      app.stop();
      store.close();
    },
  };
}

export async function job(render, mutate, source = composition, count = 1, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-job-'));
  const store = observeStore(new Store(join(dir, 'trees.sqlite')));
  const tree = store.create('Video', 'codex');
  const message = store.message(tree.id, 'assistant', 'Reply.', 'completed');
  const artifact = store.pendingArtifact(
    tree.id,
    message,
    'Title',
    'Planned.',
    'video',
    '{"request":"Make a video."}',
  );
  mutate?.(store, artifact, dir);
  const audits = [];
  const provider = {
    generate: async (t, text, emit) => {
      if (t.images) audits.push(t.images);
      complete(
        emit,
        t.instructions.startsWith('You plan') &&
          (options.plan || source.startsWith('// Description:'))
          ? JSON.stringify(options.plan ?? planFor(source, count))
          : options.plan?.cuts.find((c) => c.purpose === JSON.parse(text).cut.purpose)?.engine ===
              'manim'
            ? manimCut
            : source,
      );
    },
  };
  const phases = [];
  const result = await generateVideo({
    provider,
    selection: {},
    store,
    dir,
    artifact,
    signal: new AbortController().signal,
    render,
    // A real render also takes real snapshots.
    snapshot: options.snapshot ?? (render ? noSnapshot : undefined),
    narrate: fakeNarration,
    onPhase: (...p) => phases.push(p),
    manim: options.manim,
  }).then(
    () => null,
    (error) => error.message,
  );
  assert.ok(!existsSync(join(dir, 'video-work', artifact.id, artifact.attempt, 'out'))); // no leftover unpublished output
  return {
    result,
    row: store.artifact(tree.id, artifact.id),
    published: existsSync(mediaPath(dir, artifact.id)),
    dir,
    phases,
    audits,
  };
}
