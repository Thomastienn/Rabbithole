import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: ModelProfiles } = await import('../../src/settings/ModelProfiles.tsx');
const { default: ChatSettings } = await import('../../src/settings/ChatSettings.tsx');
const { default: SmartSettings, VideoMode } = await import('../../src/settings/SmartSettings.tsx');
const { default: SuggestionSettings } = await import('../../src/settings/SuggestionSettings.tsx');

const models = [
    { provider: 'claude', model: 'chat', label: 'Claude chat', isDefault: true, efforts: ['high'] },
    {
        provider: 'codex',
        model: 'chat',
        label: 'Codex chat',
        efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    },
    { provider: 'openai', model: 'chat', label: 'Custom chat', efforts: ['low', 'high'] },
    { provider: 'openai', model: 'plain', label: 'Custom plain' },
];
const providers = {
    claude: { label: 'Claude', connected: true },
    codex: { label: 'Codex', connected: true },
    openai: { label: 'Custom endpoint', connected: true },
};

// In-memory stand-in for the profile and role routes (their persistence is tested in test/store/profiles.test.mjs).
function server() {
    const roles = () => ({
        chat: { provider: 'claude', model: null, effort: null },
        smart: { model: null, followEffort: true, effort: null },
        quick: { enabled: true, model: null, effort: null },
    });
    let next = 1;
    const state = { active: 'p1', profiles: [{ id: 'p1', name: 'Default', ...roles() }] };
    const active = () => state.profiles.find((p) => p.id === state.active);
    const add = (name, from) => {
        if (state.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase()))
            throw new Error(`A profile named “${name}” already exists. Choose another name.`);
        state.profiles.push({ ...structuredClone(from), id: `p${++next}`, name });
    };
    const list = () => ({
        active: state.active,
        profiles: state.profiles.map((p) => ({
            id: p.id,
            name: p.name,
            chat: p.chat,
            smart: { model: p.smart.model },
            quick: { model: p.quick.model },
        })),
    });
    const smart = () => {
        const { chat, smart } = active();
        return {
            ...smart,
            resolved: {
                provider: smart.model?.provider ?? chat.provider,
                model: smart.model ? smart.model.model : chat.model,
                effort: smart.followEffort ? chat.effort : smart.effort,
            },
        };
    };
    async function api(path, body) {
        const p = active();
        if (path === '/api/settings/chat') return body ? (p.chat = body) : p.chat;
        if (path === '/api/settings/smart') return (body && Object.assign(p.smart, body), smart());
        if (path === '/api/settings/suggestions')
            return body ? Object.assign(p.quick, body) : p.quick;
        if (path === '/api/profiles' && body) add(body.name, roles());
        if (path === '/api/profiles/active') state.active = body.id;
        const [, id, action] = path.match(/^\/api\/profiles\/([^/]+)\/(\w+)$/) ?? [];
        if (action === 'rename') {
            if (state.profiles.some((o) => o.id !== id && o.name === body.name))
                throw new Error('taken');
            p.name = body.name;
        }
        if (action === 'duplicate') add(`${p.name} copy`, p);
        if (action === 'delete') {
            state.profiles = state.profiles.filter((o) => o.id !== id);
            state.active = state.profiles[0].id;
        }
        return list();
    }
    return { api, state, active };
}

function Roles({ onActivated = () => {} }) {
    const [chatVersion, setChat] = useState(0),
        [rolesVersion, setRoles] = useState(0);
    return h(
        ModelProfiles,
        {
            models,
            providers,
            modelError: '',
            reloadModels: async () => {},
            connections: () => {},
            version: rolesVersion,
            onActivated,
        },
        h(ChatSettings, {
            models,
            providers,
            onSaved: () => {
                setChat((v) => v + 1);
                setRoles((v) => v + 1);
            },
        }),
        h(SmartSettings, {
            models,
            providers,
            chatVersion,
            onSaved: () => setRoles((v) => v + 1),
        }),
        h(SuggestionSettings, { models, providers, onSaved: () => setRoles((v) => v + 1) }),
    );
}

const named = (e) =>
    e.getAttribute('aria-label') ||
    (e.getAttribute('aria-labelledby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim() ||
    [...(e.labels ?? [])].map((l) => l.textContent).join(' ');

test('one role table per profile: smart follows chat until pinned, quick thinking offers advertised efforts, profiles swap, rename, duplicate and delete', async (t) => {
    const fake = server();
    // A second profile whose quick thinking model was retired.
    fake.state.profiles.push({
        ...structuredClone(fake.active()),
        id: 'deep',
        name: 'Deep study',
        quick: { enabled: true, model: { provider: 'openai', model: 'retired' }, effort: null },
    });
    let dom;
    const activated = [];
    const onActivated = (chat) => activated.push(chat);
    fakeServer(t, fake.api);
    const { container, act, cleanup } = await render(h(Roles, { onActivated }), (w) => {
        dom = ui(w);
    });
    t.after(cleanup);
    const settle = () => act(async () => dom.frames());
    await settle();
    const trigger = (label) =>
        [...container.querySelectorAll('[aria-haspopup]')].find((e) => named(e).startsWith(label));
    const options = (label) => [
        ...document
            .getElementById(trigger(label).getAttribute('aria-controls'))
            .querySelectorAll('[role=option],[role=menuitemradio]'),
    ];
    const open = async (label) => {
        await act(async () => trigger(label).click());
        await settle();
        return options(label);
    };
    // Five options or fewer show as buttons, more as a dropdown.
    const group = (label) => container.querySelector(`[role=radiogroup][aria-label="${label}"]`);
    const radios = (label) => [...group(label).querySelectorAll('[role=radio]')];
    const choose = async (label, option) => {
        const found = (group(label) ? radios(label) : await open(label)).find((e) =>
            e.textContent.trim().startsWith(option),
        );
        assert.ok(found, `${option} in ${label}`);
        await act(async () => found.click());
        await settle();
    };
    const table = () => container.querySelector('[role=table]');
    const menu = async (item) => {
        await act(async () =>
            button(container, 'Profile actions: rename, duplicate, delete').click(),
        );
        await settle();
        const items = [...document.querySelectorAll('[role=menuitem]')];
        return item
            ? act(async () => items.find((e) => e.textContent.includes(item)).click())
            : items;
    };
    const nameField = () =>
        [...container.querySelectorAll('input')].find((i) => named(i) === 'Profile name');

    assert.deepEqual(
        [...table().querySelectorAll('[role=rowheader] b')].map((b) => b.textContent),
        ['Chat', 'Smart', 'Quick thinking'],
    );
    assert.equal(table().getAttribute('aria-label'), 'Roles in Default');

    assert.deepEqual(
        radios('Chat default effort').map((e) => e.textContent.trim()),
        ['Provider default', 'High'],
    );
    assert.ok(trigger('Model profile') && trigger('Chat default model'), 'lists stay dropdowns');
    await choose('Chat default model', 'Codex chat');
    assert.equal(group('Chat default effort'), null, 'six effort options show as a dropdown');
    await choose('Chat default effort', 'High');
    assert.match(trigger('Smart model').textContent, /Follow chat default \(Codex chat\)/);
    assert.match(trigger('Smart effort').textContent, /Follow chat default \(High\)/);

    // Pinning smart effort keeps following the chat model; pinning the model never changes chat.
    await choose('Smart effort', 'Low');
    await choose('Chat default model', 'Claude chat');
    assert.match(trigger('Smart model').textContent, /Follow chat default \(Claude chat\)/);
    await choose('Smart model', 'Custom chat');
    assert.deepEqual(fake.active().smart, {
        model: { provider: 'openai', model: 'chat' },
        followEffort: false,
        effort: 'low',
    });
    assert.deepEqual(fake.active().chat, { provider: 'claude', model: 'chat', effort: 'high' });

    await choose('Quick thinking model', 'Custom plain');
    assert.deepEqual(
        radios('Quick thinking effort').map((e) => e.textContent.trim()),
        ['Provider default', 'Custom…'],
        'an endpoint model without listed efforts offers Provider default and Custom…',
    );
    await choose('Quick thinking effort', 'Custom…');
    assert.ok(
        [...container.querySelectorAll('input')].some(
            (i) => named(i) === 'Custom quick thinking effort',
        ),
        'Custom… opens the typed effort field',
    );
    await act(async () => button(container, 'Cancel').click());
    await choose('Quick thinking model', 'Custom chat');
    await choose('Quick thinking effort', 'High');
    assert.deepEqual(fake.active().quick, {
        enabled: true,
        model: { provider: 'openai', model: 'chat' },
        effort: 'high',
    });

    // The retired model swaps in flagged, never replaced.
    const listed = (await open('Model profile')).map((e) => e.textContent);
    assert.ok(
        listed.some((o) => o.startsWith('Deep study') && o.includes('retired (unavailable)')),
        listed.join(' | '),
    );
    await act(async () =>
        options('Model profile')
            .find((e) => e.textContent.startsWith('Deep study'))
            .click(),
    );
    await settle();
    assert.equal(table().getAttribute('aria-label'), 'Roles in Deep study');
    assert.deepEqual(
        activated,
        [fake.active().chat],
        'the open conversation gets the chat default',
    );
    assert.match(container.textContent, /Quick thinking model unavailable/);
    assert.deepEqual(fake.active().quick.model, { provider: 'openai', model: 'retired' });
    await choose('Model profile', 'Default');
    assert.equal(table().getAttribute('aria-label'), 'Roles in Default');
    assert.doesNotMatch(container.textContent, /Quick thinking model unavailable/);

    // New profile: the picker becomes a name field; a duplicate is rejected; a new name copies and activates.
    await act(async () => button(container, 'New profile').click());
    assert.equal(trigger('Model profile'), undefined);
    await act(async () => inputValue(nameField(), 'deep STUDY'));
    await act(async () => button(container, 'Save').click());
    assert.match(container.querySelector('[role=alert]').textContent, /already exists/);
    await act(async () => inputValue(nameField(), 'Offline'));
    await act(async () => button(container, 'Save').click());
    await settle();
    assert.equal(table().getAttribute('aria-label'), 'Roles in Offline');

    // Rename prefills the name and Escape cancels without leaving the page.
    await menu('Rename');
    assert.equal(nameField().value, 'Offline');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    await act(async () => nameField().dispatchEvent(escape));
    assert.equal(nameField(), undefined);
    assert.ok(trigger('Model profile'));
    await menu('Rename');
    await act(async () => inputValue(nameField(), 'Local'));
    await act(async () => button(container, 'Save').click());
    await settle();
    assert.equal(table().getAttribute('aria-label'), 'Roles in Local');
    await menu('Duplicate');
    await settle();
    assert.equal(table().getAttribute('aria-label'), 'Roles in Local copy');
    assert.deepEqual(
        fake.state.profiles.map((p) => p.name),
        ['Default', 'Deep study', 'Local', 'Local copy'],
    );

    for (const name of ['Local copy', 'Default', 'Deep study']) {
        await menu(`Delete ${name}`);
        await settle();
        assert.notEqual(table().getAttribute('aria-label'), `Roles in ${name}`);
    }
    assert.deepEqual(
        fake.state.profiles.map((p) => p.name),
        ['Local'],
    );
    const last = (await menu()).find((e) => e.textContent.includes('Delete Local'));
    assert.match(last.textContent, /Keep at least one profile/);
    assert.equal(last.getAttribute('aria-disabled'), 'true');
});

test('Video mode shows Quality by default and saves Saving', async (t) => {
    let dom,
        mode = 'quality';
    const writes = [];
    fakeServer(t, async (path, body) => {
        assert.equal(path, '/api/settings/video-mode');
        if (body) {
            writes.push(body);
            mode = body.mode;
        }
        return { mode };
    });
    const { container, act, cleanup } = await render(h(VideoMode), (w) => {
        dom = ui(w);
    });
    t.after(cleanup);
    const settle = () => act(async () => dom.frames());
    await settle();
    const checked = () =>
        container.querySelector('[role=radiogroup][aria-label="Video mode"] [aria-checked=true]')
            .textContent;
    assert.match(checked(), /Quality/);
    const saving = [...container.querySelectorAll('[role=radio]')].find((e) =>
        e.textContent.trim().startsWith('Saving'),
    );
    await act(async () => saving.click());
    await settle();
    assert.deepEqual(writes, [{ mode: 'saving' }]);
    assert.match(checked(), /Saving/);
});
