import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
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
