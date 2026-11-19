import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const {
  default: SuggestionSettings,
  ConceptCost,
  AutomaticSuggestions,
} = await import('../../src/settings/SuggestionSettings.tsx');

test('suggestion settings toggle globally, save a pinned quick model and warn only above 2000 name tokens', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let update, dom;
  let saved = { enabled: true, model: null, effort: null };
  const writes = [];
  const api = async (path, body) => {
    assert.equal(path, '/api/settings/suggestions');
    if (body) {
      writes.push(body);
      saved = { ...saved, ...body };
    }
    return saved;
  };
  function Fixture() {
    const [tokens, set] = useState(2000);
    update = set;
    return h(
      'div',
      null,
      h(AutomaticSuggestions, { api }),
      h(
        'div',
        { role: 'table' },
        h(SuggestionSettings, {
          api,
          models: [{ provider: 'codex', model: 'other', label: 'Fixture alternate', efforts: [] }],
          providers: { codex: { label: 'Codex', connected: true } },
        }),
      ),
      h(ConceptCost, { tokens }),
    );
  }
  const { container, act, cleanup } = await render(h(Fixture), (w) => {
    dom = ui(w);
  });
  t.after(cleanup);
  const toggle = container.querySelector('[role=switch]');
  assert.equal(toggle.checked, true);
  assert.ok(toggle.labels[0], 'the switch is labelled');
  for (const value of [false, true]) {
    await act(async () => toggle.click());
    assert.equal(toggle.checked, value);
    assert.deepEqual(writes.at(-1), { enabled: value });
  }
  assert.match(container.textContent, /Concept matching cost is within the normal range/);
  await act(async () => update(2501));
  assert.match(container.textContent, /Warning: concept matching is getting expensive/);
  assert.match(container.textContent, /2,501 tokens of concept names/);
  const model = container.querySelector('[aria-label="Quick thinking model"]');
  assert.ok(model);
  await act(async () => model.click());
  await act(async () => dom.frames());
  const option = [...document.querySelectorAll('[role=option],[role=menuitemradio]')].find((e) =>
    e.textContent.includes('Fixture alternate'),
  );
  assert.ok(option);
  await act(async () => option.click());
  assert.deepEqual(writes.at(-1), { model: { provider: 'codex', model: 'other' }, effort: null });
  assert.match(
    [...container.querySelectorAll('[role=status]')].map((e) => e.textContent).join(' '),
    /Quick thinking settings saved/,
  );
});
