import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('the sandbox exposes bundled GSAP core, and a gsap visual animates from the bundle', async () => {
  const sandbox = readFileSync(new URL('../../src/media/sandbox.ts', import.meta.url), 'utf8');
  assert.match(sandbox, /^import \{ gsap \} from 'gsap';$/m, 'bundled by Vite, not fetched');
  assert.match(sandbox, /Object\.assign\(window, \{[^}]*\bgsap,/);
  assert.doesNotMatch(sandbox, /registerPlugin|gsap\/[A-Z]/, 'core only, no plugins');

  const { window } = new JSDOM('<div id="visual"><div class="box"></div></div>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  // GSAP reads the browser globals the sandbox frame has.
  for (const key of [
    'document',

    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ])
    globalThis[key] = window[key].bind?.(window) ?? window[key];
  globalThis.window = window;
  const { gsap } = await import('gsap');
  try {
    window.gsap = gsap;
    window.eval(`
      const box = document.querySelector('#visual .box');
      const tl = gsap.timeline({ paused: true, defaults: { duration: 1, ease: 'power2.out' } });
      tl.to(box, { x: 100 }).to(box, { autoAlpha: 0 }, '<0.5');
      tl.progress(1);`);
    const box = window.document.querySelector('.box');
    assert.equal(box.style.transform, 'translate(100px, 0px)');
    assert.equal(box.style.visibility, 'hidden');
  } finally {
    gsap.ticker.sleep();
    window.close();
  }
});
