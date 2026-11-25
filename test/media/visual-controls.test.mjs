import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { defineControls } from '../../src/media/visualControls.ts';
import { renderVisual } from '../../src/media/visualMarkup.ts';
import { stepThrough } from '../../src/media/stepThrough.ts';
import { trackPointerHandlers, watchParts } from '../../src/media/visualParts.ts';

const PENDULUM = `<div id="art" data-part="Pendulum"><svg><circle id="bob"></circle></svg>
<rh-slider label="Length" min="0.2" max="2" step="0.1" unit="m" value="1"></rh-slider>
<rh-number label="Mass" min="0" max="10" step="0.5" unit="kg" value="2.5"></rh-number>
<rh-choice label="Gravity" options="Earth, Moon, Mars" value="Moon"></rh-choice>
<rh-choice label="Planet" options="Mercury,Venus,Earth,Mars,Jupiter,Saturn"></rh-choice>
<rh-toggle label="Friction"></rh-toggle>
<rh-switch label="Show arc" checked></rh-switch>
<rh-text label="Word" placeholder="e.g. hello"></rh-text>
<rh-button-group><rh-button label="Check" variant="primary"></rh-button><rh-reset label="Restore defaults"></rh-reset></rh-button-group>
</div>`;

function visual() {
    const { window } = new JSDOM('<div id="visual"></div>', { pretendToBeVisual: true });
    trackPointerHandlers(window);
    defineControls(window);
    const root = window.document.getElementById('visual');
    renderVisual(root, PENDULUM, true);
    const $ = (s) => root.querySelector(s),
        events = [];
    for (const type of ['input', 'change', 'reset'])
        window.addEventListener(type, (e) =>
            events.push(
                `${type}:${e.target.closest('[label]')?.getAttribute('label') ?? e.target.id}`,
            ),
        );
    const nameOf = (e) =>
        e.getAttribute('aria-label') ?? e.labels?.[0]?.textContent ?? e.textContent;
    return { window, root, $, events, nameOf };
}

test('each control renders native, focusable elements named by its label and reports its value', () => {
    const { window, $, nameOf } = visual();
    const focusable = (e, name) => {
        e.focus();
        assert.ok(window.document.activeElement === e, `${name} takes keyboard focus`);
        assert.equal(nameOf(e).trim(), name);
    };
    focusable($('rh-slider input[type=range]'), 'Length');
    assert.equal($('rh-slider').value, 1);
    assert.equal($('rh-slider output').textContent, '1 m');
    focusable($('rh-number input[type=number]'), 'Mass');
    focusable($('rh-number button'), 'Decrease Mass');
    assert.equal($('rh-number').value, 2.5);
    assert.equal($('rh-choice legend').textContent, 'Gravity');
    assert.equal($('rh-choice').value, 'Moon');
    focusable($('rh-choice[label=Gravity] input:checked'), 'Moon');
    focusable($('rh-choice[label=Planet] input:checked'), 'Mercury');
    assert.equal($('rh-choice[label=Planet]').value, 'Mercury');
    focusable($('rh-toggle button'), 'Friction');
    assert.equal($('rh-toggle').value, false);
    focusable($('rh-switch input[role=switch]'), 'Show arc');
    assert.equal($('rh-switch').value, true);
    focusable($('rh-text input'), 'Word');
    assert.equal($('rh-text').value, '');
    focusable($('rh-button button'), 'Check');
    focusable($('rh-reset button'), 'Restore defaults');
});

test('changing a control updates its value and fires input and change from it', () => {
    const { window, $, events } = visual();
    const slider = $('rh-slider input');
    slider.value = '1.5';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal($('rh-slider').value, 1.5);
    assert.equal($('rh-slider output').textContent, '1.5 m', 'shows the value it moved to');
    $('rh-number button[aria-label="Increase Mass"]').click();
    assert.equal($('rh-number').value, 3);
    const typed = $('rh-number input');
    typed.value = '99';
    typed.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal($('rh-number').value, 10, 'a typed value clamps to max');
    [...window.document.querySelectorAll('rh-choice[label=Gravity] input')].at(-1).click();
    assert.equal($('rh-choice').value, 'Mars');
    $('rh-toggle button').click();
    assert.equal($('rh-toggle').value, true);
    assert.equal($('rh-toggle button').getAttribute('aria-pressed'), 'true');
    $('rh-switch input').click();
    assert.equal($('rh-switch').value, false);
    const text = $('rh-text input');
    text.value = 'cab';
    text.dispatchEvent(new window.Event('input', { bubbles: true }));
    text.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal($('rh-text').value, 'cab');
    let clicked = false;
    $('rh-button').addEventListener('click', () => (clicked = true));
    $('rh-button button').click();
    assert.ok(clicked);
    assert.deepEqual(events, [
        'input:Length',
        'change:Length',
        'input:Mass',
        'change:Mass',
        'change:Mass',
        'input:Gravity',
        'change:Gravity',
        'input:Friction',
        'change:Friction',
        'input:Show arc',
        'change:Show arc',
        'input:Word',
        'change:Word',
    ]);
    $('rh-slider').value = 0.4;
    assert.equal($('rh-slider output').textContent, '0.4 m', 'script sets value too');
});

test('the slider displays fractional values and the number stepper respects its range', () => {
    const { root, $ } = visual();
    renderVisual(
        root,
        `<rh-slider label="Ratio" min="0" max="1" step="any" value="0.25"></rh-slider>
         <rh-number label="Offset" min="0.25" max="0.95" step="0.5" value="0.25"></rh-number>`,
        true,
    );
    assert.equal($('rh-slider').value, 0.25);
    assert.equal($('rh-slider output').textContent, '0.25');
    assert.equal($('rh-number').value, 0.25);
    $('rh-number button:last-child').click();
    assert.equal($('rh-number').value, 0.75);
    $('rh-number').value = 1.2;
    assert.equal($('rh-number').value, 0.95);
});

test('a disabled control disables its native elements', () => {
    const { $ } = visual();
    $('rh-number').setAttribute('disabled', '');
    assert.ok([...$('rh-number').querySelectorAll('button, input')].every((e) => e.disabled));
    $('rh-number').removeAttribute('disabled');
    assert.ok(!$('rh-number input').disabled);
    $('rh-choice').setAttribute('disabled', '');
    $('rh-choice input').click();
    assert.equal($('rh-choice').value, 'Moon');
});

test('controls keep their values across a theme change and a step-through wrap, and never pick', () => {
    const { window, root, $ } = visual();
    $('rh-toggle button').click();
    $('rh-text input').value = 'cab';
    window.dispatchEvent(new window.Event('rabbithole-theme'));
    stepThrough($('#art'), [() => {}, () => {}]); // moves the visual, reconnecting every control
    assert.equal($('rh-toggle').value, true);
    assert.equal($('rh-text').value, 'cab');
    assert.equal(root.querySelectorAll('rh-slider input').length, 1, 'not rendered twice');

    window.Element.prototype.getBoundingClientRect = () => ({
        left: 10,
        top: 10,
        right: 110,
        bottom: 50,
        width: 100,
        height: 40,
    });
    const posted = [];
    watchParts(window, root, (m) => posted.push(m));
    const at = (e, type) => e.dispatchEvent(new window.MouseEvent(type, { bubbles: true }));
    at($('#bob'), 'pointermove');
    assert.equal(posted.pop().type, 'part', 'the drawing is a part');
    for (const e of [
        $('rh-slider output'),
        $('rh-slider'),
        $('rh-choice .seg'),
        $('rh-button-group'),
    ]) {
        at(e, 'pointermove');
        at(e, 'click');
        assert.ok(
            posted.every((m) => m.type === 'leave'),
            `${e.localName} never picks`,
        );
        posted.length = 0;
        at($('#bob'), 'pointermove');
        posted.length = 0;
    }
});

test('reset restores every control and fires reset on the root', () => {
    const { root, $, events } = visual();
    $('rh-slider').value = 2;
    $('rh-number button[aria-label="Decrease Mass"]').click();
    $('rh-choice[label=Gravity] input').click();
    $('rh-choice[label=Planet] input[value=Earth]').click();
    $('rh-toggle button').click();
    $('rh-switch input').click();
    $('rh-text input').value = 'cab';
    let reached;
    root.addEventListener('reset', (e) => (reached = e.target));
    events.length = 0;
    $('rh-reset button').click();
    assert.ok(reached === root, 'fired on the root');
    assert.deepEqual(events, ['reset:visual'], 'one reset, no per-control events');
    assert.deepEqual(
        [...root.querySelectorAll('[label]')]
            .filter((e) => e.value !== undefined)
            .map((e) => [e.getAttribute('label'), e.value]),
        [
            ['Length', 1],
            ['Mass', 2.5],
            ['Gravity', 'Moon'],
            ['Planet', 'Mercury'],
            ['Friction', false],
            ['Show arc', true],
            ['Word', ''],
        ],
    );
    assert.equal($('rh-slider output').textContent, '1 m');
});

test('reset restores the value a script set before connecting a control', () => {
    const { window, root, $ } = visual();
    const slider = window.document.createElement('rh-slider');
    slider.setAttribute('label', 'Angle');
    slider.value = 30;
    root.append(slider);
    assert.equal(slider.value, 30);
    assert.equal(slider.querySelector('label').textContent, 'Angle');
    slider.value = 60;
    $('rh-reset button').click();
    assert.equal(slider.value, 30);
});

test('display controls show their values in named status regions and a readout follows its value', () => {
    const { root, $ } = visual();
    renderVisual(
        root,
        `<div id="art"><rh-readouts><rh-readout label="Speed" unit="m/s" value="12.4"></rh-readout></rh-readouts>
         <rh-result variant="neutral" label="Make a guess">Gravity is weaker there.</rh-result>
         <rh-status variant="warning">Length must be more than 0.</rh-status>
         <rh-legend label="Series" items="Earth, Moon,Mars" shape="box"></rh-legend>
         <rh-table label="Period by planet"><table><tr><th>Planet</th></tr><tr><td>Earth</td></tr></table></rh-table>
         <rh-reset></rh-reset></div>`,
        true,
    );
    const readout = $('rh-readout output');
    assert.equal(readout.getAttribute('aria-labelledby'), $('rh-readout .key').id);
    assert.equal($('rh-readout .key').textContent, 'Speed');
    assert.equal(readout.textContent, '12.4 m/s');
    $('rh-readout').value = 13.1;
    assert.equal($('rh-readout').value, 13.1);
    assert.equal(readout.textContent, '13.1 m/s', 'the readout updates');

    const result = $('rh-result');
    assert.equal(result.getAttribute('role'), 'status');
    assert.equal(result.getAttribute('aria-atomic'), 'true');
    assert.equal(result.textContent, 'Make a guessGravity is weaker there.');
    const neutral = result.querySelector('svg').innerHTML;
    result.setAttribute('variant', 'correct');
    result.setAttribute('label', 'Correct');
    result.value = 'About 4.9 s.';
    assert.equal(result.textContent, 'CorrectAbout 4.9 s.');
    assert.notEqual(result.querySelector('svg').innerHTML, neutral, 'the icon follows the tone');
    assert.equal(result.querySelector('svg').getAttribute('aria-hidden'), 'true');

    const status = $('rh-status');
    assert.equal(status.getAttribute('role'), 'status');
    assert.equal(status.value, 'Length must be more than 0.');
    status.value = 'Balanced.';
    assert.equal(status.textContent, 'Balanced.');

    stepThrough($('#art'), [() => {}, () => {}]); // reconnects every control
    const list = $('rh-legend ul');
    assert.equal(list.getAttribute('aria-label'), 'Series');
    assert.deepEqual(
        [...list.children].map((li) => [
            li.textContent,
            li.firstChild.style.getPropertyValue('--ink'),
        ]),
        [
            ['Earth', 'var(--color-text-blue)'],
            ['Moon', 'var(--color-text-yellow)'],
            ['Mars', 'var(--color-text-pink)'],
        ],
    );
    assert.ok(
        [...list.querySelectorAll('i')].every((i) => i.getAttribute('aria-hidden') === 'true'),
    );
    assert.equal(root.querySelectorAll('rh-legend li').length, 3, 'not rendered twice');
    assert.deepEqual(
        [...root.querySelectorAll('rh-table caption')].map((c) => c.textContent),
        ['Period by planet'],
    );

    $('rh-reset button').click();
    assert.equal(readout.textContent, '12.4 m/s');
    assert.equal(result.getAttribute('variant'), 'neutral');
    assert.equal(result.textContent, 'Make a guessGravity is weaker there.');
    assert.equal(status.value, 'Length must be more than 0.');
});
