import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
import { mount } from './mountBoard.mjs';

test('board: while the tutor speaks, what its latest sentence drew or named stays lit and the rest of the page dims', async (t) => {
    // The camera slides to a new page with reduced motion.
    globalThis.matchMedia = () => ({ matches: true });
    t.after(() => delete globalThis.matchMedia);
    const board = await mount(t);
    const named = () =>
        [...board.container.querySelectorAll('svg .board-item.board-dim')]
            .map((g) => g.dataset.item)
            .sort();
    const at = { sun: 200, earth: 1300, moon: 900, orbit: 1000 };
    // Polls the board on real timers, so a loaded machine only makes it slower.
    const until = async (ready) => {
        for (let ms = 0; !ready() && ms < 5000; ms += 10)
            await board.act(() => new Promise((done) => setTimeout(done, 10)));
        assert.ok(ready());
    };
    // Each sentence waits on show until the one before has ended.
    let n = 0;
    const say = async (ops) => {
        const text = `S${++n}.`;
        await board.act(async () =>
            board.socket.server({ type: 'sentence', id: String(n), text, ops }),
        );
        await until(() => board.q('.board-caption').textContent === text);
    };
    // A pointer fades as passed once its sentence ends.
    const passed = (id) => board.q(`[data-item="${id}"]`).classList.contains('board-gone');
    const pointer = (id, on) => ({
        id,
        kind: 'pointer',
        from: [800, 450],
        at: [700, 300],
        names: [on],
    });
    const circle = (id, extra) => ({
        id,
        kind: 'circle',
        at: [at[id] ?? 700, 300],
        r: 40,
        ...extra,
    });
    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    await board.act(async () => board.socket.server({ type: 'state', state: 'speaking' }));
    await say([
        circle('sun'),
        circle('earth'),
        circle('moon'),
        circle('orbit', { look: 'muted' }),
        { id: 'f1', kind: 'flow', at: [800, 700], w: 600, h: 200 },
    ]);
    await board.act(async () =>
        board.socket.server({
            type: 'stroke',
            item: { id: 's1', kind: 'stroke', points: [[200, 300]] },
        }),
    );
    assert.deepEqual(named(), [], 'everything the first sentence drew is lit');
    await say([
        {
            id: 'a1',
            kind: 'arrow',
            points: [
                [940, 300],
                [1220, 300],
            ],
            names: ['moon', 'earth'],
        },
    ]);
    assert.deepEqual(
        named(),
        ['f1', 'sun'],
        'a connector lights its two ends; the muted orbit and the pen stroke do not dim',
    );
    await say(undefined);
    assert.deepEqual(named(), ['f1', 'sun'], 'a sentence without ops keeps the lit set');
    await say([{ id: 'c1', kind: 'step', on: 'f1', text: 'new' }]);
    assert.deepEqual(named(), ['a1', 'earth', 'moon', 'sun'], 'a child lights its whole component');
    await say([pointer('h1', 'sun')]);
    assert.deepEqual(named(), ['a1', 'c1', 'earth', 'f1', 'moon'], 'a pointer lights its item');
    assert.equal(passed('h1'), false, 'the pointer stays through its sentence');
    await say([{ id: 'x1', kind: 'erase', ids: ['orbit'] }]);
    assert.equal(passed('h1'), true, 'the next sentence fades it');
    assert.deepEqual(named(), ['a1', 'c1', 'earth', 'f1', 'moon'], 'an erase lights nothing');

    await board.act(async () => board.q('.board-pause').click());
    assert.deepEqual(named(), [], 'paused, the whole page shows');
    await board.act(async () => board.q('.board-pause').click());
    assert.deepEqual(
        named(),
        ['a1', 'c1', 'earth', 'f1', 'moon'],
        'resuming brings the spotlight back',
    );

    await say([
        { id: 'p2', kind: 'page', top: 900, title: 'Two', parent: 'first' },
        circle('q', { at: [700, 1200] }),
        pointer('p3', 'q'),
    ]);
    // Opened once the page's last item has drawn, so no tutor item brings the learner back.
    await until(() => board.q('[data-item="p3"]'));
    await board.act(async () => button(board.container, 'Back to Page 1').click());
    assert.deepEqual(named(), [], 'a page the learner opens shows in full');

    await board.act(async () =>
        board.socket.server({ type: 'state', state: 'idle', waiting: true }),
    );
    assert.deepEqual(named(), [], 'the reply’s end, a question too, shows the whole page');
    assert.equal(passed('p3'), true, 'the tutor stopping to wait fades the pointer');

    await board.type('And?');
    await board.act(async () => button(board.container, 'Send').click());
    await board.act(async () => board.socket.server({ type: 'state', state: 'speaking' }));
    await say(undefined);
    assert.deepEqual(
        named(),
        [],
        'a new reply starts in full until a sentence draws or names something',
    );
    await say([circle('r'), pointer('p4', 'r')]);
    assert.ok(named().length, 'the spotlight comes back with a drawing');
    await until(() => board.q('[data-item="p4"]'));
    assert.equal(passed('p4'), false);
    await board.type('Wait');
    await board.act(async () => button(board.container, 'Send').click());
    assert.deepEqual(named(), [], 'a cut-in shows the whole page at once');
    assert.equal(passed('p4'), true, 'and fades the pointer with it');
});

test('board: a drawing draws its paths in theme colour roles, and pointing at one path lights it alone', async (t) => {
    const board = await mount(t);
    const named = () =>
        [...board.container.querySelectorAll('svg .board-item.board-dim')]
            .map((g) => g.dataset.item)
            .sort();
    const until = async (ready) => {
        for (let ms = 0; !ready() && ms < 5000; ms += 10)
            await board.act(() => new Promise((done) => setTimeout(done, 10)));
        assert.ok(ready());
    };
    let n = 0;
    const say = async (ops) => {
        const text = `S${++n}.`;
        await board.act(async () =>
            board.socket.server({ type: 'sentence', id: String(n), text, ops }),
        );
        await until(() => board.q('.board-caption').textContent === text);
    };
    const path = (id, d, extra) => ({
        id,
        kind: 'path',
        on: 'dr',
        d,
        fit: [160, 140, 6.2],
        at: [470, 450],
        w: 100,
        h: 100,
        ink: 'green',
        ...extra,
    });
    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    await board.act(async () => board.socket.server({ type: 'state', state: 'speaking' }));
    await say([
        { id: 'dr', kind: 'drawing', at: [470, 450], w: 620, h: 620 },
        path('p1', 'M26 64H74V72H26Z', { ink: 'ink', fill: 'pink' }),
        path('p2', 'M51 42C60 38 71 31 76 22'),
    ]);
    await until(() => board.q('[data-item="p2"] path'));
    const pot = board.q('[data-item="p1"] path');
    assert.equal(pot.getAttribute('class'), 'board-stroke board-drawn ink-ink fill-pink');
    assert.equal(pot.getAttribute('transform'), 'translate(160 140) scale(6.2)');
    assert.equal(pot.getAttribute('d'), 'M26 64H74V72H26Z');
    assert.equal(
        (board.q('[data-item="p1"]').outerHTML + board.q('[data-item="p2"]').outerHTML).match(
            /#[0-9a-f]{3}|rgb|hsl|fill=|stroke=/i,
        ),
        null,
        'no raw colour values: the theme tokens colour it through its role classes',
    );
    assert.equal(
        board.q('[data-item="dr"]').children.length,
        0,
        'the drawing itself draws nothing',
    );
    await say([{ id: 'o1', kind: 'pointer', at: [640, 338], from: [800, 450], names: ['p2'] }]);
    assert.deepEqual(named(), ['dr', 'p1'], 'one path is lit and the pointer sits on it');
});
