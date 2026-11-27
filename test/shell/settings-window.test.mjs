import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: SettingsWindow } = await import('../../src/settings/SettingsWindow.tsx');

test('opening Settings at a section scrolls to it; switching pages focuses the heading without scrolling', async (t) => {
    fakeServer(t, () => ({ first: null, events: [] }));
    const scrolls = [];
    let dom, open;
    // The app mounts Settings closed and opens it by passing a new request.
    function Fixture() {
        const [request, setRequest] = useState();
        open = setRequest;
        return h(SettingsWindow, {
            request,
            close() {},
            modelError: '',
            async loadModels() {},
            profileActivated() {},
            async signIn() {},
            vim: false,
            setVim() {},
            appearance: 'light',
            setAppearance() {},
            theme: 'main',
            setTheme() {},
        });
    }
    const page = await render(h(Fixture), (w) => {
        dom = ui(w);
        w.Element.prototype.scrollIntoView = function () {
            scrolls.push(this.id);
        };
    });
    t.after(page.cleanup);
    await page.act(async () => open({ tab: 'usage' }));
    await page.act(async () => dom.frames());
    assert.deepEqual(scrolls, ['settings-section-usage']);
    assert.equal(document.activeElement.id, 'settings-section-usage');
    for (const tab of ['interface', 'usage']) {
        await page.act(async () => document.getElementById(`settings-${tab}`).click());
        await page.act(async () => dom.frames());
        assert.equal(document.activeElement.id, `settings-section-${tab}`);
    }
    assert.deepEqual(scrolls, ['settings-section-usage'], 'nav switches never scroll');
});

const settings = (version) =>
    h(SettingsWindow, {
        request: {},
        version,
        close() {},
        modelError: '',
        async loadModels() {},
        profileActivated() {},
        async signIn() {},
        vim: false,
        setVim() {},
        appearance: 'light',
        setAppearance() {},
        theme: 'main',
        setTheme() {},
    });

test('Settings shows the running version in a browser without update controls', async (t) => {
    fakeServer(t, () => ({ first: null, events: [] }));
    const { container, cleanup } = await render(settings('1.0.198'), ui);
    t.after(cleanup);
    const foot = container.querySelector('.settings-foot');
    assert.equal(foot.textContent, 'Rabbithole 1.0.198');
    assert.equal(foot.querySelector('button'), null);
});

test('desktop Settings shows the update state and can apply an update without the sidebar', async (t) => {
    fakeServer(t, () => ({ first: null, events: [] }));
    let listener;
    const asked = [];
    const page = await render(settings('1.0.198'), (w) => {
        ui(w);
        w.rabbitholeDesktop = {
            update: async (action) => (asked.push(action), null),
            onUpdate: (next) => ((listener = next), () => {}),
        };
    });
    t.after(page.cleanup);
    const foot = page.container.querySelector('.settings-foot');
    assert.equal(foot.textContent, 'Rabbithole 1.0.198', 'a failed check adds nothing');
    const push = (update) => page.act(async () => listener(update));
    await push({ stage: 'current', version: '1.0.198', current: '1.0.198' });
    assert.equal(foot.textContent, 'Rabbithole 1.0.198 · Up to date');
    assert.equal(foot.querySelector('button'), null);
    const newer = { version: '1.0.214', current: '1.0.198' };
    await push({ ...newer, stage: 'available' });
    assert.match(foot.textContent, /^Rabbithole 1\.0\.198 · Latest is 1\.0\.214/);
    await page.act(async () => button(foot, 'Update').click());
    assert.equal(asked.at(-1), 'install', 'Update installs like the banner');
    await push({ ...newer, stage: 'ready' });
    await page.act(async () => button(foot, 'Restart to update').click());
    assert.equal(asked.at(-1), 'restart');
});

test('Connections offers Install and the shown command for a missing CLI, beside the ChatGPT sign-in', async (t) => {
    const calls = fakeServer(t, (path) => (path === '/api/settings/endpoints' ? [] : {}));
    const sources = [];
    globalThis.EventSource = class {
        constructor(url) {
            this.url = url;
            sources.push(this);
        }
        close() {
            this.closed = true;
        }
    };
    t.after(() => delete globalThis.EventSource);
    let checks = 0;
    const command =
        'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"';
    const page = await render(
        h(SettingsWindow, {
            ...settings().props,
            async loadModels() {
                checks++;
            },
            providers: {
                claude: { label: 'Claude', connected: true, installed: true },
                codex: { label: 'Codex', connected: false, installed: false, command },
            },
        }),
        ui,
    );
    t.after(page.cleanup);
    const tab = (name) => page.act(async () => document.getElementById(`settings-${name}`).click());
    const section = () =>
        page.container.querySelector('[aria-labelledby="settings-section-connections"]');
    const source = () => sources.at(-1);
    const row = (state) =>
        page.act(async () =>
            source().onmessage({ data: JSON.stringify([{ id: 'codex', state }]) }),
        );
    await tab('connections');
    assert.ok(section().textContent.includes(command));
    assert.equal(
        button(section(), 'Install Claude Code'),
        undefined,
        'an installed CLI offers none',
    );
    assert.ok(button(section(), 'Continue with ChatGPT'));
    await page.act(async () => button(section(), 'Install Codex').click());
    assert.ok(calls.some((c) => c.path === '/api/downloads/install/codex'));
    await row('running');
    const first = source();
    await tab('interface');
    assert.ok(first.closed);
    await tab('connections');
    await row('running');
    assert.ok(section().querySelector('[role="progressbar"]'));
    await row('ready');
    await row('ready');
    assert.equal(checks, 1, 'completion refreshes models once without clicking Check again');
});

test('Connections lists each provider by name then status, and Check again re-reads it', async (t) => {
    fakeServer(t, (path) => (path === '/api/settings/endpoints' ? [] : {}));
    let checks = 0;
    const page = await render(
        h(SettingsWindow, {
            ...settings().props,
            async loadModels() {
                checks++;
            },
            providers: {
                claude: { label: 'Claude', connected: true, installed: true },
                codex: { label: 'Codex', connected: false, installed: true },
            },
            auth: { connected: false, email: null },
        }),
        ui,
    );
    t.after(page.cleanup);
    assert.equal(document.getElementById('settings-heading').className, 'sr-only');
    assert.ok(button(page.container, 'Return to learning tree'));
    await page.act(async () => document.getElementById('settings-connections').click());
    const row = (name) => page.container.querySelector(`.settings-conn[aria-label=${name}]`);
    assert.match(row('Claude').textContent, /^Claude\s*Connected/);
    assert.match(row('Codex').textContent, /^Codex\s*Not connected/);
    assert.ok(
        row('Codex').querySelector('.settings-problem svg'),
        'a warning triangle, not colour alone',
    );
    await page.act(async () => button(row('Codex'), 'Check Codex again').click());
    assert.equal(checks, 1);
});

test('a browser has no Discord status switch', async (t) => {
    fakeServer(t, () => ({ first: null, events: [] }));
    const { container, cleanup } = await render(settings(), ui);
    t.after(cleanup);
    assert.doesNotMatch(container.textContent, /Show the open tree on Discord/);
});

test('the desktop app shows the Discord status switch and reports its choice', async (t) => {
    fakeServer(t, () => ({ first: null, events: [] }));
    const choices = [];
    const page = await render(
        h(SettingsWindow, {
            ...settings().props,
            discord: true,
            setDiscord: (on) => choices.push(on),
        }),
        (w) => {
            ui(w);
            w.rabbitholeDesktop = {
                activity() {},
                update: async () => null,
                onUpdate: () => () => {},
            };
        },
    );
    t.after(page.cleanup);
    const discord = [...page.container.querySelectorAll('[role=switch]')].find((s) =>
        /Show the open tree on Discord/.test(s.labels[0]?.textContent),
    );
    assert.ok(discord, 'the switch shows');
    assert.equal(discord.checked, true);
    await page.act(async () => discord.click());
    assert.deepEqual(choices, [false]);
});

test('the Board page has push-to-talk, off by default, and keeps the choice for boards', async (t) => {
    fakeServer(t, () => ({ first: null, events: [] }));
    const page = await render(settings(), ui);
    t.after(page.cleanup);
    await page.act(async () => document.getElementById('settings-board').click());
    assert.equal(document.getElementById('settings-section-board').textContent, 'Board');
    const ptt = [...page.container.querySelectorAll('[role=switch]')].find(
        (s) => s.labels[0]?.textContent === 'Push-to-talk',
    );
    assert.equal(ptt.checked, false);
    await page.act(async () => ptt.click());
    assert.equal(ptt.checked, true);
    assert.equal(window.localStorage.getItem('rabbithole.push-to-talk'), 'on');
});
