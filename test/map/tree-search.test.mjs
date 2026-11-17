import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
const { default: TreeSearch } = await import('../../src/shell/TreeSearch.tsx');

test('title search opens focused, names empty states, selects with arrows/Enter or click and returns focus on Escape', async (t) => {
  const chosen = [];
  let query;
  const source = {
    bootstrap: () => [],
    search: async (q) =>
      q === 'missing'
        ? []
        : [
            { id: 'roman', label: 'Roman roads' },
            { id: 'photo', label: 'Photosynthesis' },
          ],
  };
  function Fixture() {
    const [open, setOpen] = useState(false);
    return h(
      'div',
      null,
      h('button', { className: 'tree-search', onClick: () => setOpen(true) }, 'Search'),
      h(TreeSearch, {
        isOpen: open,
        onOpenChange: setOpen,
        searchSource: source,
        onValueChange: (id) => chosen.push(id),
      }),
    );
  }
  const { container, act, cleanup } = await render(h(Fixture), (w) => {
    // jsdom lacks modal/CSS APIs. Focus and selection still run in the real component.
    w.CSS = { escape: (id) => id.replace(/[^\w-]/g, (c) => `\\${c}`) };
    w.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    w.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  });
  t.after(cleanup);
  const trigger = container.querySelector('.tree-search');
  const open = async () => {
    await act(async () => {
      trigger.focus();
      trigger.click();
    });
    return document.querySelector('dialog[open]');
  };
  const type = async (text) => {
    const input = document.querySelector('dialog input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        input,
        text,
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };
  const key = async (input, key) =>
    act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })),
    );
  const dialog = await open();
  assert.ok(dialog.getAttribute('aria-label'), 'named for assistive tech');
  assert.equal(document.activeElement.tagName, 'INPUT');
  assert.match(dialog.textContent, /Type part of a learning tree’s title\./);
  query = await type('missing');
  assert.match(dialog.textContent, /No learning tree titles match\./);
  assert.equal(dialog.querySelectorAll('[role=option]').length, 0);
  query = await type('O');
  assert.deepEqual(
    [...dialog.querySelectorAll('[role=option]')].map((e) => e.textContent),
    ['Roman roads', 'Photosynthesis'],
  );
  await key(query, 'ArrowDown');
  const first = query.getAttribute('aria-activedescendant');
  await key(query, 'ArrowDown');
  assert.notEqual(query.getAttribute('aria-activedescendant'), first);
  await key(query, 'ArrowUp');
  assert.equal(query.getAttribute('aria-activedescendant'), first);
  await key(query, 'Enter');
  assert.equal(chosen.length, 1);
  assert.equal(document.querySelector('dialog[open]'), null);
  await open();
  assert.equal(document.querySelector('dialog input').value, '');
  query = await type('O');
  await key(query, 'Escape');
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(chosen.length, 1, 'dismissal leaves the selection alone');
  await open();
  await type('O');
  await act(async () => document.querySelector('[role=option]').click());
  assert.equal(chosen.length, 2);
});
