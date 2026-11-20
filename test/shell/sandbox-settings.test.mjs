import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: SandboxSettings } = await import('../../src/settings/SandboxSettings.tsx');

// `accept` lists the UAC answers in order; each POST runs the launcher setup once.
async function mount(t, { windows = true, accept = [] } = {}) {
    const posts = [];
    let ready = false;
    const api = async (path, body) => {
        assert.equal(path, '/api/setup/sandbox');
        if (body) (posts.push(path), (ready = accept.shift()));
        return { windows, ready };
    };
    const page = await render(h(SandboxSettings, { api }), (w) => ui(w));
    t.after(page.cleanup);
    await page.act(async () => {});
    const click = (label) => page.act(async () => button(page.container, label).click());
    return { ...page, posts, click };
}

test('Settings offers the sandbox setup again after it was declined', async (t) => {
    const { container, posts, click } = await mount(t, { accept: [false, true] });
    assert.match(container.textContent, /video making is unavailable/);
    await click('Enable sandbox');
    assert.match(container.textContent, /Video making stays off until it is enabled\./);
    await click('Try again');
    assert.equal(posts.length, 2);
    assert.match(container.textContent, /The sandbox is on\./);
    assert.equal(container.querySelector('button'), null);
});

test('Linux Settings shows no sandbox section', async (t) => {
    const { container } = await mount(t, { windows: false });
    assert.equal(container.textContent, '');
});
