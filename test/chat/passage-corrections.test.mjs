import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: BranchForm } = await import('../../src/chat/BranchForm.tsx');
const anchor = { messageId: 'reply', start: 2, end: 7, text: 'mutex', suggestion: true };
const key = (node, key) =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const item = (label) =>
  [...document.querySelectorAll('[role=menuitemradio]')].find(
    (e) => e.textContent.trim() === label,
  );

test('tagged corrections load saved state, keep the question, report failed writes and retry without submitting', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let dom,
    fail = true,
    saved = 'known';
  const calls = [],
    closed = [],
    sent = [];
  function Fixture() {
    const [question, setQuestion] = useState('keep this draft');
    return h(BranchForm, {
      branch: { parent: 'child', anchor, question },
      branching: false,
      active: false,
      concept: 'Mutual exclusion',
      setQuestion,
      close: (refocus) => closed.push(refocus),
      submit: (e) => {
        e.preventDefault();
        sent.push(question);
      },
      api: async (path, body) => {
        calls.push([path, body]);
        if (body) {
          if (fail) throw new Error('Storage unavailable');
          saved = body.kind;
        }
        return { concepts: [{ name: 'mutual exclusion', correction: saved }] };
      },
    });
  }
  const { container, act, cleanup } = await render(h(Fixture), (w) => {
    dom = ui(w);
  });
  t.after(cleanup);
  const trigger = () => button(container, 'Familiarity options for Mutual exclusion');
  const open = async () => {
    await act(async () => trigger().click());
    await act(async () => dom.frames());
  };
  await open();
  assert.equal(item('I know this').getAttribute('aria-checked'), 'true');
  assert.equal(item("I don't get this").getAttribute('aria-checked'), 'false');
  await act(async () => key(item('I know this'), 'Escape'));
  assert.deepEqual(closed, [], 'menu Escape leaves the passage form open');
  await open();
  await act(async () => item("I don't get this").click());
  assert.match(container.querySelector('[role=alert]').textContent, /Storage unavailable/);
  assert.equal(saved, 'known');
  fail = false;
  // The menu may remain mounted through its closing transition; the frame stub settles it.
  await act(async () => dom.frames());
  if (!item("I don't get this")) await open();
  await act(async () => item("I don't get this").click());
  assert.equal(saved, 'unknown');
  assert.equal(container.querySelector('[role=alert]'), null);
  assert.match(
    container.querySelector('.correction-status').textContent,
    /marked as not understood.*overrides the estimate/,
  );
  assert.equal(container.querySelector('input').value, 'keep this draft');
  assert.deepEqual(sent, []);
  assert.deepEqual(
    calls.filter(([, body]) => body).map(([, body]) => body),
    [
      { name: 'Mutual exclusion', kind: 'unknown' },
      { name: 'Mutual exclusion', kind: 'unknown' },
    ],
  );
});
