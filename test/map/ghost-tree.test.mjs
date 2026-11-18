import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { render } from '../support/render.mjs';

const { GhostTree } = await import('../../src/map/GhostTree.tsx');
const { ghostTrees, miniature } = await import('../../src/map/ghostTrees.ts');

test('a ghost tree node draws a dot per conversation, names the tree and concepts, and opens it', async (t) => {
  const c = (id, parent, concept = null) => ({
    id,
    parent,
    title: id === 'other' ? 'Thermodynamics' : id,
    created: 0,
    x: null,
    y: null,
    concept,
    learnerMessages: 1,
  });
  const trees = [
    c('here', null, 'Entropy'),
    c('other', null),
    c('other.1', 'other', 'Entropy'),
    c('other.2', 'other'),
  ];
  const [ghost] = ghostTrees(trees, 'here');
  const opened = [];
  const data = { ghost, shape: miniature(trees, 'other'), open: (g) => opened.push(g.root) };
  const { container, act, cleanup } = await render(
    h(ReactFlowProvider, null, h(GhostTree, { id: 'ghost-other', data })),
  );
  t.after(cleanup);
  assert.equal(container.querySelectorAll('circle[data-dot]').length, 3);
  const button = container.querySelector('button.ghost-tree');
  assert.equal(
    button.getAttribute('aria-label'),
    'Open Thermodynamics, which also explored Entropy',
  );
  assert.equal(button.textContent, 'Thermodynamics');
  await act(() => button.click());
  assert.deepEqual(opened, ['other']);
  assert.deepEqual(ghost.matches, ['other.1']);
});
