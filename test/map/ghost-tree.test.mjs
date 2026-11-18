import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
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

test('ghost trees hide when switched off, start at their saved position and save where they are dragged', async (t) => {
  const { useGhostTrees } = await import('../../src/map/useGhostTrees.ts');
  const c = (id, parent, concept = null, layout) => ({
    id,
    parent,
    title: id,
    created: 0,
    x: 0,
    y: 0,
    concept,
    learnerMessages: 1,
    layout,
  });
  const trees = [
    c('here', null, 'Entropy', { ghosts: { other: { x: 400, y: 50 } } }),
    c('other', null, 'Entropy'),
  ];
  const nodes = [
    {
      id: 'here',
      position: { x: 0, y: 0 },
      measured: { width: 100, height: 80 },
      data: { conversation: trees[0] },
    },
  ];
  const saved = [];
  let ghost, show;
  const Probe = () => {
    const [shown, setShown] = useState(true);
    show = setShown;
    ghost = useGhostTrees({
      trees,
      root: 'here',
      nodes,
      shown,
      open: () => {},
      save: (root, at) => saved.push([root, at]),
    });
    return null;
  };
  const { act, cleanup } = await render(h(Probe));
  t.after(cleanup);
  assert.deepEqual(
    ghost.nodes.map((n) => [n.id, n.position, n.draggable]),
    [['ghost-other', { x: 400, y: 50 }, true]],
  );
  assert.equal(ghost.edges.length, 1);
  let rest;
  await act(() => {
    rest = ghost.move([
      { type: 'position', id: 'ghost-other', position: { x: 10, y: 20 }, dragging: true },
      { type: 'position', id: 'here', position: { x: 5, y: 5 }, dragging: false },
    ]);
  });
  assert.deepEqual(
    rest.map((r) => r.id),
    ['here'],
    'conversation changes pass through',
  );
  assert.deepEqual(ghost.nodes[0].position, { x: 10, y: 20 });
  assert.deepEqual(saved, [], 'saved only on release');
  await act(() => {
    ghost.move([
      { type: 'position', id: 'ghost-other', position: { x: 30, y: 40 }, dragging: false },
    ]);
  });
  assert.deepEqual(saved, [['other', { x: 30, y: 40 }]]);
  await act(() => show(false));
  assert.deepEqual([ghost.nodes, ghost.edges], [[], []]);
});
