import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { reflectSvgHidden, stepThrough } from '../../src/media/stepThrough.ts';

const setup = (reduce = false, t) => {
    const { window } = new JSDOM('<div id="visual"><div id="root"></div></div>');
    window.matchMedia = (query) => ({ matches: reduce && query.includes('reduce') });
    let seen;
    if (t) {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        window.setTimeout = setTimeout;
        window.clearTimeout = clearTimeout;
        window.IntersectionObserver = class {
            constructor(callback) {
                seen = (isIntersecting) => callback([{ isIntersecting }]);
            }
            observe() {}
        };
    }
    const root = window.document.getElementById('root'),
        picture = root.appendChild(window.document.createTextNode('')),
        calls = [],
        steps = [0, 1, 2].map((n) => (state) => {
            calls.push({ n, ...state });
            picture.data = `Stage ${n}`;
            root.toggleAttribute('data-end', n === 2);
        });
    const control = stepThrough(root, steps);
    calls.splice(0, steps.length); // the measuring pass runs every step once
    const [previous, next, play] = window.document.querySelectorAll('.tt-steps button');
    const indicator = window.document.querySelector('.tt-steps [aria-live="polite"]');
    const key = (target, k, type = 'keydown', repeat = false) => {
        const event = new window.KeyboardEvent(type, {
            key: k,
            repeat,
            bubbles: true,
            cancelable: true,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
    };
    return { window, root, calls, previous, next, play, indicator, key, control, seen };
};

test('steps run in order with Previous, Next and a Step n of m indicator, bounded at both ends', () => {
    const { root, calls, previous, next, indicator } = setup();
    assert.deepEqual(calls, [{ n: 0, index: 0, duration: 0 }], 'first render does not animate');
    assert.equal(indicator.textContent, 'Step 1 of 3');
    assert.ok(previous.disabled && !next.disabled);
    next.click();
    next.click();
    assert.deepEqual(
        calls.map((c) => c.n),
        [0, 1, 2],
    );
    assert.equal(calls[1].duration, 600);
    assert.equal(root.style.getPropertyValue('--step-duration'), '600ms');
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

test('Play advances on its own only after a click, slower than by hand, and stops on the last step', (t) => {
    const { calls, next, play, indicator } = setup(false, t);
    const idleName = play.getAttribute('aria-label');
    t.mock.timers.tick(10000);
    assert.deepEqual(calls, [{ n: 0, index: 0, duration: 0 }], 'nothing moves before Play');
    play.click();
    assert.notEqual(play.getAttribute('aria-label'), idleName);
    assert.equal(indicator.textContent, 'Step 2 of 3', 'Play moves at once');
    const motion = calls.at(-1).duration;
    assert.ok(motion >= 1500 && motion <= 2500, `Play motion ${motion}ms`);
    t.mock.timers.tick(motion + 999);
    assert.equal(indicator.textContent, 'Step 2 of 3', 'holds after the motion');
    t.mock.timers.tick(1);
    assert.equal(indicator.textContent, 'Step 3 of 3');
    assert.ok(calls.at(-1).duration > motion, 'a step with more changes gets more time');
    assert.equal(play.getAttribute('aria-label'), idleName, 'stops on the last step');
    t.mock.timers.tick(10000);
    assert.equal(calls.length, 3);
    play.click();
    assert.equal(indicator.textContent, 'Step 1 of 3', 'Play again starts from the first');
    play.click();
    next.click();
    assert.equal(calls.at(-1).duration, 600, 'by hand stays quick');
});

test('Pause, Previous, Next and step keys stop Play', (t) => {
    const { window, root, calls, previous, next, play, key, control } = setup(false, t);
    const idleName = play.getAttribute('aria-label');
    const stopsPlay = (stop, stage) => {
        control.show(0, false);
        play.click();
        assert.notEqual(play.getAttribute('aria-label'), idleName, 'the visual is playing');
        stop();
        assert.equal(root.textContent, `Stage ${stage}`);
        const count = calls.length;
        t.mock.timers.tick(10000);
        assert.equal(calls.length, count);
        assert.equal(play.getAttribute('aria-label'), idleName);
    };
    stopsPlay(() => play.click(), 1);
    stopsPlay(() => previous.click(), 0);
    stopsPlay(() => next.click(), 2);
    stopsPlay(() => key(play, 'ArrowLeft'), 0);
    stopsPlay(() => key(play, ' '), 1);
    stopsPlay(() => key(next, 'Enter'), 2);
    stopsPlay(() => control.show(0, false), 0);
    assert.equal(calls.at(-1).duration, 0, 'an instant jump gets zero motion');
    assert.equal(root.style.getPropertyValue('--step-duration'), '0ms');
    stopsPlay(
        () => root.parentElement.dispatchEvent(new window.CustomEvent('tt-show', { detail: 2 })),
        2,
    );
});

test('holding Enter on Play triggers only one action per press', (t) => {
    const { root, play, key } = setup(false, t);
    key(play, 'Enter');
    key(play, 'Enter', 'keydown', true);
    t.mock.timers.tick(10000);
    assert.equal(root.textContent, 'Stage 2', 'holding the start key keeps Play running');
    key(play, 'Enter');
    key(play, 'Enter');
    key(play, 'Enter', 'keydown', true);
    t.mock.timers.tick(10000);
    assert.equal(root.textContent, 'Stage 0', 'holding the pause key keeps the visual paused');
});

test('Play under reduced motion switches instantly but still holds each step', (t) => {
    const { calls, play, indicator, next, control } = setup(true, t);
    play.click();
    t.mock.timers.tick(1600 + 1000 - 1);
    assert.equal(indicator.textContent, 'Step 2 of 3', 'holds the full step time');
    t.mock.timers.tick(1);
    assert.equal(indicator.textContent, 'Step 3 of 3');
    assert.deepEqual(
        calls.map((c) => c.duration),
        [0, 0, 0],
    );
    control.show(0, false);
    next.click();
    assert.equal(calls.at(-1).duration, 0, 'manual navigation also respects reduced motion');
});

test('Play pauses when the visual leaves the view or the page is hidden', (t) => {
    const { window, root, calls, play, seen, control } = setup(false, t);
    const staysOnCurrentStep = () => {
        const count = calls.length;
        t.mock.timers.tick(10000);
        assert.equal(calls.length, count);
    };
    seen(true);
    staysOnCurrentStep();
    assert.equal(root.textContent, 'Stage 0', 'coming into view never starts Play');
    play.click();
    seen(false);
    staysOnCurrentStep();
    seen(true);
    staysOnCurrentStep();
    control.show(0, false);
    play.click();
    Object.defineProperty(window.document, 'hidden', { value: true });
    window.document.dispatchEvent(new window.Event('visibilitychange'));
    staysOnCurrentStep();
});

test('a scene step crossfades from a still copy of the old scene; controls and focus unchanged', async (t) => {
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
                root.innerHTML = `<b data-part="Scene">Scene ${n}</b>`;
            },
        });
    stepThrough(root, [scene(0), (state) => calls.push({ n: 1, ...state }), scene(2)]);
    calls.splice(0, 3); // the measuring pass
    const [previous, next] = window.document.querySelectorAll('.tt-steps button');
    const indicator = window.document.querySelector('.tt-steps [aria-live="polite"]');
    const still = () => window.document.querySelector('.tt-steps > [inert]');
    assert.deepEqual(calls, [{ n: 0, index: 0, duration: 0 }], 'first render switches instantly');
    assert.equal(still(), null);
    next.click();
    next.focus();
    next.click();
    assert.deepEqual(calls.at(-1), { n: 2, index: 2, duration: 600 }, 'show redraws at once');
    assert.equal(root.textContent, 'Scene 2');
    assert.equal(still().textContent, 'Scene 0', 'the old scene stays on screen');
    assert.equal(still().getAttribute('aria-hidden'), 'true');
    assert.equal(still().querySelector('[data-part]'), null, 'the copy is never picked');
    assert.equal(still().style.opacity, '0', 'the old scene fades out');
    assert.equal(still().style.transition, 'opacity 600ms');
    assert.equal(root.style.opacity, '', 'as the new one fades in');
    assert.equal(root.style.transition, 'opacity 600ms');
    assert.equal(indicator.textContent, 'Step 3 of 3');
    assert.ok(next.disabled && !previous.disabled);
    assert.equal(window.document.activeElement, previous, 'focus leaves the disabled Next');
    t.mock.timers.tick(600);
    assert.equal(still(), null, 'the copy goes once the fade ends');
    previous.click();
    previous.click();
    assert.equal(still().textContent, 'Scene 2', 'fading toward scene 0');
    next.click(); // a step during the fade finishes the pending scene first
    assert.equal(still(), null);
    assert.deepEqual(
        calls.map((c) => c.n),
        [0, 1, 2, 1, 0, 1],
    );
    assert.equal(root.style.opacity, '');
});

const pulsing = (reduce, t) => {
    const { window } = new JSDOM(
        '<div id="visual"><div id="root"><div data-part="Ball"><span>0</span></div><div data-part="Wall"></div><p>Caption</p></div></div>',
    );
    window.matchMedia = (query) => ({ matches: reduce && query.includes('reduce') });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;
    window.Element.prototype.getBoundingClientRect = function () {
        const left = this.dataset?.part === 'Ball' ? 10 : 0;
        return { left, top: 20, width: 30, height: 40, right: left + 30, bottom: 60 };
    };
    const root = window.document.getElementById('root'),
        span = root.querySelector('span'),
        caption = root.querySelector('p');
    stepThrough(
        root,
        [0, 1, 2].map((n) => () => (span.textContent = String(n))),
    );
    const [, next] = window.document.querySelectorAll('.tt-steps button');
    return {
        window,
        root,
        next,
        caption,
        rings: () => window.document.querySelectorAll('.tt-pulse'),
    };
};

test('after a continuing step settles, the visual part holding each change is outlined briefly', (t) => {
    const { next, caption, rings } = pulsing(false, t);
    assert.equal(rings().length, 0, 'first render pulses nothing');
    next.click();
    assert.equal(rings().length, 0, 'waits for the motion');
    t.mock.timers.tick(600);
    assert.equal(rings().length, 1, 'only the changed part, not the untouched one');
    assert.equal(rings()[0].style.left, '10px', 'over the Ball part');
    assert.equal(rings()[0].getAttribute('aria-hidden'), 'true');
    t.mock.timers.tick(900);
    assert.equal(rings().length, 0, 'the outline goes');
    next.click();
    caption.textContent = 'Caption 2'; // a change without a part outlines the element itself
    t.mock.timers.tick(600);
    assert.equal(rings().length, 2);
    next.click(); // bounded: no step, no pulse
    t.mock.timers.tick(5000);
    assert.equal(rings().length, 0);
});

test('a step interrupted before it settles pulses nothing', (t) => {
    const { next, rings } = pulsing(false, t);
    next.click();
    t.mock.timers.tick(300);
    next.click();
    t.mock.timers.tick(599);
    assert.equal(rings().length, 0);
    t.mock.timers.tick(1);
    assert.equal(rings().length, 1, 'only the last step pulses');
});

test('under reduced motion nothing pulses', (t) => {
    const { next, rings } = pulsing(true, t);
    next.click();
    t.mock.timers.tick(5000);
    assert.equal(rings().length, 0);
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
    assert.equal(window.document.querySelector('[inert]'), null, 'no still copy fades');
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

test('hidden on an SVG group hides and shows it; HTML keeps native hidden', async (t) => {
    const { window } = await JSDOM.fromFile('sandbox.html');
    t.after(() => window.close());
    window.document.getElementById('visual').innerHTML =
        '<p id="p"></p><svg><g id="g"><rect/></g></svg>';
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
