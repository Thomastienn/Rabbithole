import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { FirstQuestion } = await import('../../src/chat/ChatStates.tsx');
const { MessageAttachments } = await import('../../src/chat/Attachments.tsx');

const transfer = (files) => ({ files, types: ['Files'], getData: () => '' });
const fire = (target, type, key, files) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, key, { value: transfer(files) });
  target.dispatchEvent(event);
  return event;
};

test('composer paperclip, paste and drop feed one handler; pending chips are removable and send alone', async (t) => {
  const submitted = [];
  let files;
  function Fixture() {
    const [pending, setPending] = useState([]);
    files = pending;
    return h(FirstQuestion, {
      draft: '',
      setDraft() {},
      files: pending,
      setFiles: setPending,
      busy: false,
      available: true,
      modelMenu: null,
      submit: (text) => submitted.push(text),
      modelError: '',
      loadModels() {},
      noModels: false,
    });
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  const picked = new File(['a'], 'picked.txt', { type: 'text/plain' }),
    pasted = new File(['b'], 'pasted.md', { type: 'text/markdown' }),
    dropped = new File(['c'], 'dropped.py', { type: 'text/x-python' });

  const input = container.querySelector('input[type=file]');
  let clicked = false;
  input.addEventListener('click', () => (clicked = true));
  await act(async () => button(container, 'Attach files').click());
  assert.ok(clicked, 'the paperclip opens the file picker');
  Object.defineProperty(input, 'files', { configurable: true, value: [picked] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

  const editor = container.querySelector('[role=textbox]');
  let event;
  await act(async () => (event = fire(editor, 'paste', 'clipboardData', [pasted])));
  assert.ok(event.defaultPrevented, 'a pasted file is not inserted as text');
  await act(async () => (event = fire(editor, 'drop', 'dataTransfer', [dropped])));
  assert.ok(event.defaultPrevented, 'a dropped file does not navigate away');
  assert.deepEqual(
    files.map((f) => f.name),
    ['picked.txt', 'pasted.md', 'dropped.py'],
  );
  assert.match(container.textContent, /picked\.txt.*pasted\.md.*dropped\.py/);

  const removes = [...container.querySelectorAll('button')].filter((b) =>
    /remove/i.test(b.getAttribute('aria-label') ?? ''),
  );
  assert.equal(removes.length, 3);
  await act(async () => removes[1].click());
  assert.deepEqual(
    files.map((f) => f.name),
    ['picked.txt', 'dropped.py'],
  );
  assert.doesNotMatch(container.textContent, /pasted\.md/);

  // Files alone are a question: Send is enabled with an empty draft.
  await act(async () => button(container, 'Send').click());
  assert.deepEqual(submitted, ['']);
});

test('a message chip names the file, its type and how it reached the tutor, and opens it', async (t) => {
  const { container, cleanup } = await render(
    h(MessageAttachments, {
      conversation: 'c1',
      attachments: [
        { id: 'a1', name: 'heap.py', type: 'text/x-python', size: 20, delivery: 'text' },
      ],
    }),
    ui,
  );
  t.after(cleanup);
  const link = container.querySelector('a');
  assert.equal(link.getAttribute('href'), '/api/trees/c1/attachments/a1');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.match(link.getAttribute('rel'), /noopener/);
  assert.match(link.textContent, /heap\.py/);
  assert.match(link.textContent, /Text file · read as text/);
});
