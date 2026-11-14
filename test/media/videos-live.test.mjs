import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  directive,
  composition,
  styleBrief,
  task,
  fakeRender,
  complete,
  until,
  open,
} from '../support/video-kit.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { observe, notify } from '../support/events.mjs';

const plan = {
  title: task.title,
  description: task.description,
  styleBrief,
  cuts: ['First.', 'Second.'].map((narration, i) => ({
    purpose: `Step ${i + 1}`,
    engine: 'remotion',
    narration,
    endState: `Winner at position ${i + 1}`,
  })),
};

test('a video plays live once cut 1 is ready while later cuts are pending, with phases in order and real counts', async () => {
  const gates = {},
    opened = {};
  const gate = (name) => {
    opened[name] = true;
    notify();
    return new Promise((resolve) => (gates[name] = resolve));
  };
  const release = async (name) => {
    await until(() => opened[name]);
    gates[name]();
  };
  const provider = {
    generate: async (tree, text, emit) => {
      if (tree.instructions?.startsWith('You plan')) {
        await gate('plan');
        return complete(emit, JSON.stringify(plan));
      }
      if (tree.instructions?.startsWith('You write one Remotion cut')) {
        await gate(JSON.parse(text).cut.purpose === 'Step 1' ? 'first' : 'second');
        return complete(emit, composition);
      }
      complete(emit, 'Before.\n' + directive + '\n\nAfter.');
    },
  };
  const videoNarrate = async (text) => {
    if (text === 'First.') await gate('voice');
    return fakeNarration();
  };
  let renderProgress;
  const videoRender = async (workspace, output, signal, onProgress) => {
    renderProgress = onProgress;
    onProgress(0.4);
    // Hold only the first cut render; later cut renders and the join run straight through.
    if (!opened.render) await gate('render');
    return fakeRender(workspace, output);
  };
  const env = await open(provider, { videoRender, videoNarrate });
  // Phases follow saved cut state, so wake waiters on each save.
  observe(env.store, ['videoData']);
  try {
    const tree = env.store.create('Video');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
    const artifact = async () =>
      (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts[0];
    const seen = [];
    const at = async (phase) => {
      await until(async () => (await artifact()).phase === phase);
      const a = await artifact();
      seen.push([a.phase, a.cut, a.cuts]);
      return a;
    };
    const { id } = await at('planning');
    const cuts = `/api/trees/${tree.id}/artifacts/${id}/cuts`;
    assert.equal((await env.get(cuts)).status, 404, 'no live cuts before the plan');
    await release('plan');
    await at('writing');
    await release('first');
    await at('narrating');
    await release('voice');
    const playable = await at('playable');
    assert.equal(playable.status, 'pending');
    // Cut 1 is live: compiled code (no TypeScript or JSX left), timing and narration; cut 2 is still being written.
    const live = await (await env.get(cuts)).json();
    assert.deepEqual(live.paletteRoles, styleBrief.paletteRoles);
    assert.deepEqual(
      live.cuts.map((c) => [c.engine, c.playable, typeof c.code]),
      [
        ['remotion', true, 'string'],
        ['remotion', false, 'object'],
      ],
    );
    assert.match(live.cuts[0].code, /require\("remotion"\)/);
    assert.doesNotMatch(live.cuts[0].code, /<AbsoluteFill|^import /m);
    assert.equal(live.cuts[0].timing.durationInFrames, 75);
    const voice = await env.get(`${cuts}/0/narration`);
    assert.equal(voice.headers.get('content-type'), 'audio/mpeg');
    assert.deepEqual(
      Buffer.from(await voice.arrayBuffer()),
      Buffer.from((await fakeNarration()).audio),
    );
    for (const path of ['1/narration', '0/clip', '9/narration'])
      assert.equal((await env.get(`${cuts}/${path}`)).status, 404, path);
    assert.equal((await env.get(`/api/trees/other/artifacts/${id}/cuts`)).status, 404);
    // The library plays the live version until the MP4 is saved.
    assert.deepEqual(
      (await (await env.get('/api/videos')).json()).map((v) => [v.id, v.live]),
      [[id, tree.id]],
    );
    await release('second');
    const saving = await at('saving');
    assert.equal(saving.progress, 0.2, 'cut 1 of 2 at 40%');
    assert.equal(saving.frames, 150);
    renderProgress(0.1);
    assert.equal((await artifact()).phase, 'saving', 'the phase never moves backward');
    await release('render');
    await until(async () => (await artifact()).status === 'ready');
    await env.app.settled();
    assert.deepEqual(seen, [
      ['planning', undefined, undefined],
      ['writing', 0, 2],
      ['narrating', undefined, undefined],
      ['playable', 1, 2],
      ['saving', undefined, undefined],
    ]);
    assert.equal((await env.get(cuts)).status, 404, 'the saved MP4 replaces the live cuts');
    assert.deepEqual(
      (await (await env.get('/api/videos')).json()).map((v) => [v.id, v.live]),
      [[id, undefined]],
    );
  } finally {
    env.close();
  }
});
