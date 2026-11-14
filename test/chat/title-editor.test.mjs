import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue as type } from '../support/ui.mjs';
const { default: TitleEditor } = await import('../../src/chat/TitleEditor.tsx');

const key = (target, key) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('rename saves a trimmed title on Enter, rejects over 200 characters and Escape cancels locally', async (t) => {
  const saves = [],
    calls = [];
  let fail = true;
  const { container, act, cleanup } = await render(
    h(
      'div',
      { onKeyDown: (e) => calls.push(`outer ${e.key}`) },
      h(TitleEditor, {
        title: 'Old title',
        save: async (title) => {
          saves.push(title);
          if (fail) throw new Error('Rename failed: disk full');
        },
        cancel: () => calls.push('cancel'),
      }),
    ),
    ui,
  );
  t.after(cleanup);
  const input = container.querySelector('input');
  assert.equal(document.activeElement, input, 'the title field takes focus');
  assert.equal(input.value, 'Old title');
  await act(async () => type(input, 'x'.repeat(201)));
  assert.match(container.textContent, /Use 200 characters or fewer/);
  assert.equal(button(container, 'Save title').disabled, true);
  await act(async () => type(input, '   '));
  assert.equal(button(container, 'Save title').disabled, true, 'blank titles are not saved');
  await act(async () => type(input, '  Renamed tournament  '));
  await act(async () => key(input, 'Enter'));
  assert.deepEqual(saves, ['Renamed tournament']);
  assert.match(container.querySelector('[role=alert]').textContent, /Rename failed: disk full/);
  fail = false;
  await act(async () => button(container, 'Save title').click());
  assert.deepEqual(saves, ['Renamed tournament', 'Renamed tournament']);
  await act(async () => key(input, 'Escape'));
  assert.deepEqual(
    calls,
    ['outer Enter'],
    'Escape while saving neither cancels nor reaches the chat',
  );
});

test('Escape and Cancel rename call cancel without saving', async (t) => {
  const calls = [];
  const { container, act, cleanup } = await render(
    h(TitleEditor, {
      title: 'Branch',
      save: async () => calls.push('save'),
      cancel: () => calls.push('cancel'),
    }),
    ui,
  );
  t.after(cleanup);
  await act(async () => key(container.querySelector('input'), 'Escape'));
  await act(async () => button(container, 'Cancel rename').click());
  assert.deepEqual(calls, ['cancel', 'cancel']);
});
