import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { stepThrough } from '../../src/media/stepThrough.ts';

const setup = (reduce = false) => {
  const { window } = new JSDOM('<div id="visual"><div id="root"></div></div>');
  window.matchMedia = (query) => ({ matches: reduce && query.includes('reduce') });
  const root = window.document.getElementById('root'),
    calls = [],
    steps = [0, 1, 2].map((n) => (state) => {
      calls.push({ n, ...state });
      root.textContent = `Stage ${n}`;
    });
  const control = stepThrough(root, steps);
  const [previous, next] = window.document.querySelectorAll('.tt-steps button');
  const indicator = window.document.querySelector('.tt-steps [aria-live="polite"]');
  const key = (target, k, type = 'keydown') => {
    const event = new window.KeyboardEvent(type, { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { window, root, calls, previous, next, indicator, key, control };
};

test('steps run in order with Previous, Next and a Step n of m indicator, bounded at both ends', () => {
  const { root, calls, previous, next, indicator } = setup();
  assert.equal(root.nextElementSibling.getAttribute('role'), 'group');
  assert.deepEqual([previous.textContent, next.textContent], ['Previous', 'Next']);
  assert.equal(previous.type, 'button');
  assert.deepEqual(calls, [{ n: 0, index: 0, duration: 0 }], 'first render does not animate');
  assert.equal(indicator.textContent, 'Step 1 of 3');
  assert.ok(previous.disabled && !next.disabled);
  next.click();
  next.click();
  assert.deepEqual(
    calls.map((c) => c.n),
    [0, 1, 2],
  );
  assert.equal(calls[1].duration, 300);
  assert.equal(root.style.getPropertyValue('--step-duration'), '300ms');
  assert.equal(root.textContent, 'Stage 2');
  assert.equal(indicator.textContent, 'Step 3 of 3');
  assert.ok(next.disabled && !previous.disabled);
  next.click(); // disabled: no-op
  assert.equal(calls.length, 3);
  previous.click();
  assert.equal(indicator.textContent, 'Step 2 of 3');
  assert.equal(root.textContent, 'Stage 1');
});

test('Enter, Space and arrow keys step once each and keep focus on an enabled control', () => {
  const { window, calls, previous, next, indicator, key } = setup();
  next.focus();
  assert.equal(key(next, 'Enter'), true, 'native click suppressed');
  assert.equal(indicator.textContent, 'Step 2 of 3');
  assert.equal(key(next, ' '), true);
  assert.equal(key(next, ' ', 'keyup'), true);
  assert.equal(indicator.textContent, 'Step 3 of 3');
  assert.equal(window.document.activeElement, previous, 'focus leaves the disabled Next');
  key(previous, 'ArrowLeft');
  key(previous, 'ArrowUp');
  assert.equal(indicator.textContent, 'Step 1 of 3');
  assert.equal(window.document.activeElement, next);
  key(next, 'ArrowRight');
  key(next, 'ArrowDown');
  assert.equal(indicator.textContent, 'Step 3 of 3');
  key(previous, 'ArrowRight'); // bounded
  assert.equal(key(previous, 'Tab'), false, 'other keys pass through');
  assert.deepEqual(
    calls.map((c) => c.n),
    [0, 1, 2, 1, 0, 1, 2, 2],
  );
});

test('reduced motion switches steps without transitions', () => {
  const { root, calls, next, control } = setup(true);
  next.click();
  control.show(0);
  assert.deepEqual(
    calls.map((c) => c.duration),
    [0, 0, 0],
  );
  assert.equal(root.style.getPropertyValue('--step-duration'), '0ms');
});

test('the frame installs the helper as a global before fragments render, with no messaging', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(
    readFileSync('src/media/sandbox.ts', 'utf8'),
    /Object\.assign\(window, \{[^}]*stepThrough/,
  );
  assert.doesNotMatch(
    readFileSync('src/media/stepThrough.ts', 'utf8'),
    /postMessage|fetch|XMLHttpRequest|WebSocket|parent\./,
  );
});
