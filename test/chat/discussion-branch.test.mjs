import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
import { publicDiscussion } from '../fixtures/discussion.mjs';
const { passage } = await import('../support/passage.mjs');

const card = (closed) => ({
  id: 'talk',
  kind: 'discussion',
  status: 'ready',
  conversation: 'tree',
  message: 'reply',
  position: 0,
  discussion: { ...publicDiscussion, ...(closed && { closed: true }) },
});
const select = (node, start, end, endNode = node) => {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(endNode, end);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
};

test("selecting inside a classmate's line offers Ask and branches with the line passage", async (t) => {
  const { container, act, update, branched, section } = await passage(t);
  await act(async () => update((v) => ({ ...v, inlineArtifacts: [card(true)] })));
  const line = (i) => container.querySelector(`.discussion-card [data-line="${i}"]`);
  // Theo: "Is the fungus a parasite the plant puts up with?"
  select(line(0).firstChild, 7, 13);
  await act(async () => section().dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await act(async () => button(container, 'Ask about selection').click());
  const [anchor] = branched.at(-1);
  assert.deepEqual(
    { ...anchor, at: undefined },
    {
      messageId: 'reply',
      artifactId: 'talk',
      line: 0,
      start: 7,
      end: 13,
      text: 'fungus',
      at: undefined,
    },
  );
  // Crossing two lines, or starting in a speaker name, offers no Ask.
  select(line(0).firstChild, 7, 3, line(1).firstChild);
  await act(async () => section().dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  assert.ok(!button(container, 'Ask about selection'));
  const name = container.querySelector('.discussion-card__name');
  select(name.firstChild, 0, 2, line(0).firstChild);
  await act(async () => section().dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  assert.ok(!button(container, 'Ask about selection'));
});

test('a saved discussion branch underlines its line passage in ink with its chip and opens the child', async (t) => {
  const { container, act, update, opened, branched, section } = await passage(t);
  localStorage.setItem('rabbithole.discussion-seen.talk', '99'); // every line already seen
  await act(async () =>
    update((v) => ({
      ...v,
      inlineArtifacts: [card(false)],
      discussionBranches: {
        talk: [{ child: 'kid', line: 1, start: 4, end: 9, address: '1.2', ink: 2 }],
      },
    })),
  );
  const line = container.querySelector('.discussion-card [data-line="1"]');
  const u = line.querySelector('u.suggestion.explored');
  assert.equal(u.textContent, 'plant');
  assert.match(u.getAttribute('style'), /--rabbithole-ink-2/);
  assert.equal(line.querySelector('sup.passage-address').textContent, '1.2');
  assert.equal(line.textContent.replace('1.2', ''), publicDiscussion.lines[1].text);
  await act(async () => u.click());
  assert.deepEqual(opened, ['kid']);
  // Offsets after the chip ignore the chip text: "gets" in "The plant gets phosphorus back."
  const after = u.nextSibling.nextSibling;
  select(after, 1, 5);
  await act(async () => section().dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
  await act(async () => button(container, 'Ask about selection').click());
  assert.deepEqual(
    [
      branched.at(-1)[0].line,
      branched.at(-1)[0].start,
      branched.at(-1)[0].end,
      branched.at(-1)[0].text,
    ],
    [1, 10, 14, 'gets'],
  );
});
