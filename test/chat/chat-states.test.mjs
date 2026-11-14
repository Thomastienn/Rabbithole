import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { FirstQuestion, TreeLoading, TreeLoadFailure } =
  await import('../../src/chat/ChatStates.tsx');

test('first question retains its controlled draft, selects a model before sending, and exposes model recovery', async (t) => {
  let update;
  const submitted = [],
    retried = [];
  function Fixture() {
    const [value, set] = useState({
      draft: 'How do fungi trade?',
      available: true,
      busy: false,
      modelError: 'Models could not load',
      noModels: false,
    });
    update = set;
    return h(FirstQuestion, {
      ...value,
      setDraft: (draft) => set((v) => ({ ...v, draft })),
      modelMenu: h('button', null, 'Model for next reply'),
      submit: (text) => submitted.push(text),
      loadModels: () => retried.push('models'),
    });
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  assert.equal(
    container.querySelector('[role=textbox]').getAttribute('aria-label'),
    'Your question',
  );
  assert.equal(container.querySelector('[role=textbox]').textContent, 'How do fungi trade?');
  assert.ok(button(container, 'Model for next reply'));
  assert.match(container.querySelector('[role=alert]').textContent, /Models could not load/);
  await act(async () => button(container, 'Retry loading models').click());
  assert.deepEqual(retried, ['models']);
  await act(async () =>
    container
      .querySelector('[role=textbox]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  assert.deepEqual(submitted, ['How do fungi trade?']);
  await act(async () =>
    update({
      draft: 'Keep my failed question',
      available: false,
      busy: false,
      modelError: '',
      noModels: true,
    }),
  );
  assert.equal(button(container, 'Send').disabled, true);
  assert.match(container.textContent, /No model is available. Open Settings to connect one/);
  assert.equal(container.querySelector('[role=textbox]').textContent, 'Keep my failed question');
  assert.equal(container.querySelector('[role=alert]'), null);
});

test('loading tree announces four skeletons; load failure offers its retry handler', async (t) => {
  let finish;
  const calls = [];
  function Fixture() {
    const [loaded, set] = useState(false);
    finish = set;
    return loaded ? h(TreeLoadFailure, { retry: () => calls.push('tree') }) : h(TreeLoading);
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  assert.equal(container.querySelector('[role=status]').getAttribute('aria-label'), 'Loading tree');
  assert.equal(container.querySelectorAll('.astryx-skeleton').length, 4);
  await act(async () => finish(true));
  assert.match(container.textContent, /Tree could not load/);
  await act(async () => button(container, 'Retry loading tree').click());
  assert.deepEqual(calls, ['tree']);
});
