import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: ExportButton, session } = await import('../../src/media/ExportButton.tsx');
const { default: VideoCard } = await import('../../src/media/VideoCard.tsx');

// Fake server answers in order; downloads are captured instead of navigating.
async function mount(t, answers, element) {
    const calls = [],
        downloads = [];
    const fetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        calls.push(
            `${init?.method ?? 'GET'} ${url}${init ? ` ${init.headers['X-Rabbithole-CSRF']}` : ''}`,
        );
        const [status, body] = answers.shift();
        return { ok: status < 400, json: async () => body };
    };
    t.after(() => (globalThis.fetch = fetch));
    session.csrf = 'token';
    const view = await render(element, (w) => {
        ui(w);
        w.HTMLAnchorElement.prototype.click = function () {
            downloads.push(this.getAttribute('href'));
        };
    });
    t.after(view.cleanup);
    return { ...view, calls, downloads };
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('Export MP4 shows a progress ring while rendering, then downloads the MP4', async (t) => {
    let exported = 0;
    const { container, act, calls, downloads } = await mount(
        t,
        [
            [200, { exported: false, exporting: true, progress: 0.4 }],
            [200, { exported: true }],
        ],
        h(ExportButton, { id: 'v1', title: 'Winners', onExported: () => exported++ }),
    );
    const press = button(container, 'Export MP4: Winners');
    assert.ok(press);
    await act(async () => press.click());
    const ring = container.querySelector('[role=progressbar]');
    assert.equal(ring.getAttribute('aria-valuenow'), '40');
    assert.deepEqual(downloads, []);
    await act(() => tick(1100));
    assert.equal(container.querySelector('[role=progressbar]'), null);
    assert.deepEqual(calls, ['POST /api/videos/v1/export token', 'GET /api/videos/v1/export']);
    assert.deepEqual(downloads, ['/api/videos/v1/media?download']);
    assert.equal(exported, 1);
});

test('an exported video downloads at once; a failed export shows its error with Retry', async (t) => {
    const { container, act, calls, downloads } = await mount(
        t,
        [
            [200, { exported: true }],
            [200, { exported: false, error: 'Video rendering failed.' }],
            [200, { exported: true }],
        ],
        h(ExportButton, { id: 'v2', title: 'Finals' }),
    );
    await act(async () => button(container, 'Export MP4: Finals').click());
    assert.deepEqual(downloads, ['/api/videos/v2/media?download']);
    await act(async () => button(container, 'Export MP4: Finals').click());
    assert.equal(
        container.querySelector('[role=alert]').textContent,
        'Export failed: Video rendering failed.',
    );
    await act(async () => button(container, 'Retry').click());
    assert.equal(container.querySelector('[role=alert]'), null);
    assert.equal(calls.length, 3);
    assert.equal(downloads.length, 2);
});

test('the same Export MP4 button sits on the inline card and the library card of a ready video', async (t) => {
    const artifact = {
        id: 'v3',
        title: 'Live',
        description: 'd',
        conversation: 'root',
        status: 'ready',
        exported: false,
    };
    const { container } = await mount(
        t,
        [],
        h(
            'div',
            null,
            h(VideoCard, { artifact, inline: true, onAction: async () => {} }),
            h(VideoCard, { artifact: { ...artifact, id: 'v4' }, media: '/api/videos/v4/media' }),
            h(VideoCard, { artifact: { ...artifact, id: 'v5', status: 'pending' }, inline: true }),
        ),
    );
    for (const id of ['v3', 'v4'])
        assert.ok(
            container.querySelector(`[data-artifact=${id}] .video-stage .export-button`),
            `${id} has Export MP4 on its player`,
        );
    assert.equal(container.querySelector('[data-artifact=v5] .export-button'), null);
});
