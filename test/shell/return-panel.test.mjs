import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { button, ui } from '../support/ui.mjs';
const { default: ReturnPanel } = await import('../../src/shell/ReturnPanel.tsx');

test('Return to learning tree goes back and focuses the conversation the learner left', async (t) => {
  let dom,
    backs = 0;
  const panel = h(
    'div',
    null,
    h('button', { id: 'rename-conversation' }, 'Rename'),
    h(
      ReturnPanel,
      { label: 'Knowledge', returnId: 'r', shown: true, overview: false, back: () => backs++ },
      h('p', null, 'page'),
    ),
  );
  const { container, act, cleanup } = await render(panel, (w) => {
    dom = ui(w);
  });
  t.after(cleanup);
  const ret = button(container, 'Return to learning tree');
  // The return sits above the page content in the same panel.
  assert.equal(ret.compareDocumentPosition(container.querySelector('p')) & 4, 4);
  await act(async () => {
    ret.click();
    dom.frames();
  });
  assert.equal(backs, 1);
  assert.equal(document.activeElement.id, 'rename-conversation');
});
