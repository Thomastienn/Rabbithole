import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';
const { default: Downloads } = await import('../../src/shell/Downloads.tsx');
const { default: VideoCard } = await import('../../src/media/VideoCard.tsx');

test('Downloads icon shows progress, lists name, size, progress and Retry, and hides when nothing is left', async (t) => {
    let source;
    globalThis.EventSource = class {
        constructor(url) {
            this.url = url;
            source = this;
        }
        close() {}
    };
    const posts = [];
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = async (path, init) => (posts.push([path, init.method]), new Response('[]'));
    t.after(() => {
        delete globalThis.EventSource;
        globalThis.fetch = fetchBefore;
    });
    const { container, act, cleanup } = await render(h(Downloads, { rail: false }), ui);
    t.after(cleanup);
    assert.equal(source.url, '/api/downloads');
    const push = (list) => act(async () => source.onmessage({ data: JSON.stringify(list) }));
    assert.equal(container.querySelector('button'), null, 'hidden with nothing to show');
    await push([
        {
            id: 'manim',
            name: 'Manim',
            state: 'failed',
            bytes: null,
            total: null,
            percent: null,
            error: 'Network down.',
        },
        {
            id: 'browser',
            name: 'Video browser',
            state: 'running',
            bytes: 5e7,
            total: 1e8,
            percent: 50,
        },
    ]);
    const icon = container.querySelector('.downloads-button button');
    assert.equal(name(icon), 'Downloads: a download failed');
    assert.equal(
        container.querySelector('.downloads-ring circle').getAttribute('stroke-dasharray'),
        '0.25 1',
    );
    await act(async () => icon.click());
    const list = document.querySelector('.downloads-list');
    assert.ok(list, 'clicking opens the list');
    assert.match(list.textContent, /Manim.*Failed: Network down\./);
    assert.match(list.textContent, /Video browser100 MB.*Downloading, 50%/);
    await act(async () => button(list, 'Retry Manim').click());
    assert.deepEqual(posts, [['/api/downloads/manim/retry', 'POST']]);
    await act(async () =>
        document.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
    );
    assert.deepEqual(
        posts.at(-1),
        ['/api/downloads/seen', 'POST'],
        'closing the opened list marks ready ones seen',
    );
    await push([
        {
            id: 'browser',
            name: 'Video browser',
            state: 'ready',
            bytes: 1e8,
            total: 1e8,
            percent: 100,
        },
    ]);
    assert.equal(name(container.querySelector('.downloads-button button')), 'Downloads ready');
    await push([]);
    assert.equal(container.querySelector('.downloads-button'), null);
});

test('a video asked for before its tools are ready shows the unavailable state with the download percent', async (t) => {
    const calls = [];
    const { container, act, cleanup } = await render(
        h(VideoCard, {
            artifact: {
                id: 'video',
                conversation: 'root',
                title: 'Winners',
                description: 'Two winners meet.',
                status: 'failed',
                error: 'Video tools are still downloading (40%).',
            },
            inline: true,
            onAction: async (action) => {
                calls.push(action);
            },
        }),
        ui,
    );
    t.after(cleanup);
    assert.equal(container.querySelector('[data-artifact=video]').dataset.state, 'unavailable');
    assert.match(
        container.querySelector('[role=status]').textContent,
        /Video tools are still downloading \(40%\)\./,
    );
    await act(async () => button(container, 'Retry video').click());
    assert.deepEqual(calls, ['retry']);
});

test('a video asked for before the Windows sandbox is set up shows the unavailable state with that reason', async (t) => {
    const error = 'Video making needs the Windows sandbox. Enable it in Settings, then ask again.';
    const { container, cleanup } = await render(
        h(VideoCard, {
            artifact: {
                id: 'video',
                conversation: 'root',
                title: 'Winners',
                status: 'failed',
                error,
            },
            inline: true,
            onAction: async () => {},
        }),
        ui,
    );
    t.after(cleanup);
    assert.equal(container.querySelector('[data-artifact=video]').dataset.state, 'unavailable');
    assert.equal(container.querySelector('[role=status]').textContent, `Winners: ${error}`);
});
