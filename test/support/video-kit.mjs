import { fakeNarration } from './fake-narration.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { generateVideo, mediaPath } from '../../server/media/videos.mjs';

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
  return <AbsoluteFill style={{ background: 'white', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 20], [0, 1]) }}>A + B → Final</AbsoluteFill>;
}`;
export const spatial = `// Description: A lit cube rotates in 3D space.
// Narration: "A cube turns."
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#102030' }}><ThreeCanvas width={1280} height={720} camera={{ position: [0, 0, 4] }}>
    <ambientLight intensity={0.5} /><directionalLight position={[2, 2, 3]} />
    <mesh rotation={[frame / 20, frame / 15, 0]}><boxGeometry args={[1.4, 1.4, 1.4]} /><meshStandardMaterial color="orange" /></mesh>
  </ThreeCanvas></AbsoluteFill>;
}`;
export const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(4096, 1),
]);
export const fakeRender = async (workspace, output) => {
  writeFileSync(output, mp4);
  return { durationInFrames: 60, fps: 30 };
};
export const complete = (emit, text) => {
  emit({ type: 'item', item: 'answer', text });
  emit({ type: 'status', status: 'completed' });
};
export const until = async (check) => {
  for (let i = 0; i < 200; i++) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('timed out');
};

export async function open(provider, options = {}) {
  provider = { models: async () => [{ model: 'fixture-model', isDefault: true }], ...provider };
  const dir = mkdtempSync(join(tmpdir(), 'tt-videos-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({
    store,
    provider,
    auth: { status: () => ({ connected: true }) },
    dir,
    videoRender: fakeRender,
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

export async function job(render, mutate, source = composition) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-job-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const tree = store.create('Video');
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
  const provider = { generate: async (t, text, emit) => complete(emit, source) };
  const phases = [];
  const result = await generateVideo({
    provider,
    selection: {},
    store,
    dir,
    artifact,
    signal: new AbortController().signal,
    render,
    narrate: fakeNarration,
    onPhase: (...p) => phases.push(p),
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
  };
}
