import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
import {
    CUSTOM_EFFORT,
    effortOptions,
    effortSupported,
    effortWasReset,
    keptEffort,
    typedEffort,
} from '../../src/settings/models.ts';
const { default: ChatSettings } = await import('../../src/settings/ChatSettings.tsx');

test('effort carries to a model only when offered; options add a disabled unavailable saved effort', () => {
    assert.equal(keptEffort('high', { efforts: ['low', 'high'] }), 'high');
    assert.equal(keptEffort('high', { efforts: [] }), null);
    assert.equal(keptEffort('high', undefined), null);
    assert.equal(keptEffort(null, { efforts: ['high'] }), null);
    assert.deepEqual(effortOptions(null, { provider: 'codex', efforts: ['low', 'xhigh'] }), [
        { value: 'default', label: 'Provider default' },
        { value: 'low', label: 'Low' },
        { value: 'xhigh', label: 'Extra high' },
    ]);
    const high = { provider: 'codex', model: 'chat', effort: 'high' };
    assert.equal(effortWasReset(high, { ...high, model: 'custom', effort: null }), true);
    assert.equal(effortWasReset(high, { ...high, provider: 'openai', effort: null }), true);
    assert.equal(effortWasReset(high, { ...high, effort: null }), false, 'cleared on purpose');
    assert.equal(
        effortWasReset({ ...high, effort: null }, { ...high, model: 'x', effort: null }),
        false,
    );
    assert.deepEqual(effortOptions('high', undefined), [
        { value: 'default', label: 'Provider default' },
        { value: 'high', label: 'High (unavailable)', disabled: true },
    ]);
});

test('Custom… is offered only for custom endpoint models, after advertised and remembered efforts', () => {
    const custom = { value: CUSTOM_EFFORT, label: 'Custom…' };
    assert.deepEqual(effortOptions(null, { provider: 'openai:gw', efforts: ['low', 'turbo'] }), [
        { value: 'default', label: 'Provider default' },
        { value: 'low', label: 'Low' },
        { value: 'turbo', label: 'Turbo' },
        custom,
    ]);
    // A saved typed effort not yet in a stale list stays selectable on an endpoint.
    assert.deepEqual(effortOptions('max_2', { provider: 'openai', efforts: [] }), [
        { value: 'default', label: 'Provider default' },
        { value: 'max_2', label: 'Max_2' },
        custom,
    ]);
    for (const provider of ['claude', 'codex'])
        assert.ok(!effortOptions(null, { provider, efforts: ['high'] }).some((o) => o === custom));
    assert.equal(effortSupported('turbo', { provider: 'openai:gw', efforts: [] }), true);
    assert.equal(effortSupported('turbo', { provider: 'codex', efforts: ['high'] }), false);
    assert.equal(effortSupported(null, { provider: 'codex', efforts: [] }), true);
});

test('typed efforts are trimmed and limited to 1-32 letters, digits, - or _', () => {
    for (const [text, effort] of [
        ['  high ', 'high'],
        ['Vendor_max-2', 'Vendor_max-2'],
        ['x'.repeat(32), 'x'.repeat(32)],
    ])
        assert.equal(typedEffort(text), effort);
    for (const text of ['', '   ', 'a b', 'bad!', 'é', 'x'.repeat(33), 'default', 'follow'])
        assert.equal(typedEffort(text), null, JSON.stringify(text));
});

const models = [
    { provider: 'claude', model: 'sonnet', label: 'Sonnet', isDefault: true, efforts: ['high'] },
    { provider: 'codex', model: 'chat', label: 'Codex chat', efforts: ['low', 'high'] },
    { provider: 'openai', model: 'custom', label: 'Custom chat' },
];
const providers = {
    claude: { label: 'Claude', connected: true },
    codex: { label: 'Codex', connected: true },
    openai: { label: 'Custom endpoint', connected: true },
};
const trigger = (container, index) => container.querySelectorAll('[aria-haspopup]')[index];
const shown = (button) => [
    ...document
        .getElementById(button.getAttribute('aria-controls'))
        .querySelectorAll('[role=option],[role=menuitemradio]'),
];
async function pick(container, dom, act, index, label) {
    const button = trigger(container, index);
    await act(async () => button.click());
    await act(async () => dom.frames());
    const options = shown(button);
    const option = options.find((e) => e.textContent.trim() === label);
    assert.ok(option, `${label} in ${options.map((e) => e.textContent)}`);
    await act(async () => option.click());
    return options.map((e) => e.textContent.trim());
}

test('chat defaults save model and effort, keep only offered efforts and flag unavailable saved defaults', async (t) => {
    let saved = { provider: 'claude', model: null, effort: null };
    const writes = [];
    const api = async (path, body) => {
        assert.equal(path, '/api/settings/chat');
        if (body) writes.push((saved = body));
        return saved;
    };
    let dom, update;
    function Fixture() {
        const [list, set] = useState(models);
        update = set;
        return h('div', { role: 'table' }, h(ChatSettings, { api, models: list, providers }));
    }
    const { container, act, cleanup } = await render(h(Fixture), (w) => {
        dom = ui(w);
    });
    t.after(cleanup);
    await act(async () => {});
    await pick(container, dom, act, 0, 'Codex chat');
    assert.deepEqual(writes.at(-1), { provider: 'codex', model: 'chat', effort: null });
    assert.match(container.textContent, /Chat defaults saved\. Existing conversations keep/);
    const efforts = await pick(container, dom, act, 1, 'High');
    assert.deepEqual(efforts, ['Provider default', 'Low', 'High']);
    assert.deepEqual(writes.at(-1), { provider: 'codex', model: 'chat', effort: 'high' });
    await pick(container, dom, act, 0, 'Custom chat');
    assert.deepEqual(writes.at(-1), { provider: 'openai', model: 'custom', effort: null });
    assert.match(container.textContent, /Effort changed to Provider default for this model/);
    await act(async () => trigger(container, 1).click());
    await act(async () => dom.frames());
    assert.deepEqual(
        shown(trigger(container, 1)).map((e) => e.textContent.trim()),
        ['Provider default', 'Custom…'],
        'an endpoint model without advertised efforts offers Provider default and Custom…',
    );
    assert.equal(container.querySelector('[role=alert]'), null);
    // The saved custom model disappears (endpoint disconnected): the choice is kept and flagged.
    await act(async () => update(models.slice(0, 2)));
    assert.match(
        container.querySelector('[role=alert]').textContent,
        /Saved chat default unavailable/,
    );
    assert.equal(writes.length, 3, 'nothing rewritten while unavailable');
});

test('a fresh install shows Not set for chat and the smart role that follows it, without an unavailable alert', async (t) => {
    const { default: SmartSettings } = await import('../../src/settings/SmartSettings.tsx');
    const unset = { provider: null, model: null, effort: null };
    const api = async (path) =>
        path === '/api/settings/chat'
            ? unset
            : { model: null, followEffort: true, effort: null, resolved: unset };
    const { container, act, cleanup } = await render(
        h(
            'div',
            { role: 'table' },
            h(ChatSettings, { api, models, providers }),
            h(SmartSettings, { api, models, providers }),
        ),
        ui,
    );
    t.after(cleanup);
    await act(async () => {});
    const [chat, , smart] = container.querySelectorAll('[aria-haspopup]');
    assert.equal(chat.textContent.trim(), 'Not set');
    assert.equal(smart.textContent.trim(), 'Follow chat default (Not set)');
    assert.equal(container.querySelector('[role=alert]'), null);
});

test('Custom… reveals a field that saves a trimmed typed effort and rejects invalid text', async (t) => {
    let saved = { provider: 'openai', model: 'custom', effort: null };
    const writes = [];
    const api = async (path, body) => {
        if (body) writes.push((saved = body));
        return saved;
    };
    let dom;
    const { container, act, cleanup } = await render(
        h('div', { role: 'table' }, h(ChatSettings, { api, models, providers })),
        (w) => {
            dom = ui(w);
        },
    );
    t.after(cleanup);
    await act(async () => {});
    await pick(container, dom, act, 1, 'Custom…');
    const input = () => container.querySelector('.custom-effort input');
    assert.ok(input(), 'custom effort field shown');
    assert.equal(writes.length, 0, 'choosing Custom… alone saves nothing');
    await act(async () => inputValue(input(), 'bad value!'));
    await act(async () => button(container, 'Use effort').click());
    assert.match(container.textContent, /Use 1–32 letters, digits, - or _/);
    assert.equal(writes.length, 0);
    await act(async () => inputValue(input(), '  vendor_max '));
    await act(async () => button(container, 'Use effort').click());
    assert.deepEqual(writes.at(-1), { provider: 'openai', model: 'custom', effort: 'vendor_max' });
    assert.equal(button(container, 'Use effort'), undefined, 'field closes after saving');
    assert.equal(trigger(container, 1).textContent.trim(), 'Vendor_max');
    assert.equal(container.querySelector('[role=alert]'), null, 'a typed effort is never flagged');
});
