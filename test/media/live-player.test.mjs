import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { default: VideoCard } = await import('../../src/media/VideoCard.tsx');
const { default: LiveVideo, liveDuration } = await import('../../src/media/liveVideo.tsx');
const { Thumbnail } = await import('@remotion/player');

const timing = (durationInFrames) => ({
  durationInFrames,
  audioFrames: durationInFrames - 15,
  transitionIn: false,
  sentences: [],
  captions: [{ text: 'First caption.', startFrame: 0, endFrame: 40 }],
});

test('the live player shows cut 1 and buffers at an unready cut', async (t) => {
  const cuts = [
    {
      playable: true,
      timing: timing(75),
      audio: 'blob:narration',
      Component: () => h('p', null, 'Cut one'),
    },
    { playable: false, timing: null },
  ];
  assert.equal(liveDuration(cuts), 165, 'an untimed cut holds a placeholder length');
  let show;
  function Frame() {
    const [frame, setFrame] = useState(10);
    show = setFrame;
    return h(Thumbnail, {
      component: LiveVideo,
      inputProps: { cuts },
      durationInFrames: liveDuration(cuts),
      compositionWidth: 1920,
      compositionHeight: 1080,
      fps: 30,
      frameToDisplay: frame,
    });
  }
  const { container, act, cleanup } = await render(h(Frame), ui);
  t.after(cleanup);
  assert.match(container.textContent, /Cut one/);
  assert.match(container.textContent, /First caption\./);
  assert.equal(container.querySelector('[data-buffering]'), null);
  await act(async () => show(100));
  assert.equal(container.querySelector('[data-buffering]')?.textContent, 'Loading the next cut…');
  assert.doesNotMatch(container.textContent, /Cut one/);
});

test('a playable video plays live in the isolated frame, gets cut data as blobs, then switches to the saved MP4', async (t) => {
  const requests = [],
    posted = [];
  const fetch = async (url) => {
    requests.push(url);
    if (url.endsWith('/cuts'))
      return {
        ok: true,
        json: async () => ({
          paletteRoles: { winner: 'amber' },
          cuts: [
            {
              engine: 'remotion',
              playable: true,
              code: 'exports.default = () => null;',
              timing: timing(75),
            },
            { engine: 'remotion', playable: false, code: null, timing: null },
          ],
        }),
      };
    return { ok: true, blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }) };
  };
  let set;
  function Card() {
    const [artifact, setArtifact] = useState({
      id: 'v1',
      title: 'Winners',
      description: 'Two winners meet.',
      conversation: 'root',
      status: 'pending',
      phase: 'playable',
      cut: 1,
      cuts: 2,
    });
    set = setArtifact;
    return h(VideoCard, { artifact, inline: true, onAction: async () => {} });
  }
  const { container, act, cleanup } = await render(h(Card), (w) => {
    ui(w);
    w.fetch = fetch;
    globalThis.fetch = fetch;
  });
  const realFetch = globalThis.fetch;
  t.after(async () => {
    await cleanup();
    globalThis.fetch = realFetch;
  });
  const card = container.querySelector('[data-artifact=v1]');
  const frame = card.querySelector('iframe');
  // Opaque origin: scripts only, never same-origin, forms, popups or top navigation.
  assert.deepEqual(
    [frame.getAttribute('src'), frame.getAttribute('sandbox'), frame.title],
    ['/player.html', 'allow-scripts', 'Live video: Winners'],
  );
  assert.equal(card.querySelector('video'), null);
  assert.equal(card.querySelector('[role=status]').textContent, 'Winners: Playing live…');
  frame.contentWindow.postMessage = (data) => posted.push(data);
  await act(async () => frame.dispatchEvent(new window.Event('load')));
  await act(async () => {
    for (let i = 0; i < 20 && !posted.length; i++) await new Promise((r) => setTimeout(r, 5));
  });
  assert.deepEqual(requests, [
    '/api/trees/root/artifacts/v1/cuts',
    '/api/trees/root/artifacts/v1/cuts/0/narration',
  ]);
  assert.equal(posted[0].type, 'cuts');
  assert.deepEqual(posted[0].paletteRoles, { winner: 'amber' });
  assert.ok(posted[0].cuts[0].audio instanceof Blob);
  assert.equal(posted[0].cuts[1].audio, undefined);
  await act(async () => set((a) => ({ ...a, phase: undefined, status: 'ready' })));
  assert.equal(card.querySelector('iframe'), null);
  assert.equal(
    card.querySelector('video').getAttribute('src'),
    '/api/trees/root/artifacts/v1/media',
  );
});

test('the library shows a pending video live, with no file actions until its MP4 is saved', async (t) => {
  const { default: VideoLibrary } = await import('../../src/media/VideoLibrary.tsx');
  const api = async () => [
    {
      id: 'v1',
      title: 'Winners',
      description: 'Two winners meet.',
      duration: null,
      created: 2,
      live: 'root',
    },
  ];
  const { container, act, cleanup } = await render(h(VideoLibrary, { api, activity: '' }), ui);
  t.after(cleanup);
  await act(async () => {});
  const card = container.querySelector('.video-library [data-artifact=v1]');
  assert.equal(card.dataset.live, 'true');
  assert.equal(card.querySelector('iframe').getAttribute('sandbox'), 'allow-scripts');
  assert.equal(card.querySelector('video'), null);
  assert.deepEqual(
    [...card.querySelectorAll('button')].map((b) => b.textContent.trim()),
    [],
  );
});
