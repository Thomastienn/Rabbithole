import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
const { default: EndpointSettings } = await import('../../src/settings/EndpointSettings.tsx');

test('endpoint settings add, reject duplicates, show failed tests, guard URL edits and confirm removal', async (t) => {
    const at = new Date().toISOString();
    let list = [
        {
            id: 'openai',
            name: 'Custom endpoint',
            baseUrl: 'http://a/v1',
            lastTest: null,
        },
    ];
    const calls = [];
    const api = async (path, body) => {
        if (body) calls.push([path, body]);
        if (path === '/api/settings/searxng') return { ready: false, url: null, customUrl: null };
        if (path === '/api/downloads/searxng') return [];
        if (path === '/api/settings/endpoints' && body) {
            if (list.some((e) => e.name.toLowerCase() === body.name.toLowerCase()))
                throw new Error(
                    `Another endpoint is called ${body.name}. Choose a different name.`,
                );
            list = [
                ...list,
                {
                    id: 'openai:gw',
                    name: body.name,
                    baseUrl: body.baseUrl,
                    lastTest: null,
                },
            ];
        }
        if (path.endsWith('/test'))
            list = list.map((e) =>
                e.id === body.id
                    ? {
                          ...e,
                          lastTest:
                              calls.filter(([p]) => p.endsWith('/test')).length === 1
                                  ? { ok: false, error: 'Work gateway rejected the API key.', at }
                                  : { ok: true, models: 1, at },
                      }
                    : e,
            );
        if (path.endsWith('/edit'))
            list = list.map((e) => (e.id === body.id ? { ...e, name: body.name } : e));
        if (path.endsWith('/remove')) list = list.filter((e) => e.id !== body.id);
        return list;
    };
    let changed = 0;
    const { container, act, cleanup } = await render(
        h(EndpointSettings, { api, changed: () => changed++ }),
        ui,
    );
    t.after(cleanup);
    await act(async () => {});
    const row = (id) => container.querySelector(`.endpoint-row[data-endpoint="${id}"]`);
    const field = (label) =>
        [...container.querySelectorAll('.endpoint-form input')].find((i) =>
            i.labels?.[0]?.textContent.startsWith(label),
        );
    const submit = () => act(async () => container.querySelector('.endpoint-form').requestSubmit());
    assert.match(row('openai').textContent, /Custom endpoint.*http:\/\/a\/v1.*Not tested/);

    await act(async () => button(container, 'Add endpoint').click());
    assert.equal(
        container.querySelector('.endpoint-form').getAttribute('aria-label'),
        'New endpoint',
    );
    assert.equal(field('API key').type, 'password');
    await act(async () => {
        inputValue(field('Name'), 'custom endpoint');
        inputValue(field('Base URL'), 'http://gw/v1');
        inputValue(field('API key'), 'secret');
    });
    await submit();
    assert.match(
        container.textContent,
        /Another endpoint is called custom endpoint\. Choose a different name\./,
    );
    assert.equal(field('API key').value, '', 'the key is cleared after a rejected save');
    await act(async () => {
        inputValue(field('Name'), 'Work gateway');
        inputValue(field('API key'), 'secret');
    });
    // The form no longer offers the endpoint-wide Accepts images switch; reads images is per model.
    assert.equal(container.querySelector('.endpoint-form [role=switch]'), null);
    await submit();
    assert.deepEqual(calls.at(-1), [
        '/api/settings/endpoints',
        { name: 'Work gateway', baseUrl: 'http://gw/v1', apiKey: 'secret' },
    ]);
    assert.equal(container.querySelector('.endpoint-form'), null, 'the form closes after saving');
    assert.match(
        container.textContent,
        /Work gateway added\. Choose its models in any model menu\./,
    );
    assert.ok(!container.innerHTML.includes('secret'), 'the key is never shown');
    // Adding an endpoint while web search is unavailable offers its download.
    assert.match(container.textContent, /Most endpoints cannot search the web/);
    await act(async () => button(container, 'Download web search').click());
    assert.deepEqual(calls.at(-1), ['/api/downloads/searxng', {}]);
    assert.match(container.textContent, /Web search is downloading\. Follow it in Downloads\./);
    assert.equal(container.querySelector('.endpoint-search-offer'), null);

    // A failed test stays on the row, is announced and offers Test again.
    await act(async () => button(container, 'Test Work gateway').click());
    assert.match(
        row('openai:gw').querySelector('[role=alert]').textContent,
        /^Test failed · Work gateway rejected the API key\. · today/,
    );
    assert.ok(button(row('openai:gw'), 'Test Work gateway again'));

    // Edit: a URL change warns and needs the key; restoring it (trailing slash ignored) clears that.
    await act(async () => button(container, 'Edit Work gateway').click());
    assert.equal(field('API key').value, '');
    const save = () => button(container.querySelector('.endpoint-form'), 'Save');
    await act(async () => inputValue(field('Base URL'), 'http://a/v1'));
    assert.match(container.textContent, /URL changed: enter the key again/);
    assert.equal(save().disabled, true, 'Save waits for the key');
    await act(async () => {
        inputValue(field('Base URL'), 'http://gw/v1/');
        inputValue(field('Name'), 'Team gateway');
    });
    assert.doesNotMatch(container.textContent, /URL changed/);
    assert.equal(save().disabled, false);
    await submit();
    assert.deepEqual(calls.slice(-2), [
        [
            '/api/settings/endpoints/edit',
            { id: 'openai:gw', name: 'Team gateway', baseUrl: 'http://gw/v1/' },
        ],
        ['/api/settings/endpoints/test', { id: 'openai:gw' }],
    ]);
    assert.match(row('openai:gw').textContent, /Team gateway.*1 model listed · tested today/);
    assert.equal(row('openai:gw').querySelector('[role=alert]'), null, 'saving clears the failure');

    // Remove asks first; Cancel keeps the endpoint; confirming removes only that one.
    const dialog = () => document.querySelector('.endpoint-remove-dialog');
    await act(async () => button(container, 'Remove Team gateway').click());
    assert.match(
        dialog().textContent,
        /Remove Team gateway\?.*Its saved key is deleted\..*keep their content/,
    );
    await act(async () => button(dialog(), 'Cancel').click());
    assert.equal(dialog(), null);
    assert.equal(list.length, 2);
    await act(async () => button(container, 'Remove Team gateway').click());
    await act(async () => button(dialog(), 'Remove').click());
    assert.deepEqual(
        list.map((e) => e.name),
        ['Custom endpoint'],
    );
    assert.match(
        container.textContent,
        /Team gateway removed\. Conversations that used it keep their content\./,
    );

    await act(async () => button(container, 'Remove Custom endpoint').click());
    await act(async () => button(dialog(), 'Remove').click());
    assert.match(container.textContent, /No custom endpoints yet/);
    assert.ok(changed > 0, 'every change notifies the model menus');
});

test('each endpoint lists its models; search filters hundreds and Reads images saves per model', async (t) => {
    const { useState } = await import('react');
    const list = [{ id: 'openai:gw', name: 'Gateway', baseUrl: 'http://gw/v1', lastTest: null }];
    let models = [
        ...Array.from({ length: 300 }, (_, i) => ({
            provider: 'openai:gw',
            model: `model-${i}`,
            label: `model-${i}`,
            readsImages: i % 2 === 0,
        })),
        { provider: 'claude', model: 'sonnet', label: 'Sonnet', readsImages: true },
    ];
    const calls = [];
    const api = async (path, body) => {
        if (path === '/api/settings/endpoints/model') {
            calls.push(body);
            models = models.map((m) =>
                m.provider === body.id && m.model === body.model
                    ? { ...m, ...body, id: undefined }
                    : m,
            );
            return body;
        }
        if (path === '/api/settings/endpoints/model/retest') {
            calls.push({ retest: body });
            models = models.map((m) =>
                m.provider === body.id && m.model === body.model
                    ? { ...m, usesTutorTools: false }
                    : m,
            );
            return body;
        }
        return list;
    };
    let reload;
    function Harness() {
        const [shown, setShown] = useState(models);
        reload = async () => setShown(models);
        return h(EndpointSettings, { api, models: shown, changed: () => reload() });
    }
    const { container, act, cleanup } = await render(h(Harness), ui);
    t.after(cleanup);
    await act(async () => {});
    assert.equal(container.querySelector('.endpoint-models'), null, 'the list starts closed');
    await act(async () => button(container, 'Show Gateway models').click());
    const panel = () => container.querySelector('.endpoint-models');
    // Each model row also has a Uses tutor tools switch; this test covers Reads images.
    const switches = () =>
        [...panel().querySelectorAll('[role=switch]')].filter((s) =>
            /Reads images/.test(s.labels[0].textContent),
        );
    assert.equal(switches().length, 50, 'only the first rows render');
    assert.match(panel().textContent, /Showing 50 of 300 models\. Search to narrow\./);
    assert.doesNotMatch(panel().textContent, /Sonnet/, 'other providers stay out');

    const search = panel().querySelector('input:not([role=switch])');
    await act(async () => inputValue(search, 'model-29'));
    assert.deepEqual(
        switches()
            .slice(0, 11)
            .map((s) => s.labels[0].textContent.match(/model-\d+/)[0]),
        ['model-29', ...Array.from({ length: 10 }, (_, i) => `model-${290 + i}`)],
        'contiguous matches come before fuzzy ones such as model-129',
    );
    assert.match(panel().textContent, /21 models/);
    const target = () => switches().find((s) => /model-290/.test(s.labels[0].textContent));
    assert.equal(target().checked, true);
    await act(async () => target().click());
    assert.deepEqual(calls, [{ id: 'openai:gw', model: 'model-290', readsImages: false }]);
    assert.equal(target().checked, false, 'the reloaded list shows the saved choice');
    const tools = () =>
        [...panel().querySelectorAll('[role=switch]')].find((s) =>
            /model-290 · Uses tutor tools/.test(s.labels[0].textContent),
        );
    assert.equal(tools().checked, false);
    await act(async () => tools().click());
    assert.deepEqual(calls.at(-1), { id: 'openai:gw', model: 'model-290', usesTutorTools: true });
    assert.equal(tools().checked, true, 'the tool toggle saves on its own');
    assert.equal(target().checked, false);
    await act(async () => button(panel(), 'Retest model-290 tool support').click());
    assert.deepEqual(calls.at(-1), { retest: { id: 'openai:gw', model: 'model-290' } });
    assert.equal(tools().checked, false, 'the reloaded list shows the retest result');

    await act(async () => inputValue(search, 'nothing-like-this'));
    assert.match(panel().textContent, /No models match\./);
    await act(async () => button(container, 'Hide Gateway models').click());
    assert.equal(panel(), null);
});

// Adds one endpoint while /api/settings/searxng answers `search`; returns the page and the POSTed paths.
async function addGateway(t, search) {
    let list = [];
    const calls = [];
    const api = async (path, body) => {
        if (body) calls.push(path);
        if (path === '/api/settings/searxng') return search;
        if (body)
            list = [{ id: 'openai:gw', name: body.name, baseUrl: body.baseUrl, lastTest: null }];
        return list;
    };
    const { container, act, cleanup } = await render(
        h(EndpointSettings, { api, changed() {} }),
        ui,
    );
    t.after(cleanup);
    await act(async () => {});
    await act(async () => button(container, 'Add endpoint').click());
    const field = (label) =>
        [...container.querySelectorAll('.endpoint-form input')].find((i) =>
            i.labels?.[0]?.textContent.startsWith(label),
        );
    await act(async () => {
        inputValue(field('Name'), 'Gateway');
        inputValue(field('Base URL'), 'http://gw/v1');
        inputValue(field('API key'), 'secret');
    });
    await act(async () => container.querySelector('.endpoint-form').requestSubmit());
    assert.match(container.textContent, /Gateway added/);
    return { container, act, calls };
}

test('declining the web search offer keeps the endpoint and queues nothing', async (t) => {
    const { container, act, calls } = await addGateway(t, { ready: false, customUrl: null });
    await act(async () => button(container, 'Not now').click());
    assert.equal(container.querySelector('.endpoint-search-offer'), null);
    assert.deepEqual(calls, ['/api/settings/endpoints']);
});

test('no web search offer when search already works', async (t) => {
    const { container } = await addGateway(t, { ready: true, customUrl: null });
    assert.equal(container.querySelector('.endpoint-search-offer'), null);
});
