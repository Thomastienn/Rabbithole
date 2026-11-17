import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: ModelMenu } = await import('../../src/chat/ModelMenu.tsx');

// The effort dropdown sits beside the model button and changes effort through the model-change call.
const opus = {
  provider: 'claude',
  model: 'opus',
  label: 'Opus',
  isDefault: true,
  efforts: ['high'],
};
const model = (calls, composition = { provider: 'claude', model: 'opus', effort: null }) => ({
  composition,
  modelMenuOpen: false,
  openModels: async () => {},
  openingModels: false,
  savingModel: undefined,
  modelLabel: () => 'Claude · Opus',
  providers: { claude: { label: 'Claude', connected: true } },
  models: [opus],
  chooseModel: async (...args) => calls.push(args),
  signIn: async () => {},
  loadModels: async () => {},
  currentModel: opus,
});

// Items of the menu this trigger opened; the model menu's popover stays in the DOM while closed.
const items = (trigger) => [
  ...document
    .getElementById(trigger.getAttribute('aria-controls'))
    .querySelectorAll('[role=menuitemradio]'),
];

async function mount(t, props) {
  let dom;
  const page = await render(
    h(ModelMenu, { active: false, busy: false, openSettings() {}, setError() {}, ...props }),
    (w) => (dom = ui(w)),
  );
  t.after(page.cleanup);
  return { ...page, dom };
}

test('effort dropdown shows the effort, offers model efforts and chooses one in a click', async (t) => {
  const calls = [];
  const { container, act, dom } = await mount(t, { model: model(calls) });
  const models = button(container, 'Model for next reply');
  assert.match(models.textContent, /Claude · Opus/);
  assert.deepEqual(
    items(models).map((e) => e.textContent.trim()),
    ['Opus'],
    'the model menu lists only models',
  );
  const effort = button(container, 'Effort for next reply');
  assert.equal(effort.textContent.trim(), 'Provider default');
  await act(async () => effort.click());
  await act(async () => dom.frames());
  const options = items(effort);
  assert.deepEqual(
    options.map((e) => e.textContent.trim()),
    ['Provider default', 'High'],
  );
  await act(async () => options[1].click());
  assert.deepEqual(calls, [['claude', 'opus', 'high']]);
});

test('custom endpoints also offer Custom…', async (t) => {
  const custom = { ...opus, provider: 'openai:x', efforts: [] };
  const m = {
    ...model([], { provider: 'openai:x', model: 'opus', effort: null }),
    currentModel: custom,
  };
  const { container, act, dom } = await mount(t, { model: m });
  const effort = button(container, 'Effort for next reply');
  await act(async () => effort.click());
  await act(async () => dom.frames());
  assert.deepEqual(
    items(effort).map((e) => e.textContent.trim()),
    ['Provider default', 'Custom…'],
  );
});

test('a streaming reply disables the effort dropdown', async (t) => {
  const { container } = await mount(t, { model: model([]), active: true });
  assert.equal(button(container, 'Effort for next reply').getAttribute('aria-disabled'), 'true');
});
