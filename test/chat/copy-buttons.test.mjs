import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: CopyButton } = await import('../../src/markdown/CopyButton.ts');
const { renderMarkdown } = await import('../../src/markdown/markdown.ts');

// shortcut: the clipboard is a recorder; native clipboard permission is a browser concern.
const clipboard = (copied) => (w) => {
  ui(w);
  Object.defineProperty(w.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => void copied.push(text) },
  });
};

test('Copy reply puts the raw Markdown on the clipboard and confirms Copied; Copy code copies the block source without fences', async (t) => {
  const copied = [];
  const text = 'Use **a lock**:\n\n```js\nlock.acquire();\n```';
  const { container, act, cleanup } = await render(
    h(
      'div',
      null,
      h('div', { className: 'reply-md' }, renderMarkdown(text)),
      h(CopyButton, { text, label: 'Copy tutor reply 1', className: 'reply-copy' }),
    ),
    clipboard(copied),
  );
  t.after(cleanup);
  assert.equal(container.querySelectorAll('.code-copy').length, 1, 'one Copy per code block');
  await act(async () => button(container, 'Copy tutor reply 1').click());
  assert.deepEqual(copied, [text]);
  assert.ok(button(container, 'Copied'), 'label confirms in place');
  await act(async () => button(container, 'Copy code').click());
  assert.deepEqual(copied, [text, 'lock.acquire();']);
});
