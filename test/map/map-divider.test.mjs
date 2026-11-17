import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
const { default: MapDivider } = await import('../../src/map/MapDivider.tsx');

test('map divider is a focusable vertical separator; keys and double-click resize within bounds', async (t) => {
  const widths = [];
  function Fixture() {
    const [width, set] = useState(27.5);
    widths.push(width);
    return h(MapDivider, {
      width,
      workspaceWidth: 80,
      workspace: { current: null },
      setWidth: set,
    });
  }
  const { container, act, cleanup } = await render(h(Fixture));
  t.after(cleanup);
  const seam = container.querySelector('[role=separator]');
  const aria = () =>
    [
      'tabindex',
      'aria-orientation',
      'aria-controls',
      'aria-valuemin',
      'aria-valuemax',
      'aria-valuenow',
      'aria-valuetext',
    ].map((a) => seam.getAttribute(a));
  assert.ok(seam.getAttribute('aria-label'), 'named for assistive tech');
  assert.deepEqual(aria(), [
    '0',
    'vertical',
    'learning-tree-map',
    '20',
    '48',
    '28',
    'Map width 28 rem',
  ]);
  const press = (key, shiftKey = false) =>
    act(async () =>
      seam.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })),
    );
  await press('ArrowLeft');
  await press('ArrowLeft', true);
  assert.equal(seam.getAttribute('aria-valuenow'), '33', 'ArrowLeft +1, Shift +4');
  await press('ArrowRight');
  assert.equal(seam.getAttribute('aria-valuenow'), '32');
  await press('End');
  assert.equal(seam.getAttribute('aria-valuenow'), '48', 'End: 60% of the workspace');
  await press('Home');
  assert.equal(seam.getAttribute('aria-valuenow'), '20');
  await act(async () => seam.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  assert.equal(
    seam.getAttribute('aria-valuetext'),
    'Map width 28 rem',
    'double-click resets to 27.5rem',
  );
  assert.equal(widths.at(-1), 27.5);
});
