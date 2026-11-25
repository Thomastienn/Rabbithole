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
