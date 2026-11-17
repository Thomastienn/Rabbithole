import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';
const { default: VideoCard } = await import('../../src/media/VideoCard.tsx');
const { default: VideoLibrary } = await import('../../src/media/VideoLibrary.tsx');

const video = (id, status, extra = {}) => ({
  id,
  title: id,
  description: `${id} description`,
  conversation: 'root',
  status,
  ...extra,
});
const view = (card) => ({
  state: card.dataset.state,
  status: card.querySelector('[role=status]').textContent,
  buttons: [...card.querySelectorAll('button')].map(name),
  video: !!card.querySelector('video'),
});

test('inline recovery states name their action; Retry, Cancel and Open large keep one focused button', async (t) => {
  const calls = [];
  const onAction = async (action) => calls.push(action);
  let set;
  function Stopped() {
    const [artifact, setArtifact] = useState(video('stopped', 'interrupted'));
    set = setArtifact;
    return h(VideoCard, { artifact, inline: true, onAction });
  }
  const { container, act, cleanup } = await render(
    h(
      'div',
      null,
      h(Stopped),
      h(VideoCard, {
        artifact: video('lost', 'ready', { available: false }),
        inline: true,
        onAction,
      }),
    ),
    ui,
  );
  t.after(cleanup);
  const card = (id) => container.querySelector(`[data-artifact=${id}]`);
  assert.deepEqual(view(card('stopped')), {
    state: 'interrupted',
    status: 'stopped: Video generation interrupted when Rabbithole stopped.',
    buttons: ['Retry video'],
    video: false,
  });
  assert.deepEqual(view(card('lost')), {
    state: 'unavailable',
    status: 'lost: Video unavailable: its saved file is missing or unreadable.',
    buttons: ['Regenerate video'],
    video: false,
  });
  await act(async () => button(card('lost'), 'Regenerate video').click());
  const action = card('stopped').querySelector('button');
  action.focus();
  await act(async () => action.click());
  await act(async () => set(video('stopped', 'pending', { phase: 'writing' })));
  assert.equal(view(card('stopped')).status, 'stopped: Writing cuts…');
  assert.equal(action.textContent.trim(), 'Cancel video');
  await act(async () => action.click());
  await act(async () => set(video('stopped', 'canceled')));
  assert.deepEqual(view(card('stopped')), {
    state: 'canceled',
    status: 'stopped: Video generation canceled.',
    buttons: ['Retry video'],
    video: false,
  });
  await act(async () => set(video('stopped', 'ready')));
  assert.equal(action.textContent.trim(), 'Open large');
  assert.equal(document.activeElement, action, 'focus stays on the one action button');
  // Regenerate on an unavailable file is a retry of the saved request.
  assert.deepEqual(calls, ['retry', 'retry', 'cancel']);
  const player = card('stopped').querySelector('video');
  assert.deepEqual(
    [player.controls, player.autoplay, player.getAttribute('preload'), player.getAttribute('src')],
    [true, false, 'metadata', '/api/trees/root/artifacts/stopped/media'],
  );
  assert.equal(player.getAttribute('aria-label'), 'Video: stopped');
  await act(async () =>
    button(card('stopped'), 'Try a different version of video: stopped').click(),
  );
  assert.equal(calls.at(-1), 'regenerate');
});

test('library cards lead with the frame; missing files offer only removal; trash keeps the entry until the server confirms', async (t) => {
  const requests = [];
  let failTrash = true;
  const api = async (path, body) => {
    requests.push(path);
    if (path === '/api/videos')
      return [
        { id: 'kept', title: 'Kept', description: 'A saved video.', duration: 3, created: 1 },
        {
          id: 'gone',
          title: 'Gone',
          description: 'Its file is missing.',
          duration: 3,
          created: 2,
          available: false,
        },
      ];
    if (path.endsWith('/reveal')) return {};
    if (path.endsWith('/trash')) {
      if (failTrash) throw new Error('Nothing was deleted.');
      return { missing: false };
    }
    assert.fail(`unexpected ${path} ${JSON.stringify(body)}`);
  };
  const { container, act, cleanup } = await render(h(VideoLibrary, { api, activity: '' }), ui);
  t.after(cleanup);
  const card = (id) => container.querySelector(`.video-library [data-artifact=${id}]`);
  const kept = card('kept');
  assert.deepEqual(
    [...kept.querySelectorAll('.video-stage, h3, .video-volume-actions')].map((e) =>
      e.tagName === 'H3' ? 'title' : e.classList.contains('video-stage') ? 'frame' : 'actions',
    ),
    ['frame', 'title', 'actions'],
  );
  assert.deepEqual(
    [...kept.querySelectorAll('.video-volume-actions button')].map((b) => b.textContent.trim()),
    ['Open large', 'Show in folder', 'Move to trash'],
  );
  assert.equal(kept.querySelector('video').getAttribute('src'), '/api/videos/kept/media');
  assert.deepEqual(view(card('gone')), {
    state: 'unavailable',
    status: 'Gone: Video unavailable: its saved file is missing or unreadable.',
    buttons: ['Remove “Gone” from Videos'],
    video: false,
  });

  await act(async () => button(kept, 'Show “Kept” in folder').click());
  assert.match(container.textContent, /Opened the folder containing “Kept”\./);

  const dialog = () => document.querySelector('[role=alertdialog]');
  await act(async () => button(kept, 'Move “Kept” to the system trash').click());
  assert.match(dialog().textContent, /Move “Kept” to the trash\?/);
  await act(async () => button(dialog(), 'Move to trash').click());
  assert.match(dialog().textContent, /Nothing was deleted\./, 'failure stays in the open dialog');
  assert.ok(card('kept'), 'failed trash keeps the entry');
  failTrash = false;
  await act(async () => button(dialog(), 'Move to trash').click());
  assert.equal(card('kept'), null);
  assert.match(container.textContent, /Moved “Kept” to the system trash\./);
  assert.deepEqual(requests, [
    '/api/videos',
    '/api/videos/kept/reveal',
    '/api/videos/kept/trash',
    '/api/videos/kept/trash',
  ]);
});

test('a pending video lists a row per cut and the set pieces being drawn in a polite live region', async (t) => {
  const { container, cleanup } = await render(
    h(VideoCard, {
      artifact: video('rows', 'pending', {
        phase: 'pieces',
        cutRows: [
          { cut: 1, title: 'Meet the winner', state: 'ready' },
          { cut: 2, title: 'Race again', state: 'repairing' },
        ],
        drawing: { drawing: ['Track'], drawn: 1, total: 2 },
      }),
      inline: true,
    }),
    ui,
  );
  t.after(cleanup);
  const list = container.querySelector('.video-cut-rows');
  assert.equal(list.getAttribute('aria-live'), 'polite');
  assert.deepEqual(
    [...list.querySelectorAll('li')].map((li) => li.textContent),
    ['Set pieces: 1 of 2 drawnDrawing Track', '1. Meet the winnerReady', '2. Race againRepairing'],
  );
});
