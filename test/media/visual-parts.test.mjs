import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { visualMessage } from '../../src/media/artifacts.ts';
import { renderVisual } from '../../src/media/visualMarkup.ts';

const part = (label, explanation) =>
  `data-visual-label="${label}" data-visual-explanation="${explanation}"`;

test('stored tagged visuals render unchanged and their tags do not activate', () => {
  const { window: w } = new JSDOM('<div id="visual"></div>');
  const root = w.document.getElementById('visual');
  const html = `<svg><rect id="semi" ${part('Semifinal', 'One winner.')}></rect></svg><div id="final" ${part('Final', 'Winners meet.')}>Final</div>`;
  renderVisual(root, html, true);
  for (const id of ['semi', 'final']) {
    const e = w.document.getElementById(id);
    assert.equal(e.getAttribute('data-visual-label') !== null, true, 'markup kept');
    for (const attr of ['tabindex', 'role', 'aria-label'])
      assert.equal(e.hasAttribute(attr), false);
  }
});

test('host accepts only exact, bounded height messages and visual branch parts', () => {
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
