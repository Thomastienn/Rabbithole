import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
const { StockPiece, setStock, palette } = await import('../../server/media/video-kit.tsx');

test('video stock placement shows delivered SVG with original colours, optional tint, and a missing-piece note', async (t) => {
  const id = 'fluent-emoji:horse';
  setStock({
    [id]: {
      svg: '<svg width="32" height="32" viewBox="0 0 32 32"><path fill="#8B5E3C" stroke="none" d="M0 0h32v32H0z"/></svg>',
    },
  });
  let change;
  function Host() {
    const [props, set] = useState({ id, x: 500, y: 400, scale: 2 });
    change = set;
    return h(StockPiece, props);
  }
  const { container, act, cleanup } = await render(h(Host), (w) => {
    // Remotion was imported before jsdom created its window.
    w.remotion_delayRenderHandles = [];
    w.remotion_delayRenderTimeouts = {};
  });
  t.after(async () => {
    await cleanup();
    setStock({});
  });
  assert.equal(container.querySelector('path').getAttribute('fill'), '#8B5E3C');
  assert.equal(container.querySelector('svg').getAttribute('width'), '100%');
  assert.equal(container.firstChild.style.width, '400px');
  assert.equal(container.firstChild.style.left, '300px');
  assert.equal(container.firstChild.style.top, '200px');
  await act(async () => change((p) => ({ ...p, tint: palette.leaf })));
  assert.equal(container.querySelector('path').getAttribute('fill'), palette.leaf);
  assert.equal(container.querySelector('path').getAttribute('stroke'), 'none');
  await act(async () => change((p) => ({ ...p, id: 'missing-123456' })));
  assert.equal(
    container.querySelector('[role=status]').textContent,
    'Stock piece missing-123456 is missing',
  );
  assert.equal(container.querySelector('img,iframe,script'), null);
  setStock({ broken: { glb: btoa('corrupt model') } });
  await act(async () => change((p) => ({ ...p, id: 'broken' })));
  assert.equal(
    container.querySelector('[role=status]').textContent,
    'Stock piece broken failed to load',
  );
});
