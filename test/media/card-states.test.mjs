import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: VideoCard } = await import('../../src/media/VideoCard.tsx');
const { default: DiagramCard } = await import('../../src/media/DiagramCard.tsx');
const { default: VisualFrame } = await import('../../src/media/VisualFrame.tsx');

test('failed media keep readable reasons and Retry actions; cancellation stays distinct', async (t) => {
  const calls = [];
  const artifact = (id, kind, error) => ({
    id,
    kind,
    conversation: 'root',
    message: 'reply',
    title: id,
    description: `${id} description`,
    status: 'failed',
    error,
    source: null,
  });
  const { container, act, cleanup } = await render(
    h(
      'div',
      null,
      h(VisualFrame, {
        artifact: artifact('visual', 'visual', 'The visual could not be drawn.'),
        onRetry: async () => {
          calls.push('visual');
        },
      }),
      h(DiagramCard, {
        artifact: artifact('diagram', 'mermaid', 'The diagram source has an error.'),
        onRetry: async () => {
          calls.push('diagram');
        },
      }),
      h(VideoCard, {
        artifact: artifact('video', 'video', 'Video narration timed out.'),
        inline: true,
        onAction: async (action) => {
          calls.push(action);
        },
      }),
      h(VideoCard, {
        artifact: { ...artifact('canceled', 'video'), status: 'canceled' },
        inline: true,
        onAction: async (action) => {
          calls.push(action);
        },
      }),
      h(VideoCard, {
        artifact: artifact(
          'provider',
          'video',
          'Video provider failed: Model gpt-x is not in the catalog',
        ),
        inline: true,
      }),
      h(VideoCard, {
        artifact: artifact('private', 'video', 'private worker output'),
        inline: true,
      }),
    ),
    ui,
  );
  t.after(cleanup);
  for (const [id, text] of [
    ['visual', 'Visual unavailable. The visual could not be drawn.'],
    ['diagram', 'Diagram unavailable. The diagram source has an error.'],
    ['video', 'Video narration timed out.'],
    ['provider', 'Video provider failed: Model gpt-x is not in the catalog'],
    ['canceled', 'Video generation canceled.'],
  ]) {
    const card = container.querySelector(`[data-artifact=${id}]`);
    assert.match(card.querySelector('[role=status]').textContent, new RegExp(text));
    assert.equal(card.dataset.state, id === 'canceled' ? 'canceled' : 'failed');
  }
  assert.equal(container.textContent.includes('private worker output'), false);
  for (const [label, id] of [
    ['Retry visual', 'visual'],
    ['Retry diagram', 'diagram'],
    ['Retry video', 'video'],
  ]) {
    await act(async () => button(container.querySelector(`[data-artifact=${id}]`), label).click());
  }
  assert.deepEqual(calls, ['visual', 'diagram', 'retry']);
});
