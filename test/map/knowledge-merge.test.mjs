import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { button } from '../support/ui.mjs';
import { initial, setup, KnowledgeFixture as KnowledgePage } from '../support/knowledge-kit.mjs';

test('knowledge merge restores opener focus and retains the selected target after a failed write', async (t) => {
  let graph = {
      ...initial(),
      concepts: initial()
        .concepts.slice(0, 2)
        .map((c) => ({ ...c, topics: [] })),
      links: [],
    },
    dom,
    failMerge = true;
  const calls = [];
  const api = async (path, body) => {
    calls.push([path, body]);
    if (path.endsWith('/merge')) {
      if (failMerge) throw new Error('Write failed');
      graph = { ...graph, concepts: graph.concepts.filter((c) => c.name !== body.from), links: [] };
    }
    return graph;
  };
  const { container, act, cleanup } = await render(h(KnowledgePage, { api, activity: '' }), (w) => {
    dom = setup(w);
  });
  t.after(cleanup);
  const click = async (label, root = container) => {
    const b = button(root, label);
    assert.ok(b, label);
    await act(async () => {
      b.focus();
      b.click();
    });
  };
  await click('Merge Mutex…');
  await act(async () => document.querySelector('dialog button[aria-expanded]').click());
  const option = [...document.querySelectorAll('[role=option]')].find((e) =>
    e.textContent.includes('Mutual exclusion'),
  );
  assert.ok(option, document.querySelector('dialog').textContent);
  await act(async () => option.click());
  await click('Merge concepts', document);
  assert.match(document.querySelector('dialog [role=alert]').textContent, /Write failed/);
  assert.match(
    document.querySelector('dialog button[aria-expanded]').textContent,
    /Mutual exclusion/,
  );
  failMerge = false;
  await click('Merge concepts', document);
  await act(async () => dom.frames());
  assert.deepEqual(calls.at(-1), ['/api/graph/merge', { from: 'Mutex', into: 'Mutual exclusion' }]);
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(document.activeElement.dataset.concept, 'Mutual exclusion');
  assert.ok(
    [...container.querySelectorAll('[role=status]')].some((e) =>
      e.textContent.includes('Merged Mutex into Mutual exclusion'),
    ),
  );
});
