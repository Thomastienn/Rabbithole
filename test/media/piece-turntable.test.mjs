import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';

test('the player turns a 3D piece slowly and a drag orbits it', async (t) => {
  const dom = await render(h('div'), ui);
  t.after(dom.cleanup);
  const { createRoot, advance, act, extend } = await import('@react-three/fiber');
  // Canvas registers the three.js classes itself; a bare root needs them registered.
  extend(await import('three'));
  const { Spin, orbit, SPIN } = await import('../../src/media/turntable.tsx');
  const stub = {
    render() {},
    setSize() {},
    setPixelRatio() {},
    getPixelRatio: () => 1,
    shadowMap: {},
    xr: { addEventListener() {}, removeEventListener() {}, setAnimationLoop() {} },
    domElement: document.createElement('canvas'),
  };
  const root = createRoot(stub.domElement);
  await root.configure({
    gl: stub,
    frameloop: 'never',
    size: { width: 160, height: 90, top: 0, left: 0 },
  });
  const motion = { orbit: { yaw: 0, pitch: 0 }, still: false };
  let piece;
  function Piece() {
    return h('mesh', { ref: (m) => (piece = m) });
  }
  await act(async () => root.render(h(Spin, { motion }, h(Piece))));
  t.after(() => root.unmount());
  advance(0);
  advance(1);
  assert.ok(Math.abs(piece.parent.rotation.y - SPIN) < 1e-6, 'one second turns it by SPIN');
  assert.ok(SPIN > 0 && SPIN < 0.5, 'slowly: a turn takes over 12 s');
  motion.drag = { x: 0, y: 0 };
  advance(2);
  assert.ok(Math.abs(piece.parent.rotation.y - SPIN) < 1e-6, 'holding a drag stops the spin');
  motion.orbit = orbit(motion.orbit, { dx: 100, dy: 50 });
  advance(2.001);
  assert.ok(Math.abs(piece.parent.rotation.y - (SPIN + 1)) < 1e-6, 'dragging sideways turns it');
  assert.ok(Math.abs(piece.parent.rotation.x - 0.5) < 1e-6, 'dragging up or down tilts it');
  assert.equal(orbit({ yaw: 0, pitch: 0 }, { dy: 1e4 }).pitch, 1.2, 'never past the pole');
  assert.equal(
    orbit({ yaw: 1, pitch: 0 }, { dt: 5, still: true }).yaw,
    1,
    'reduced motion stays still',
  );
});
