import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { button } from '../support/ui.mjs';
import { initial, setup, KnowledgeFixture as KnowledgePage } from '../support/knowledge-kit.mjs';
import { fakeServer } from '../support/fake-server.mjs';

test('knowledge loading, empty/error states and refresh ignore stale activity responses', async (t) => {
    const loads = [],
        calls = [];
    let update;
    function Fixture() {
        const [activity, set] = useState('first');
        update = set;
        return h(KnowledgePage, { activity });
    }
    fakeServer(t, (path, body) => {
        calls.push([path, body]);
        const p = Promise.withResolvers();
        loads.push(p);
        return p.promise;
    });
    const { container, act, cleanup } = await render(h(Fixture), setup);
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
    assert.equal(button(container, 'Merge concepts'), undefined, 'merges are automatic');
    assert.equal(button(container, 'I know this'), undefined, 'no correction controls');
});
