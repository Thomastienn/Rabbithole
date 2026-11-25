import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name, inputValue } from '../support/ui.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: VideoCard } = await import('../../src/media/VideoCard.tsx');
const { default: VideoLibrary } = await import('../../src/media/VideoLibrary.tsx');

const video = (id, status, extra = {}) => ({
    id,
    title: id,
    description: `${id} description`,
    conversation: 'root',
    status,
    ...extra,
});
const view = (card) => ({
    state: card.dataset.state,
    status: card.querySelector('[role=status]').textContent,
    buttons: [...card.querySelectorAll('button')].map(name),
    video: !!card.querySelector('video'),
});

test('inline recovery states name their action; Retry, Cancel and Open large keep one focused button', async (t) => {
    const calls = [];
    const onAction = async (action, instruction) =>
        calls.push(instruction === undefined ? action : [action, instruction]);
    let set, dom;
    function Stopped() {
        const [artifact, setArtifact] = useState(video('stopped', 'interrupted'));
        set = setArtifact;
        return h(VideoCard, { artifact, inline: true, onAction });
    }
    const { container, act, cleanup } = await render(
        h(
            'div',
            null,
            h(Stopped),
            h(VideoCard, {
                artifact: video('lost', 'ready', { available: false }),
                inline: true,
                onAction,
            }),
        ),
        (w) => (dom = ui(w)),
    );
    t.after(cleanup);
    const card = (id) => container.querySelector(`[data-artifact=${id}]`);
    assert.deepEqual(view(card('stopped')), {
        state: 'interrupted',
        status: 'stopped: Video generation interrupted when Rabbithole stopped.',
        buttons: ['Retry video', 'Token use: stopped'],
        video: false,
    });
    assert.deepEqual(view(card('lost')), {
        state: 'unavailable',
        status: 'lost: Video unavailable: its saved file is missing or unreadable.',
        buttons: ['Regenerate video', 'Token use: lost'],
        video: false,
    });
    await act(async () => button(card('lost'), 'Regenerate video').click());
    const action = card('stopped').querySelector('button');
    action.focus();
    await act(async () => action.click());
    await act(async () => set(video('stopped', 'pending', { phase: 'writing' })));
    assert.equal(view(card('stopped')).status, 'stopped: Writing cuts…');
    assert.equal(action.textContent.trim(), 'Cancel video');
    await act(async () => action.click());
    await act(async () => set(video('stopped', 'canceled')));
    assert.deepEqual(view(card('stopped')), {
        state: 'canceled',
        status: 'stopped: Video generation canceled.',
        buttons: ['Retry video', 'Token use: stopped'],
        video: false,
    });
    // A saved, unexported video plays live from its cuts; the same button opens it large.
    await act(async () => set(video('stopped', 'ready', { exported: false })));
    assert.equal(action.textContent.trim(), 'Open large');
    assert.equal(card('stopped').querySelector('video'), null);
    assert.equal(card('stopped').querySelector('iframe').title, 'Live video: stopped');
    await act(async () => set(video('stopped', 'ready', { exported: true })));
    assert.equal(card('stopped').querySelector('iframe'), null);
    assert.equal(action.textContent.trim(), 'Open large');
    assert.equal(document.activeElement, action, 'focus stays on the one action button');
    // Regenerate on an unavailable file is a retry of the saved request.
    assert.deepEqual(calls, ['retry', 'retry', 'cancel']);
    const player = card('stopped').querySelector('video');
    assert.deepEqual(
        [
            player.controls,
            player.autoplay,
            player.getAttribute('preload'),
            player.getAttribute('src'),
        ],
        [true, false, 'metadata', '/api/trees/root/artifacts/stopped/media'],
    );
    assert.equal(player.getAttribute('aria-label'), 'Video: stopped');
    // The versions menu offers a new version with an optional instruction, and the previous one while it exists.
    const menu = async (label, count) => {
        await act(async () => button(card('stopped'), 'Video versions: stopped').click());
        await act(async () => dom.frames());
        const items = [...document.querySelectorAll('[role=menuitem]')];
        assert.equal(items.length, count);
        await act(async () => items.find((e) => e.textContent.trim() === label).click());
    };
    await menu('Try a new version…', 1);
    const input = card('stopped').querySelector('.new-version input');
    assert.ok(document.activeElement === input, 'the instruction field takes focus');
    await act(async () => inputValue(input, '  Slower pace  '));
    await act(async () =>
        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        ),
    );
    assert.deepEqual(calls.at(-1), ['regenerate', 'Slower pace']);
    await act(async () => set(video('stopped', 'ready', { exported: true, hasPrevious: true })));
    await menu('Previous version', 2);
    assert.equal(calls.at(-1), 'previous');
    for (const status of ['failed', 'canceled']) {
        await act(async () => set(video('stopped', status, { hasPrevious: true })));
        await menu('Previous version', 1);
        assert.equal(calls.pop(), 'previous');
    }
});

test('library cards lead with the frame; missing files offer only removal; trash keeps the entry until the server confirms', async (t) => {
    const requests = [];
    let failTrash = true;
    const api = async (path, body) => {
        requests.push(path);
        if (path === '/api/videos')
            return [
                {
                    id: 'kept',
                    title: 'Kept',
                    description: 'A saved video.',
                    duration: 3,
                    created: 1,
                    origin: 'Fungi',
                    exported: true,
                },
                {
                    id: 'fresh',
                    title: 'Fresh',
                    description: 'Saved, never exported.',
                    duration: 3,
                    created: 3,
                    origin: null,
                    exported: false,
                },
                {
                    id: 'gone',
                    title: 'Gone',
                    description: 'Its file is missing.',
                    duration: 3,
                    created: 2,
                    origin: 'Fungi',
                    available: false,
                },
            ];
        if (path.endsWith('/reveal')) return {};
        if (path.endsWith('/trash')) {
            if (failTrash) throw new Error('Nothing was deleted.');
            return { missing: false };
        }
        assert.fail(`unexpected ${path} ${JSON.stringify(body)}`);
    };
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(VideoLibrary, { activity: '' }), ui);
    t.after(cleanup);
    const card = (id) => container.querySelector(`.video-library [data-artifact=${id}]`);
    const kept = card('kept');
    assert.deepEqual(
        [...kept.querySelectorAll('.video-stage, h3, .video-volume-actions')].map((e) =>
            e.tagName === 'H3'
                ? 'title'
                : e.classList.contains('video-stage')
                  ? 'frame'
                  : 'actions',
        ),
        ['frame', 'title', 'actions'],
    );
    assert.deepEqual(
        [...kept.querySelectorAll('.video-volume-actions button')].map((b) => b.textContent.trim()),
        ['Open large', 'Show in folder', 'Move to trash'],
    );
    assert.equal(kept.querySelector('video').getAttribute('src'), '/api/videos/kept/media');
    assert.equal(kept.querySelector('.video-origin').textContent, 'Fungi');
    assert.equal(kept.querySelector('.video-duration').textContent, '0:03');
    // At rest one Play button stands in for the native controls, which appear once playback starts.
    const player = kept.querySelector('video');
    assert.equal(player.hasAttribute('controls'), false);
    player.play = () => player.dispatchEvent(new window.Event('play'));
    await act(async () => button(kept, 'Play Kept').click());
    assert.equal(player.hasAttribute('controls'), true);
    assert.equal(button(kept, 'Play Kept'), undefined);
    assert.equal(kept.querySelector('.video-duration'), null);
    // An unexported video plays live from its saved cuts and has no file to show.
    const fresh = card('fresh');
    assert.equal(fresh.querySelector('video'), null);
    assert.equal(fresh.querySelector('iframe').getAttribute('title'), 'Live video: Fresh');
    // Its source conversation is gone: the card says so and still plays.
    assert.equal(fresh.querySelector('.video-origin').textContent, 'No longer in a conversation');
    assert.deepEqual(
        [...fresh.querySelectorAll('.video-volume-actions button')].map((b) =>
            b.textContent.trim(),
        ),
        ['Open large', 'Move to trash'],
    );
    assert.deepEqual(view(card('gone')), {
        state: 'unavailable',
        status: 'Gone: Video unavailable: its saved file is missing or unreadable.',
        buttons: ['Remove “Gone” from Videos'],
        video: false,
    });

    await act(async () => button(kept, 'Show “Kept” in folder').click());
    assert.match(container.textContent, /Opened the folder containing “Kept”\./);

    const dialog = () => document.querySelector('[role=alertdialog]');
    await act(async () => button(kept, 'Move “Kept” to the system trash').click());
    assert.match(dialog().textContent, /Move “Kept” to the trash\?/);
    await act(async () => button(dialog(), 'Move to trash').click());
    assert.match(dialog().textContent, /Nothing was deleted\./, 'failure stays in the open dialog');
    assert.ok(card('kept'), 'failed trash keeps the entry');
    failTrash = false;
    await act(async () => button(dialog(), 'Move to trash').click());
    assert.equal(card('kept'), null);
    assert.match(container.textContent, /Moved “Kept” to the system trash\./);
    assert.deepEqual(requests, [
        '/api/videos',
        '/api/videos/kept/reveal',
        '/api/videos/kept/trash',
        '/api/videos/kept/trash',
    ]);
});

test('an empty library says how videos get there', async (t) => {
    fakeServer(t, () => []);
    const { container, act, cleanup } = await render(h(VideoLibrary, { activity: '' }), ui);
    t.after(cleanup);
    await act(async () => {});
    assert.equal(container.querySelector('h2').textContent, 'No videos yet');
    assert.match(container.textContent, /Ask the tutor to show something as a video/);
});

test('a pending video lists a row per cut and the set pieces being drawn in a polite live region', async (t) => {
    const { container, cleanup } = await render(
        h(VideoCard, {
            artifact: video('rows', 'pending', {
                phase: 'pieces',
                cutRows: [
                    { cut: 1, title: 'Meet the winner', state: 'ready' },
                    { cut: 2, title: 'Race again', state: 'repairing' },
                ],
                drawing: { drawing: ['Track'], drawn: 1, total: 2 },
            }),
            inline: true,
        }),
        ui,
    );
    t.after(cleanup);
    const list = container.querySelector('.video-cut-rows');
    assert.equal(list.getAttribute('aria-live'), 'polite');
    assert.deepEqual(
        [...list.querySelectorAll('li')].map((li) => li.textContent),
        [
            'Set pieces: 1 of 2 drawnDrawing Track',
            '1. Meet the winnerReady',
            '2. Race againRepairing',
        ],
    );
});

test('a finished inline video hides its token breakdown until the ⋯ button opens it', async (t) => {
    const urls = [];
    fakeServer(t, (url) => {
        urls.push(url);
        const row = (
            stage,
            model,
            calls,
            reported,
            input,
            output,
            cacheRead,
            reasoning = null,
        ) => ({
            stage,
            model,
            calls,
            reported,
            input,
            output,
            cacheRead,
            reasoning,
        });
        return Response.json([
            row('plan', 'smart', 2, 2, 1200, 300, 100, 250),
            row('repair', 'chat', 2, 1, 50, 5, 0),
            row('fix', 'chat', 1, 0, 0, 0, 0),
            row(null, 'chat', 3, 3, 9, 9, 9),
        ]);
    });
    const { container, act, cleanup } = await render(
        h(VideoCard, { artifact: video('done', 'ready'), inline: true }),
        ui,
    );
    t.after(cleanup);
    const more = button(container, 'Token use: done');
    assert.equal(more.getAttribute('aria-expanded'), 'false');
    assert.equal(container.querySelector('.video-usage table'), null, 'closed by default');
    assert.deepEqual(urls, []);
    await act(async () => more.click());
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(urls, ['/api/trees/root/artifacts/done/usage']);
    assert.deepEqual(
        [...container.querySelectorAll('.video-usage tr')].map((tr) =>
            [...tr.children].map((c) => c.textContent),
        ),
        [
            ['Stage', 'Model', 'Calls', 'Input', 'Output', 'Reasoning', 'Cached'],
            ['Plan', 'smart', '2', '1,200', '300', '250', '100'],
            ['Repair', 'chat', '2, 1 not reported', '50', '5', '—', '0'],
            ['Fix', 'chat', '1, 1 not reported', 'Not reported'],
            ['Not recorded', 'chat', '3', '9', '9', '—', '9'],
        ],
    );
    await act(async () => more.click());
    assert.equal(container.querySelector('.video-usage table'), null);
});
