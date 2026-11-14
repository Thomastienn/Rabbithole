import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { button } from '../support/ui.mjs';
import { initial, setup, KnowledgeFixture as KnowledgePage } from '../support/knowledge-kit.mjs';

test('knowledge loading, empty/error states and refresh ignore stale activity responses', async (t) => {
  const loads = [],
    calls = [];
  let update;
  function Fixture() {
    const [activity, set] = useState('first');
    update = set;
    return h(KnowledgePage, {
      activity,
      api: (path, body) => {
        calls.push([path, body]);
        const p = Promise.withResolvers();
        loads.push(p);
        return p.promise;
      },
    });
  }
  let dom;
  const { container, act, cleanup } = await render(h(Fixture), (w) => {
    dom = setup(w);
  });
  t.after(cleanup);
  assert.match(container.textContent, /Loading knowledge/);
  await act(async () => loads[0].reject(new Error('Read failed')));
  assert.match(container.querySelector('[role=alert]').textContent, /Read failed/);
  await act(async () => button(container, 'Refresh Knowledge').click());
  await act(async () => loads[1].resolve({ topics: [], concepts: [], links: [] }));
  assert.match(container.textContent, /No concepts yet/);
  await act(async () => update('second'));
  await act(async () => update('third'));
  await act(async () =>
    loads[3].resolve({ ...initial(), concepts: initial().concepts.slice(0, 2), links: [] }),
  );
  await act(async () => loads[2].resolve({ topics: [], concepts: [], links: [] }));
  assert.equal(container.querySelectorAll('[data-concept]').length, 2);
  assert.ok(calls.every(([p]) => p === '/api/graph'));
  const trigger = button(container, 'Merge Mutex…');
  await act(async () => {
    trigger.focus();
    trigger.click();
  });
  assert.ok(document.querySelector('dialog[open]'));
  assert.equal(button(document, 'Merge concepts').disabled, true);
  await act(async () => {
    button(document, 'Cancel merge').click();
    dom.frames();
  });
  assert.equal(document.querySelector('dialog[open]'), null);
  assert.equal(document.activeElement, trigger);
  await act(async () => button(container, 'I know this').click());
  assert.equal(button(container, 'I know this').disabled, true);
  assert.deepEqual(calls.at(-1), ['/api/graph/correct', { name: 'Mutex', kind: 'known' }]);
  const corrected = {
    ...initial(),
    concepts: initial()
      .concepts.slice(0, 2)
      .map((c) => (c.name === 'Mutex' ? { ...c, correction: 'known' } : c)),
    links: [],
  };
  await act(async () => loads[4].resolve(corrected));
  assert.equal(button(container, 'I know this').getAttribute('aria-pressed'), 'true');
  await act(async () => button(container, "I don't get this").click());
  assert.deepEqual(calls.at(-1), ['/api/graph/correct', { name: 'Mutex', kind: 'unknown' }]);
  await act(async () =>
    loads[5].resolve({
      ...corrected,
      concepts: corrected.concepts.map((c) =>
        c.name === 'Mutex' ? { ...c, correction: 'unknown' } : c,
      ),
    }),
  );
  assert.equal(button(container, "I don't get this").getAttribute('aria-pressed'), 'true');
});
