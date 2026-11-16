import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { default: VideoLibrary } = await import('../../src/media/VideoLibrary.tsx');

const tab = (c, value) => c.querySelector(`[role=tab][data-tab-value=${value}]`);
const settle = (act) => act(async () => new Promise((r) => setTimeout(r, 5)));

test('the Pieces tab shows an empty state when the library is empty', async (t) => {
  const api = async (path) =>
    path === '/api/videos' ? [] : path === '/api/pieces' ? [] : assert.fail(path);
  const { container, act, cleanup } = await render(h(VideoLibrary, { api, activity: '' }), ui);
  t.after(cleanup);
  await act(async () => tab(container, 'pieces').click());
  await settle(act);
  assert.equal(tab(container, 'pieces').getAttribute('aria-selected'), 'true');
  assert.match(container.querySelector('#pieces-panel').textContent, /No saved pieces yet/);
  assert.equal(container.querySelector('#refresh-videos'), null);
});

test('the Pieces tab lists pieces and opens a read-only source with a preview in the isolated player frame', async (t) => {
  const calls = [];
  const piece = {
    id: 'p1',
    name: 'Winner',
    look: 'A gold trophy 200 px tall',
    improved: Date.UTC(2026, 10, 15, 12),
    videos: [{ id: 'v1', title: 'Elections' }],
  };
  const api = async (path, body) => {
    calls.push([path, body]);
    if (path === '/api/videos') return [];
    if (path === '/api/pieces') return [piece, { ...piece, id: 'p2', name: 'Loser', videos: [] }];
    if (path === '/api/pieces/p1')
      return {
        ...piece,
        roles: ['winner', 'loser'],
        source: 'export function Winner() {}',
        code: 'exports.Winner = 1',
      };
    assert.fail(path);
  };
  const { container, act, cleanup } = await render(h(VideoLibrary, { api, activity: '' }), ui);
  t.after(cleanup);
  await act(async () => tab(container, 'pieces').click());
  await settle(act);
  const cards = [...container.querySelectorAll('.piece-library h3')].map((e) =>
    e.closest('.piece-library > *'),
  );
  assert.deepEqual(
    cards.map((c) => c.querySelector('h3').textContent),
    ['Winner', 'Loser'],
  );
  assert.match(cards[0].textContent, /A gold trophy 200 px tall/);
  assert.match(cards[0].textContent, /Used in Elections/);
  assert.match(cards[0].textContent, /Last improved .*2026/);
  assert.match(cards[1].textContent, /Not in a saved video/);
  assert.equal(
    container.querySelector('#pieces-panel').textContent.match(/Delete|Edit|trash/i),
    null,
  );

  await act(async () => container.querySelector('[aria-label="Open Winner"]').click());
  await settle(act);
  const frame = container.querySelector('iframe');
  assert.deepEqual(
    [frame.getAttribute('src'), frame.getAttribute('sandbox'), frame.title],
    ['/player.html', 'allow-scripts', 'Preview: Winner'],
  );
  const posted = [];
  frame.contentWindow.postMessage = (data) => posted.push(data);
  await act(async () => frame.dispatchEvent(new window.Event('load')));
  assert.deepEqual(posted, [
    {
      type: 'piece',
      code: 'exports.Winner = 1',
      name: 'Winner',
      paletteRoles: { winner: 'amber', loser: 'leaf' },
    },
  ]);
  const source = container.querySelector('pre');
  assert.match(source.textContent, /export function Winner\(\) \{\}/);
  assert.equal(
    container.querySelector('textarea, [contenteditable=true]'),
    null,
    'source is read-only',
  );
  assert.match(container.textContent, /Source \(read-only\)/);
  assert.ok(
    calls.every(([, body]) => body === undefined),
    'only reads, no writes',
  );
});
