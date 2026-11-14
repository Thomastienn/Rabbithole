import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { visualMessage } from '../../src/media/artifacts.ts';
import { activatedPart, tagParts } from '../../src/media/visualParts.ts';

function frame(html) {
  const { window: w } = new JSDOM(`<div id="visual">${html}</div>`);
  for (const key of ['Element', 'HTMLElement', 'HTMLDetailsElement', 'KeyboardEvent'])
    globalThis[key] = w[key];
  w.Element.prototype.scrollIntoView = () => {};
  return { w, root: w.document.getElementById('visual'), $: (id) => w.document.getElementById(id) };
}
const part = (label, explanation) =>
  `data-visual-label="${label}" data-visual-explanation="${explanation}"`;

test('valid SVG/HTML parts become labelled tab stops; invalid tags and form fields are ignored', () => {
  const { root, $ } = frame(`
    <svg><rect id="semi" ${part('Semifinal', 'Each semifinal sends one winner.')}/></svg>
    <button id="winner" ${part('Winner', 'The final winner.')}>Winner</button>
    <div id="bad" ${part('', 'Empty label')}></div>
    <input id="field" ${part('Field', 'A form field.')}>`);
  assert.equal(tagParts(root, [], undefined, false), false);
  assert.deepEqual(
    [
      $('semi').getAttribute('tabindex'),
      $('semi').getAttribute('role'),
      $('semi').getAttribute('aria-label'),
    ],
    ['0', 'button', 'Ask about: Semifinal'],
  );
  assert.equal($('semi').getAttribute('aria-description'), 'Each semifinal sends one winner.');
  assert.equal($('winner').getAttribute('role'), null, 'native buttons keep their own role');
  assert.equal($('winner').getAttribute('tabindex'), '0');
  for (const id of ['bad', 'field']) assert.equal($(id).hasAttribute('tabindex'), false, id);
});

test('explored parts are relabelled; a pending reveal opens its details and focuses the part once', () => {
  const { w, root, $ } = frame(`<details id="d"><summary>More</summary>
    <div id="semi" ${part('Semifinal', 'One winner.')}></div></details>`);
  const semi = { label: 'Semifinal', explanation: 'One winner.' };
  assert.equal(tagParts(root, [semi], semi, true), false);
  assert.equal($('semi').getAttribute('aria-label'), 'Open explored branch: Semifinal');
  assert.ok(
    $('semi').hasAttribute('data-visual-explored') && $('semi').hasAttribute('data-visual-reveal'),
  );
  assert.equal($('d').open, true);
  assert.equal(w.document.activeElement, $('semi'));
  // A reveal whose part is not drawn yet keeps waiting.
  assert.equal(tagParts(root, [], { label: 'Late', explanation: 'Added later.' }, true), true);
  assert.equal($('semi').hasAttribute('data-visual-explored'), false);
});

test('click, Enter and Space activate a part; repeats, native-button keys and nested controls do not', () => {
  const { w, root, $ } = frame(`
    <div id="semi" ${part(' Semifinal ', 'One winner.')}><button id="step">Next step</button></div>
    <button id="winner" ${part('Winner', 'The final winner.')}>Winner</button>`);
  const key = (target, k, repeat = false) => {
    const event = new w.KeyboardEvent('keydown', { key: k, repeat, bubbles: true });
    Object.defineProperty(event, 'target', { value: target });
    return activatedPart(root, event);
  };
  const click = (target) => activatedPart(root, { target });
  const semi = { type: 'branch', label: 'Semifinal', explanation: 'One winner.' };
  assert.deepEqual(click($('semi')), semi);
  assert.deepEqual(key($('semi'), 'Enter'), semi);
  assert.deepEqual(key($('semi'), ' '), semi);
  assert.equal(key($('semi'), 'Enter', true), undefined);
  assert.equal(key($('semi'), 'a'), undefined);
  assert.equal(click($('step')), undefined, 'ordinary controls keep their own action');
  assert.equal(key($('winner'), ' '), undefined, 'a native button activates through its click');
  assert.deepEqual(click($('winner')), {
    type: 'branch',
    label: 'Winner',
    explanation: 'The final winner.',
  });
});

test('host accepts only exact, bounded height and branch messages', () => {
  assert.deepEqual(visualMessage({ type: 'height', height: 5000.2 }), {
    type: 'height',
    height: 4000,
  });
  assert.deepEqual(visualMessage({ type: 'branch', label: ' A ', explanation: ' B ' }), {
    type: 'branch',
    label: 'A',
    explanation: 'B',
  });
  for (const bad of [
    { type: 'branch', label: '', explanation: 'Empty label' },
    { type: 'branch', label: 'x'.repeat(121), explanation: 'Long label' },
    { type: 'branch', label: 'Valid', explanation: 'x'.repeat(281) },
    { type: 'branch', label: 'Two\nlines', explanation: 'Newline' },
    { type: 'branch', label: 'Extra', explanation: 'Key', href: '/' },
    { type: 'height', height: Infinity },
    'branch',
    null,
  ])
    assert.equal(visualMessage(bad), undefined, JSON.stringify(bad));
});
