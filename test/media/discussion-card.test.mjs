import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
import { publicDiscussion } from '../fixtures/discussion.mjs';
const { default: DiscussionCard } = await import('../../src/media/DiscussionCard.tsx');

test('discussion opening repeats speaker names, reads plain text and never exposes levels', async (t) => {
  const artifact = {
    id: 'discussion',
    kind: 'discussion',
    status: 'ready',
    discussion: {
      ...publicDiscussion,
      lines: [...publicDiscussion.lines, { speaker: 'Jun', text: '<b>**Still plain**</b>' }],
    },
  };
  const { container, cleanup } = await render(h(DiscussionCard, { artifact }), ui);
  t.after(cleanup);
  const card = container.querySelector('section');
  assert.equal(card.tabIndex, -1);
  assert.equal(card.dataset.artifact, artifact.id);
  assert.equal(card.getAttribute('aria-label'), 'Discussion with Theo, Maya and Jun');
  assert.match(card.querySelector('header').textContent, /3 classmates/);
  const lines = [...card.querySelector('ol[aria-label="Discussion lines"]').children];
  assert.equal(lines.length, artifact.discussion.lines.length);
  for (const [i, line] of lines.entries()) {
    assert.match(line.textContent, new RegExp(artifact.discussion.lines[i].speaker));
    assert.ok(line.textContent.includes(artifact.discussion.lines[i].text));
  }
  assert.doesNotMatch(card.textContent, /below|above|near|level|beginner|advanced/i);
  assert.equal(card.querySelector('b, strong, textarea, button, [data-o]'), null);
  card.focus();
  assert.equal(document.activeElement, card);
});

test('pending and unavailable discussions stay in place without reply or retry controls', async (t) => {
  for (const status of ['pending', 'failed']) {
    const { container, cleanup } = await render(
      h(DiscussionCard, { artifact: { id: status, status } }),
      ui,
    );
    const card = container.querySelector('section');
    assert.equal(card.dataset.artifact, status);
    assert.equal(card.querySelector('textarea, button, ol'), null);
    if (status === 'pending') {
      assert.equal(card.querySelector('[role=status]').textContent, 'Starting a discussion…');
      assert.equal(card.querySelectorAll('.astryx-skeleton').length, 3);
    } else {
      assert.match(card.textContent, /Discussion unavailable/);
      assert.ok(
        card.textContent.includes(
          "The tutor's discussion could not be read. Ask for it again in the conversation.",
        ),
      );
    }
    await cleanup();
  }
});
