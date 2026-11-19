import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: VisualFrame } = await import('../../src/media/VisualFrame.tsx');
const { default: ChatThread } = await import('../../src/chat/ChatThread.tsx');
const { Conversation } = await import('../../src/map/Conversation.tsx');

const visual = (id, status, extra = {}) => ({
  id,
  kind: 'visual',
  conversation: 'a',
  message: 'r',
  title: `Visual ${id}`,
  description: `${id} description`,
  status,
  error: null,
  source: null,
  created: Date.now() - 5_000,
  position: null,
  ...extra,
});

test('the visual badge, dimming, input lock and live announcements follow its state', async (t) => {
  let set;
  function Host() {
    const [artifact, setArtifact] = useState(visual('v', 'pending'));
    set = setArtifact;
    return h(VisualFrame, { artifact, onRetry: async () => {} });
  }
  const { container, act, cleanup } = await render(h(Host), ui);
  t.after(cleanup);
  const figure = () => container.querySelector('figure.visual');
  const badge = () => figure().querySelector('.visual-badge');
  const status = () => figure().querySelector('[role=status]');
  const live = status();
  assert.match(badge().textContent, /^Drawing… 0:0\d$/);
  assert.equal(
    badge().getAttribute('aria-hidden'),
    'true',
    'badge text is not re-read each second',
  );
  assert.equal(status().textContent, 'Drawing visual: Visual v');
  assert.equal(figure().getAttribute('aria-busy'), 'true');
  assert.equal(figure().dataset.partial, undefined, 'nothing drawn yet: shimmer, not dimmed');
  assert.ok(figure().querySelector('iframe').hasAttribute('inert'));

  await act(async () => set(visual('v', 'pending', { source: '<p>half</p>' })));
  assert.equal(figure().dataset.partial, 'true', 'partly drawn visual is dimmed');
  assert.ok(figure().querySelector('iframe').hasAttribute('inert'), 'and takes no input');
  assert.ok(figure().querySelector('.visual-drawing-ring'), 'drawing shows the progress ring');
  await act(async () => figure().dispatchEvent(new MouseEvent('click', { bubbles: true })));
  assert.equal(
    figure().querySelector('.visual-nudge')?.textContent,
    'Still drawing. Its controls work once it finishes.',
    'a click on a drawing visual says why nothing happened',
  );

  await act(async () => set(visual('v', 'ready', { source: '<p>done</p>' })));
  assert.equal(badge().textContent, 'Interactive');
  assert.equal(figure().dataset.partial, undefined);
  assert.equal(figure().hasAttribute('aria-busy'), false);
  assert.equal(figure().querySelector('iframe').hasAttribute('inert'), false);
  assert.equal(figure().querySelector('.visual-drawing-ring, .visual-nudge'), null);
  assert.equal(status(), live, 'one persistent live region announces each change');
  assert.equal(status().textContent, 'Visual ready: Visual v');

  await act(async () => set(visual('v', 'failed', { error: 'The visual could not be drawn.' })));
  assert.equal(badge().textContent, 'Failed');
  assert.equal(status(), live);
  assert.equal(status().textContent, 'Visual unavailable. The visual could not be drawn.');
  assert.ok(button(figure(), 'Retry visual'));

  await act(async () => set(visual('v', 'interrupted')));
  assert.equal(badge().textContent, 'Interrupted');
});

test('reply footer and conversation node show "n of m visuals ready" until every visual finishes', async (t) => {
  const thread = (artifacts) =>
    h(ChatThread, {
      tree: {
        id: 'a',
        artifacts,
        messages: [{ id: 'r', role: 'assistant', status: 'completed', text: 'Answer' }],
      },
      c: { overview: false, addresses: new Map(), state: { trees: [] }, setSelectingMessage() {} },
      model: { modelLabel: () => 'Fixture' },
      trees: { openConversation() {} },
      stream: { send() {} },
      branchForm: { visualBranches: {}, groundworkBranches: {} },
      actions: { videoAction() {} },
      active: true,
    });
  const node = (artifacts) =>
    h(
      ReactFlowProvider,
      null,
      h(Conversation, {
        id: 'a',
        data: {
          conversation: { id: 'a', parent: null, title: 'a', created: 0, messageId: null },
          sources: [],
          preview: [{ id: 'r', role: 'assistant', text: 'Answer', status: 'completed', artifacts }],
          open() {},
          retry() {},
          toggle() {},
          active: false,
          focused: false,
          focus: false,
          childCount: 0,
          address: '1',
          ink: 0,
          stubs: [],
          folded: false,
        },
      }),
    );
  let set;
  function Host() {
    const [artifacts, setArtifacts] = useState([
      visual('one', 'ready', { source: '<p>1</p>' }),
      visual('two', 'pending'),
      { ...visual('clip', 'pending'), kind: 'video' },
    ]);
    set = setArtifacts;
    return h('div', null, thread(artifacts), node(artifacts));
  }
  const { container, act, cleanup } = await render(h(Host), ui);
  t.after(cleanup);
  const text = (selector) => container.querySelector(selector)?.textContent;
  assert.equal(text('.reply-visuals'), '1 of 2 visuals ready');
  assert.equal(text('.node-visuals'), '1 of 2 visuals ready');
  await act(async () =>
    set((all) =>
      all.map((a) => (a.id === 'two' ? { ...a, status: 'ready', source: '<p>2</p>' } : a)),
    ),
  );
  assert.equal(text('.reply-visuals'), undefined, 'count leaves once all visuals finish');
  assert.equal(text('.node-visuals'), undefined, 'a pending video does not keep the count');
});
