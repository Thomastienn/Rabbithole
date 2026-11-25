import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { reflectSvgHidden, stepThrough } from '../../src/media/stepThrough.ts';

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
    calls.splice(0, steps.length); // the measuring pass runs every step once
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
    assert.equal(root.parentElement.getAttribute('role'), 'group');
    assert.deepEqual(
        [...root.parentElement.children],
        [previous, root, next, indicator],
        'Previous and Next flank root',
    );
    assert.deepEqual(
        [previous.getAttribute('aria-label'), next.getAttribute('aria-label')],
        ['Previous', 'Next'],
    );
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

test('keys inside the visual itself do not step', () => {
    const { window, root, indicator, key } = setup();
    const slider = root.appendChild(window.document.createElement('input'));
    const toggle = root.appendChild(window.document.createElement('button'));
    assert.equal(key(slider, 'ArrowRight'), false);
    assert.equal(key(toggle, ' '), false);
    assert.equal(key(toggle, ' ', 'keyup'), false);
    assert.equal(indicator.textContent, 'Step 1 of 3');
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

test('a scene step fades root out, runs its show function, fades back in; controls and focus unchanged', async (t) => {
    const { window } = new JSDOM('<div id="visual"><div id="root"></div></div>');
    window.matchMedia = () => ({ matches: false });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;
    const root = window.document.getElementById('root'),
        calls = [],
        scene = (n) => ({
            scene: true,
            show: (state) => {
                calls.push({ n, ...state });
                root.textContent = `Scene ${n}`;
            },
        });
    stepThrough(root, [scene(0), (state) => calls.push({ n: 1, ...state }), scene(2)]);
    calls.splice(0, 3); // the measuring pass
    const [previous, next] = window.document.querySelectorAll('.tt-steps button');
    const indicator = window.document.querySelector('.tt-steps [aria-live="polite"]');
    assert.deepEqual(calls, [{ n: 0, index: 0, duration: 0 }], 'first render switches instantly');
    assert.equal(root.style.opacity, '');
    next.click();
    next.focus();
    next.click();
    assert.equal(root.style.opacity, '0', 'fading out');
    assert.equal(root.style.transition, 'opacity 150ms');
    assert.equal(calls.length, 2, 'show waits for the fade out');
    assert.equal(indicator.textContent, 'Step 3 of 3');
    assert.ok(next.disabled && !previous.disabled);
    assert.equal(window.document.activeElement, previous, 'focus leaves the disabled Next');
    t.mock.timers.tick(150);
    assert.deepEqual(calls.at(-1), { n: 2, index: 2, duration: 300 });
    assert.equal(root.textContent, 'Scene 2');
    assert.equal(root.style.opacity, '', 'fades back in');
    previous.click();
    previous.click();
    assert.equal(root.style.opacity, '0', 'fading toward scene 0');
    next.click(); // a step during the fade finishes the pending scene first
    assert.deepEqual(
        calls.map((c) => c.n),
        [0, 1, 2, 1, 0, 1],
    );
    assert.equal(root.style.opacity, '');
});

test('a scene step under reduced motion switches instantly', () => {
    const { window } = new JSDOM('<div id="visual"><div id="root"></div></div>');
    window.matchMedia = (query) => ({ matches: query.includes('reduce') });
    const root = window.document.getElementById('root'),
        durations = [],
        scene = { scene: true, show: ({ duration }) => durations.push(duration) };
    const control = stepThrough(root, [scene, scene]);
    durations.splice(0, 2); // the measuring pass
    control.show(1);
    assert.deepEqual(durations, [0, 0]);
    assert.equal(root.style.opacity, '');
});

test('root keeps its tallest step height so the controls and frame never move, and measures again on a width change', () => {
    const { window } = new JSDOM('<div id="visual"><div id="root"></div></div>');
    const root = window.document.getElementById('root'),
        tall = { 'Stage 0': 40, 'Stage 1': 90, 'Stage 2': 60 };
    let width = 300;
    Object.defineProperty(root, 'offsetHeight', {
        get: () => (root.style.minHeight ? 0 : tall[root.textContent]),
    });
    Object.defineProperty(root, 'offsetWidth', { get: () => width });
    root.style.padding = '5px 0';
    const steps = [0, 1, 2].map((n) => () => (root.textContent = `Stage ${n}`));
    stepThrough(root, steps);
    assert.equal(root.style.minHeight, '80px', 'tallest border box less vertical padding');
    assert.equal(root.textContent, 'Stage 0', 'measuring ends back on the first step');
    tall['Stage 2'] = 120;
    window.dispatchEvent(new window.Event('resize'));
    assert.equal(root.style.minHeight, '80px', 'same width: no remeasure');
    width = 200;
    window.dispatchEvent(new window.Event('resize'));
    assert.equal(root.style.minHeight, '110px');
});

test('hidden on an SVG group hides and shows it; HTML keeps native hidden', () => {
    const style = readFileSync('sandbox.html', 'utf8').match(/<style>(.*?)<\/style>/s)[1];
    const { window } = new JSDOM(
        `<style>${style}</style><div id="visual"><p id="p"></p><svg><g id="g"><rect/></g></svg></div>`,
    );
    reflectSvgHidden(window);
    const g = window.document.getElementById('g'),
        p = window.document.getElementById('p');
    g.hidden = true;
    assert.ok(g.hasAttribute('hidden') && g.hidden);
    assert.equal(window.getComputedStyle(g).display, 'none');
    g.hidden = false;
    assert.ok(!g.hasAttribute('hidden') && !g.hidden);
    assert.notEqual(window.getComputedStyle(g).display, 'none');
    p.hidden = true;
    assert.ok(p.hasAttribute('hidden'));
    assert.ok(
        Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'hidden'),
        'native HTML property untouched',
    );
});
