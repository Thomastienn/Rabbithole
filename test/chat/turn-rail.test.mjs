import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import TurnRail from '../../src/chat/TurnRail.tsx';

test('turn rail shows one labelled tick per question and jumps on click', async (t) => {
  const jumps = [];
  const long = 'why '.repeat(30);
  const { container, act, cleanup } = await render(
    h(TurnRail, {
      questions: [
        { id: 'q1', text: 'What is a  tree?' },
        { id: 'q2', text: long },
      ],
      jump: (id) => jumps.push(id),
    }),
  );
  t.after(cleanup);
  const nav = container.querySelector('nav');
  assert.equal(nav.getAttribute('aria-label'), 'Questions in this conversation');
  const ticks = [...nav.querySelectorAll('button')];
  assert.equal(ticks.length, 2);
  assert.equal(ticks[0].getAttribute('aria-label'), 'What is a tree?');
  assert.equal(ticks[1].getAttribute('aria-label').length, 80);
  assert.ok(ticks[1].getAttribute('aria-label').endsWith('…'));
  await act(async () => ticks[1].click());
  assert.deepEqual(jumps, ['q2']);
});
