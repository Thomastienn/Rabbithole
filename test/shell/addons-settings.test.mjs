import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: AddonsSettings } = await import('../../src/settings/AddonsSettings.tsx');

const addon = (id, name, state, extra = {}) => ({
    id,
    name,
    enables: `${name} enables`,
    size: 100e6,
    dependency: null,
    state,
    percent: null,
    ...extra,
});

// `lists` answers each add-on list request in turn (the last one repeats); `sandbox` answers the sandbox status, or each read in turn when a list.
async function mount(t, { lists, sandbox = { windows: false, ready: true }, accept = [] }) {
    const posts = [];
    let source;
    globalThis.EventSource = class {
        constructor(url) {
            this.url = url;
            source = this;
        }
        close() {}
    };
    t.after(() => delete globalThis.EventSource);
    fakeServer(t, async (path, body) => {
        if (body) posts.push(path);
        if (path === '/api/setup/sandbox') {
            if (body) sandbox = { ...sandbox, ready: accept.shift() };
            if (!Array.isArray(sandbox)) return sandbox;
            return sandbox.length > 1 ? sandbox.shift() : sandbox[0];
        }
        return lists.length > 1 ? lists.shift() : lists[0];
    });
    const page = await render(h(AddonsSettings), ui);
    t.after(page.cleanup);
    await page.act(async () => {});
    const row = (name) =>
        [...page.container.querySelectorAll('.addon')].find(
            (r) => r.getAttribute('aria-label') === name,
        );
    const click = (root, label) => page.act(async () => button(root, label).click());
    const stream = () => page.act(async () => source.onmessage({ data: '[]' }));
    return { ...page, posts, row, click, stream, source: () => source };
}

test('Add-ons lists each add-on with its state, size and dependency, and Install follows the download', async (t) => {
    const video = (state, percent = null) =>
        addon('video-tools', 'Video tools', state, { dependency: 'offline-python', percent });
    const python = (state, percent = null) =>
        addon('offline-python', 'Offline Python', state, { size: 50e6, percent });
    const search = addon('web-search', 'Web search', 'installed');
    const { container, row, click, posts, stream, source } = await mount(t, {
        lists: [
            [video('not-installed'), python('not-installed'), search],
            [video('downloading', 0), python('downloading', 20), search],
            [video('downloading', 60), python('installed'), search],
        ],
    });
    assert.deepEqual(
        [...container.querySelectorAll('.addon')].map((r) => r.getAttribute('aria-label')),
        ['Video tools', 'Offline Python', 'Web search', 'Sandbox'],
    );
    assert.match(row('Video tools').textContent, /Not installed.*100 MB.*offline Python/);
    assert.match(row('Web search').textContent, /Installed/);
    assert.equal(row('Web search').querySelector('button'), null, 'no Remove action');
    assert.equal(source().url, '/api/downloads');

    await click(row('Video tools'), 'Install Video tools');
    assert.deepEqual(posts, ['/api/downloads/addons/video-tools']);
    assert.match(row('Video tools').textContent, /Waiting for offline Python/);
    assert.match(row('Offline Python').textContent, /Downloading 20%.*10 of 50 MB/);
    assert.equal(row('Video tools').querySelector('button'), null);

    await stream();
    assert.match(row('Video tools').textContent, /Downloading 60%.*60 of 100 MB/);
    assert.match(row('Offline Python').textContent, /Installed/);
});

test('a failed add-on says why and Retry queues it again', async (t) => {
    const failed = addon('web-search', 'Web search', 'failed', { error: 'Network down.' });
    const { row, click, posts } = await mount(t, {
        lists: [[failed], [{ ...failed, state: 'downloading', percent: 5, error: undefined }]],
    });
    assert.match(row('Web search').querySelector('[role=alert]').textContent, /Network down\./);
    await click(row('Web search'), 'Retry Web search');
    assert.deepEqual(posts, ['/api/downloads/addons/web-search/retry']);
    assert.match(row('Web search').textContent, /Downloading 5%/);
});

test('the sandbox row shows Linux bubblewrap missing until a check finds it', async (t) => {
    const { row, click, posts } = await mount(t, {
        lists: [[]],
        sandbox: [
            { windows: false, ready: false },
            { windows: false, ready: true },
        ],
    });
    assert.match(row('Sandbox').textContent, /Bubblewrap missing.*apt install bubblewrap/);
    await click(row('Sandbox'), 'Check again');
    assert.deepEqual(posts, [], 'checking only reads the status');
    assert.match(row('Sandbox').textContent, /Ready/);
});

test('the Windows sandbox row enables the sandbox and offers it again after a decline', async (t) => {
    const { row, click, posts } = await mount(t, {
        lists: [[]],
        sandbox: { windows: true, ready: false },
        accept: [false, true],
    });
    assert.match(row('Sandbox').textContent, /Off/);
    await click(row('Sandbox'), 'Enable sandbox');
    assert.match(row('Sandbox').textContent, /not enabled/);
    await click(row('Sandbox'), 'Try again');
    assert.deepEqual(posts, ['/api/setup/sandbox', '/api/setup/sandbox']);
    assert.match(row('Sandbox').textContent, /Ready/);
    assert.equal(row('Sandbox').querySelector('button'), null);
});
