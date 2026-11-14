import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';
import { conversationAddresses } from '../../src/map/treeList.ts';
const { default: Contents } = await import('../../src/chat/Contents.tsx');
const { default: TurnRail } = await import('../../src/chat/TurnRail.tsx');

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

test('Contents lists nested conversation addresses and figures and routes each action to its owner', async (t) => {
  const trees = [
    { id: 'root', parent: null, title: 'How do fungi trade?', created: 0 },
    { id: 'child', parent: 'root', title: 'Why trade at all?', created: 1 },
    { id: 'grand', parent: 'child', title: 'Could a plant go alone?', created: 2 },
    { id: 'sibling', parent: 'root', title: 'What are hyphae?', created: 3 },
  ];
  const calls = [];
  const { container, act, cleanup } = await render(
    h(Contents, {
      root: 'root',
      trees,
      addresses: conversationAddresses(trees),
      previews: {},
      active: [],
      current: {
        id: 'root',
        messages: [{ id: 'reply', role: 'assistant', text: 'Trade', status: 'completed' }],
        artifacts: [
          { id: 'figure', message: 'reply', kind: 'mermaid', title: 'Trade loop', status: 'ready' },
          {
            id: 'canceled',
            message: 'reply',
            kind: 'visual',
            title: 'Canceled visual',
            status: 'canceled',
          },
        ],
      },
      open: (id) => calls.push(['conversation', id]),
      openFigure: (id, artifact) => calls.push(['figure', id, artifact]),
      collapse: () => calls.push(['collapse']),
    }),
    ui,
  );
  t.after(cleanup);
  assert.equal(
    container.querySelector('aside').getAttribute('aria-label'),
    'Learning tree contents',
  );
  assert.deepEqual([...container.querySelectorAll('.contents-row')].map(name), [
    '1 How do fungi trade?',
    '1.1 Why trade at all?',
    '1.1.1 Could a plant go alone?',
    '1.2 What are hyphae?',
    'Fig 1 Trade loop',
  ]);
  assert.match(container.textContent, /4 conversations · 1 figure/);
  assert.equal(
    container.querySelector('[aria-current=location]').getAttribute('aria-label'),
    '1 How do fungi trade?',
  );
  await act(async () => button(container, '1.1.1 Could a plant go alone?').click());
  await act(async () => button(container, 'Fig 1 Trade loop').click());
  await act(async () => button(container, 'Hide contents').click());
  assert.deepEqual(calls, [['conversation', 'grand'], ['figure', 'root', 'figure'], ['collapse']]);
});

test('Contents reports the last completed context, drops the meter without a limit, shares family inks and collapses', async (t) => {
  const trees = [
    { id: 'root', parent: null, title: 'Fungi', created: 0 },
    { id: 'child', parent: 'root', title: 'Trade', created: 1 },
    { id: 'grand', parent: 'child', title: 'Alone', created: 2 },
    { id: 'sibling', parent: 'root', title: 'Hyphae', created: 3 },
  ];
  const reply = (input, context) => ({
    id: `r${input}`,
    role: 'assistant',
    text: 'A',
    status: 'completed',
    usage: { input, output: 0, cacheRead: 0, context },
  });
  const limit = { limit: 200000, provider: 'codex', model: 'chat' };
  let update;
  const collapsed = [];
  function Fixture() {
    const [current, set] = useState({
      id: 'root',
      provider: 'codex',
      model: 'chat',
      artifacts: [],
      messages: [reply(36000, limit)],
    });
    update = set;
    return h(Contents, {
      root: 'root',
      trees,
      addresses: conversationAddresses(trees),
      previews: {},
      active: [],
      current,
      open() {},
      openFigure() {},
      collapse: () => collapsed.push(true),
    });
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  const context = () => container.querySelector('.contents-context');
  assert.match(context().textContent, /36,000 tokens · 18% of 200,000/);
  assert.equal(context().querySelector('meter').value, 36000);
  await act(async () => update((c) => ({ ...c, messages: [...c.messages, reply(64000, limit)] })));
  assert.match(context().textContent, /64,000 tokens · 32% of 200,000/);
  await act(async () => update((c) => ({ ...c, model: 'unknown' })));
  assert.match(context().textContent, /64,000 tokens · limit unavailable/);
  assert.doesNotMatch(context().textContent, /%/);
  assert.equal(context().querySelector('meter'), null);
  await act(async () => update((c) => ({ ...c, messages: [] })));
  assert.match(context().textContent, /Context usage unavailable/);
  const ink = [...container.querySelectorAll('.contents-list > li')].map((li) =>
    li.style.getPropertyValue('--ink'),
  );
  assert.equal(ink[1], ink[2], '1.1 and 1.1.1 share their family ink');
  assert.notEqual(ink[1], ink[3], 'sibling families differ');
  const hide = button(container, 'Hide contents');
  assert.equal(hide.getAttribute('aria-expanded'), 'true');
  await act(async () => hide.click());
  assert.deepEqual(collapsed, [true]);
});
