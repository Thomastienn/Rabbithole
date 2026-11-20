import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: LibraryShelf } = await import('../../src/map/LibraryShelf.tsx');
const { treeGroups } = await import('../../src/map/treeList.ts');

const day = 86_400_000,
  now = new Date(2026, 10, 14, 12);
const tree = (id, title, age, parent = null) => ({ id, title, parent, created: +now - age * day });
const trees = [
  tree('fungi', 'How do fungi trade?', 0),
  tree('roads', 'Roman roads', 1),
  tree('road-child', 'Aqueducts', 1, 'roads'),
  tree('bayes', "Bayes' rule, slowly", 3),
  tree('old', 'Old tree', 400),
];

test('volumes show date groups, counts, one spine tick per conversation and the current tree; actions call back', async (t) => {
  const calls = [];
  const props = {
    groups: treeGroups(trees, now),
    layout: 'shelf',
    current: 'fungi',
    today: now,
    onOpen: (id) => calls.push(['open', id]),
    onRename: async (id, title) => calls.push(['rename', id, title]),
    onCancelRename: () => calls.push(['cancel']),
    onStartRename: (id) => calls.push(['start', id]),
    onDelete: (id, origin) => calls.push(['delete', id, origin?.id]),
  };
  const { container, act, cleanup } = await render(h(LibraryShelf, props), ui);
  t.after(cleanup);
  const nav = container.querySelector('nav[aria-label="Saved learning trees"]');
  assert.equal(nav.dataset.layout, 'shelf');
  assert.ok(nav.querySelector('ul.shelf'));
  assert.deepEqual(
    [...nav.querySelectorAll('.tree-date-heading')].map((e) => e.textContent),
    ['Today', 'Yesterday', 'Previous 7 days', 'Older'],
  );
  const volumes = [...nav.querySelectorAll('.volume')].map((v) => {
    const title = v.querySelector('.saved-chat-title');
    return [
      title.textContent,
      v.querySelectorAll('.volume-spine i').length,
      title
        .getAttribute('aria-describedby')
        .split(' ')
        .map((id) => document.getElementById(id).textContent)
        .join(' | '),
    ];
  });
  const started = (age, year) =>
    `Started ${new Date(+now - age * day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year })}`;
  assert.deepEqual(volumes, [
    ['How do fungi trade?', 1, `${started(0)} | 1 conversation · 0 branches`],
    ['Roman roads', 2, `${started(1)} | 2 conversations · 1 branch`],
    ["Bayes' rule, slowly", 1, `${started(3)} | 1 conversation · 0 branches`],
    ['Old tree', 1, `${started(400, 'numeric')} | 1 conversation · 0 branches`],
  ]);
  assert.deepEqual(
    [...nav.querySelectorAll('[aria-current=true]')].map((e) => e.textContent),
    ['How do fungi trade?'],
  );
  assert.ok(button(nav, 'Actions for Roman roads'));
  const trigger = button(nav, 'Actions for Roman roads');
  await act(async () => trigger.click());
  const menu = document.getElementById(trigger.getAttribute('aria-controls'));
  const del = [...menu.querySelectorAll('[role=menuitem]')].find((e) =>
    e.textContent.includes('Delete chat'),
  );
  assert.equal(del.dataset.variant, 'destructive');
  await act(async () => del.click());
  assert.deepEqual(calls.at(-1), ['delete', 'roads', 'chat-actions-roads']);
  calls.length = 0;
  await act(async () => button(nav, "Bayes' rule, slowly").click());
  assert.deepEqual(calls, [['open', 'bayes']]);
});

test('List layout, renaming in place and no matches', async (t) => {
  const calls = [];
  const base = {
    layout: 'list',
    today: now,
    onOpen() {},
    onRename: async (id, title) => calls.push([id, title]),
    onCancelRename: () => calls.push(['cancel']),
    onStartRename() {},
    onDelete() {},
  };
  const { container, act, cleanup } = await render(
    h(
      'div',
      null,
      h(LibraryShelf, { ...base, groups: treeGroups(trees, now), renaming: 'roads' }),
      h(LibraryShelf, {
        ...base,
        groups: [],
        query: ' quantum ',
        onNewChat: () => calls.push(['new']),
      }),
    ),
    ui,
  );
  t.after(cleanup);
  const [list, empty] = container.querySelectorAll('nav');
  assert.equal(list.dataset.layout, 'list');
  assert.ok(list.querySelector('ul.library-list') && !list.querySelector('ul.shelf'));
  const editing = list.querySelector('.volume[data-renaming=true]');
  assert.equal(editing.querySelector('input').value, 'Roman roads');
  assert.equal(editing.querySelector('.saved-chat-title'), null);
  assert.equal(list.querySelectorAll('.volume-spine i').length, 3);
  assert.equal(
    empty.querySelector('h2').textContent,
    'No learning tree matches \u201cquantum\u201d',
  );
  await act(async () => button(empty, 'New chat').click());
  assert.deepEqual(calls, [['new']]);
});
