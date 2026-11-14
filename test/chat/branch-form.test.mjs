import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
const { default: BranchForm } = await import('../../src/chat/BranchForm.tsx');
const anchor = { messageId: 'reply', start: 2, end: 7, text: 'mutex', suggestion: true };
const key = (node, key) =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('branch form names its passage, controls submit/locking, and distinguishes Escape, menus and outside clicks', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let update, dom;
  const sent = [],
    closed = [],
    calls = [];
  function Fixture() {
    const [value, set] = useState({ question: '', branching: false, active: false });
    update = set;
    return h(BranchForm, {
      ...value,
      branch: { parent: 'root', anchor, question: value.question },
      api: async (...args) => {
        calls.push(args);
        return { concepts: [] };
      },
      submit: (e) => {
        e.preventDefault();
        sent.push(value.question);
      },
      close: (refocus) => closed.push(refocus),
      setQuestion: (question) => set((v) => ({ ...v, question })),
    });
  }
  const { container, act, cleanup } = await render(h(Fixture), (w) => {
    dom = ui(w);
  });
  t.after(cleanup);
  await act(async () => dom.frames());
  const input = container.querySelector('input');
  assert.equal(document.activeElement, input);
  assert.equal(input.labels[0].textContent, 'Question about this passage');
  assert.equal(
    document.getElementById(input.getAttribute('aria-describedby')).textContent,
    'mutex',
  );
  assert.equal(button(container, 'Create focused chat').disabled, true);
  assert.equal(button(container, 'Cancel branch'), undefined);
  assert.equal(container.querySelector('[aria-label^="Familiarity"]'), null);
  await act(async () => inputValue(input, '  '));
  assert.equal(button(container, 'Create focused chat').disabled, true);
  await act(async () => inputValue(input, 'Why?'));
  await act(async () => button(container, 'Create focused chat').click());
  assert.deepEqual(sent, ['Why?']);
  await act(async () => key(input, 'Escape'));
  assert.deepEqual(closed, [true]);
  await act(async () => input.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  assert.deepEqual(closed, [true]);
  const menu = document.body.appendChild(document.createElement('div'));
  menu.setAttribute('role', 'menu');
  await act(async () => menu.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  assert.deepEqual(closed, [true], 'portalled correction menu counts as inside');
  menu.remove();
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  assert.deepEqual(closed, [true, false]);
  await act(async () => update((v) => ({ ...v, branching: true })));
  assert.equal(input.getAttribute('aria-disabled'), 'true');
  assert.equal(button(container, 'Preparing context…').disabled, true);
  await act(async () => {
    key(input, 'Escape');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  assert.deepEqual(closed, [true, false]);
  await act(async () => update((v) => ({ ...v, branching: false, active: true })));
  assert.equal(button(container, 'Create focused chat').disabled, true);
  assert.equal(input.value, 'Why?');
  assert.deepEqual(calls, [], 'manual form never loads or corrects a guessed concept');
});
