import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
const { passage } = await import('../support/passage.mjs');
const key = (node, key) =>
  node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('keyboard passage selection keeps exact offsets and returns focus on Escape', async (t) => {
  const { container, act, dom, text, branched, section } = await passage(t);
  assert.equal(button(container, 'Ask about selection'), undefined);
  await act(async () => button(container, 'Select passage in tutor reply 1').click());
  const input = container.querySelector('textarea');
  await act(async () => dom.frames());
  assert.equal(document.activeElement, input);
  assert.equal(input.readOnly, true);
  assert.equal(input.value, text);
  await act(async () => {
    input.setSelectionRange(10, 19);
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
  });
  await act(async () => button(container, 'Ask about selection').click());
  assert.deepEqual(branched.at(-1)[0], {
    messageId: 'reply',
    start: 10,
    end: 19,
    text: 'repeat 😀',
    at: undefined,
  });
  assert.equal(branched.at(-1)[1].textContent.trim(), 'Ask about selection');
  await act(async () => key(input, 'Escape'));
  assert.equal(container.querySelector('textarea'), null);
  assert.equal(document.activeElement, section());
  assert.equal(button(container, 'Ask about selection'), undefined);
});
