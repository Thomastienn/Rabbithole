import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
import { fakeServer } from '../support/fake-server.mjs';
const { default: PieceLibrary } = await import('../../src/media/PieceLibrary.tsx');

const settle = (act, ms = 5) => act(async () => new Promise((r) => setTimeout(r, ms)));
const list = (path) => path.startsWith('/api/pieces?');

test('the Pieces view searches and pages, with a no-results message', async (t) => {
    const calls = [];
    const row = (i) => ({ id: `p${i}`, name: `Piece ${i}`, look: 'l', improved: 1, videos: [] });
    const api = async (path) => {
        calls.push(path);
        const q = new URL(path, 'http://x').searchParams;
        if (q.get('q') === 'zebra') return { total: 0, pieces: [] };
        if (q.get('q')) return { total: 1, pieces: [row(99)] };
        const offset = Number(q.get('offset'));
        return {
            total: 30,
            pieces: Array.from({ length: offset ? 6 : 24 }, (_, i) => row(offset + i)),
        };
    };
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(PieceLibrary, { theme: 'platform' }), ui);
    t.after(cleanup);
    await settle(act);
    assert.equal(calls[0], '/api/pieces?offset=0&limit=24');
    const cards = () =>
        [...container.querySelectorAll('.piece-library h3')].map((e) => e.textContent);
    const button = (label) =>
        [...container.querySelectorAll('button')].find(
            (b) => (b.textContent || b.getAttribute('aria-label')) === label,
        );
    assert.equal(cards().length, 24);
    const pages = container.querySelector('nav[aria-label="Piece pages"]');
    assert.match(pages.textContent, /1–24 of 30/);
    assert.ok(button('Previous page').disabled);
    await act(async () => button('Next page').click());
    await settle(act);
    assert.equal(calls.at(-1), '/api/pieces?offset=24&limit=24');
    assert.deepEqual([cards().length, cards()[0]], [6, 'Piece 24']);
    assert.ok(button('Next page').disabled);

    const status = () =>
        [...container.querySelectorAll('[role=status]')].map((e) => e.textContent).join(' ');
    const input = container.querySelector('input[aria-label="Search pieces"], #piece-search');
    assert.ok(input, 'a labelled search bar');
    const type = async (value) => {
        await act(async () => {
            const set = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value',
            ).set;
            set.call(input, value);
            input.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
        await settle(act, 300);
    };
    await type('rocket');
    assert.equal(
        calls.at(-1),
        '/api/pieces?offset=0&limit=24&q=rocket',
        'search restarts at page 1',
    );
    assert.deepEqual(cards(), ['Piece 99']);
    assert.match(status(), /1 piece matches “rocket”/);
    assert.equal(container.querySelector('nav[aria-label="Piece pages"]'), null);
    await type('zebra');
    assert.deepEqual(cards(), []);
    assert.match(status(), /No pieces match “zebra”/);
    assert.doesNotMatch(
        container.textContent,
        /No saved pieces yet/,
        'not the empty-library state',
    );
    assert.ok(container.querySelector('#piece-search'), 'the search bar stays to edit the query');
});

test('an empty Pieces view says how pieces get there', async (t) => {
    const api = async () => ({ total: 0, pieces: [] });
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(PieceLibrary, { theme: 'platform' }), ui);
    t.after(cleanup);
    await settle(act);
    assert.equal(container.querySelector('h2').textContent, 'No saved pieces yet');
    assert.match(container.textContent, /When a video draws an object worth keeping/);
    assert.equal(container.querySelector('nav[aria-label="Piece pages"]'), null);
});

test('the Pieces view lists pieces and opens a read-only source with a preview in the isolated player frame', async (t) => {
    const calls = [];
    const piece = {
        id: 'p1',
        name: 'Winner',
        look: 'A gold trophy 200 px tall',
        improved: Date.UTC(2026, 10, 15, 12),
        videos: [{ id: 'v1', title: 'Elections' }],
    };
    const api = async (path, body) => {
        calls.push([path, body]);
        if (list(path))
            return { total: 2, pieces: [piece, { ...piece, id: 'p2', name: 'Loser', videos: [] }] };
        if (path === '/api/pieces/p1?theme=platform&mode=light')
            return {
                ...piece,
                roles: ['winner', 'loser'],
                source: 'export function Winner() {}',
                code: 'exports.Winner = 1',
                source3d: null,
                code3d: null,
                palette: { ground: '#14171d' },
            };
        assert.fail(path);
    };
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(PieceLibrary, { theme: 'platform' }), ui);
    t.after(cleanup);
    await settle(act);
    const cards = [...container.querySelectorAll('.piece-library h3')].map((e) =>
        e.closest('.piece-library > *'),
    );
    assert.deepEqual(
        cards.map((c) => c.querySelector('h3').textContent),
        ['Winner', 'Loser'],
    );
    // Tiles (mockup Pieces): one still, the name and how many videos use the piece.
    assert.equal(cards[0].textContent, 'Still pendingWinnerUsed in 1 video');
    assert.match(cards[1].textContent, /Not in a saved video/);
    assert.equal(container.textContent.match(/Delete|Edit|trash/i), null);

    await act(async () => container.querySelector('[aria-label="Open Winner"]').click());
    await settle(act);
    const frame = container.querySelector('iframe');
    assert.deepEqual(
        [frame.getAttribute('src'), frame.getAttribute('sandbox'), frame.title],
        ['/player.html', 'allow-scripts', 'Preview: Winner'],
    );
    const posted = [];
    frame.contentWindow.postMessage = (data) => posted.push(data);
    await act(async () => frame.dispatchEvent(new window.Event('load')));
    assert.deepEqual(posted, [
        {
            type: 'piece',
            code: 'exports.Winner = 1',
            code3d: null,
            name: 'Winner',
            palette: { ground: '#14171d' },
            paletteRoles: { winner: 'amber', loser: 'leaf' },
        },
    ]);
    assert.match(container.textContent, /2D only/, 'a 2D-only piece says so plainly');
    assert.doesNotMatch(frame.className, /piece-forms/, 'one form fills the frame');
    const source = container.querySelector('pre');
    assert.match(source.textContent, /export function Winner\(\) \{\}/);
    assert.equal(
        container.querySelector('textarea, [contenteditable=true]'),
        null,
        'source is read-only',
    );
    assert.ok(
        calls.every(([, body]) => body === undefined),
        'only reads, no writes',
    );
});

test('opening a piece with a 3D form sends both forms to the isolated player frame', async (t) => {
    const row = { id: 'p1', name: 'Winner', look: 'A gold trophy', improved: 1, videos: [] };
    const api = async (path, body) => {
        assert.equal(body, undefined, 'only reads, no writes');
        if (list(path)) return { total: 1, pieces: [row] };
        if (path === '/api/pieces/p1?theme=platform&mode=light')
            return {
                ...row,
                roles: ['winner'],
                source: 'export function Winner() {}',
                code: 'exports.Winner = 1',
                source3d: 'export function Winner3D() { return <group />; }',
                code3d: 'exports.Winner3D = 1',
                palette: { ground: '#14171d' },
            };
        assert.fail(path);
    };
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(PieceLibrary, { theme: 'platform' }), ui);
    t.after(cleanup);
    await settle(act);
    await act(async () => container.querySelector('[aria-label="Open Winner"]').click());
    await settle(act);
    const frames = container.querySelectorAll('iframe');
    assert.equal(frames.length, 1, 'both forms share one frame');
    const [frame] = frames;
    assert.deepEqual(
        [frame.getAttribute('src'), frame.getAttribute('sandbox'), frame.className],
        ['/player.html', 'allow-scripts', 'video-frame video-live piece-forms'],
    );
    const posted = [];
    frame.contentWindow.postMessage = (data) => posted.push(data);
    await act(async () => frame.dispatchEvent(new window.Event('load')));
    assert.deepEqual(posted, [
        {
            type: 'piece',
            code: 'exports.Winner = 1',
            code3d: 'exports.Winner3D = 1',
            name: 'Winner',
            palette: { ground: '#14171d' },
            paletteRoles: { winner: 'amber' },
        },
    ]);
    assert.doesNotMatch(container.textContent, /2D only/);
    assert.deepEqual(
        [...container.querySelectorAll('pre')].map((p) => /Winner3D/.test(p.textContent)),
        [false, true],
        'both sources, read-only',
    );
    assert.equal(container.querySelector('textarea, [contenteditable=true]'), null);
});

test('cards show one 2D still as an image, or a pending still, without a live player', async (t) => {
    const row = (id, flags) => ({
        id,
        name: id,
        look: 'l',
        improved: 7,
        videos: [],
        solid: false,
        still: true,
        still3d: false,
        ...flags,
    });
    const api = async (path) =>
        list(path)
            ? {
                  total: 3,
                  pieces: [
                      row('Both', { solid: true, still3d: true }),
                      row('Flat'),
                      row('Fresh', { solid: true, still: false }),
                  ],
              }
            : assert.fail(path);
    fakeServer(t, api);
    const { container, act, cleanup } = await render(h(PieceLibrary, { theme: 'platform' }), ui);
    t.after(cleanup);
    await settle(act);
    const card = (name) =>
        [...container.querySelectorAll('.piece-library h3')]
            .find((e) => e.textContent === name)
            .closest('.piece-library > *');
    const images = (name) =>
        [...card(name).querySelectorAll('img')].map((i) => [i.getAttribute('src'), i.alt]);
    // The 3D form shows in the piece's preview, not on its tile.
    assert.deepEqual(images('Both'), [['/api/pieces/Both/still?v=7', '2D form']]);
    assert.deepEqual(images('Flat'), [['/api/pieces/Flat/still?v=7', '2D form']]);
    assert.deepEqual(images('Fresh'), []);
    assert.match(card('Fresh').textContent, /Still pending/);
    assert.equal(container.querySelector('iframe'), null, 'no live player per card');
});
