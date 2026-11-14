import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const statuses = (c) => [...c.querySelectorAll('[role=status]')].map((e) => e.textContent);
const { default: TutorStyleSettings } = await import('../../src/settings/TutorStyleSettings.tsx');

test('tutor style section prefills the default, saves edits, restores the default and reports status', async (t) => {
  let saved = { style: null, default: 'Built-in style.' };
  const writes = [];
  const api = async (path, body) => {
    assert.equal(path, '/api/settings/tutor-style');
    if (body) {
      writes.push(body);
      saved = { ...saved, style: body.style?.trim() || null };
    }
    return saved;
  };
  const { container, act, cleanup } = await render(h(TutorStyleSettings, { api }), (w) => ui(w));
  t.after(cleanup);
  await act(async () => {});
  const box = container.querySelector('textarea');
  assert.equal(box.value, 'Built-in style.');
  assert.match(container.textContent, /Tutor style/);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(
      box,
      'Use sports analogies.',
    );
    box.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await act(async () => button(container, 'Save').click());
  assert.deepEqual(writes.at(-1), { style: 'Use sports analogies.' });
  assert.ok(statuses(container).includes('Tutor style saved.'));
  assert.equal(container.querySelector('textarea').value, 'Use sports analogies.');
  await act(async () => button(container, 'Restore default').click());
  assert.deepEqual(writes.at(-1), { style: null });
  assert.equal(container.querySelector('textarea').value, 'Built-in style.');
  assert.ok(statuses(container).includes('Using the default tutor style.'));
});
