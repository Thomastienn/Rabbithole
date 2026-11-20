import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { default: TutorToolsSettings } = await import('../../src/settings/TutorToolsSettings.tsx');

test('tutor tools section shows one switch per tool and saves each switch', async (t) => {
    let tools = [
        { name: 'web_search', label: 'Web search', enabled: true },
        { name: 'read_page', label: 'Read pages', enabled: true },
    ];
    const writes = [];
    const api = async (path, body) => {
        assert.equal(path, '/api/settings/tutor-tools');
        if (body) {
            writes.push(body);
            tools = tools.map((x) => (x.name === body.name ? { ...x, enabled: body.enabled } : x));
        }
        return tools;
    };
    const { container, act, cleanup } = await render(h(TutorToolsSettings, { api }), (w) => ui(w));
    t.after(cleanup);
    await act(async () => {});
    const switches = () => [...container.querySelectorAll('[role=switch]')];
    assert.deepEqual(
        switches().map((s) => [s.labels[0].textContent, s.checked]),
        [
            ['Web search', true],
            ['Read pages', true],
        ],
    );
    await act(async () => switches()[1].click());
    assert.deepEqual(writes, [{ name: 'read_page', enabled: false }]);
    assert.equal(switches()[1].checked, false);
    assert.equal(switches()[0].checked, true);
});
