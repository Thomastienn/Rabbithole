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
    await say([{ id: 'h1', kind: 'highlight', at: [200, 300], w: 120, h: 120, names: ['sun'] }]);
    assert.deepEqual(
        named(),
        ['a1', 'c1', 'earth', 'f1', 'moon'],
        'a highlight lights its item, with its wash',
    );
    await say([{ id: 'x1', kind: 'erase', ids: ['orbit'] }]);
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
    ]);
    // Opened once the page's last item has drawn, so no tutor item brings the learner back.
    await until(() => board.q('[data-item="q"]'));
    await board.act(async () => button(board.container, 'Back to Page 1').click());
    assert.deepEqual(named(), [], 'a page the learner opens shows in full');

    await board.act(async () =>
        board.socket.server({ type: 'state', state: 'idle', waiting: true }),
    );
    assert.deepEqual(named(), [], 'the reply’s end, a question too, shows the whole page');

    await board.type('And?');
    await board.act(async () => button(board.container, 'Send').click());
    await board.act(async () => board.socket.server({ type: 'state', state: 'speaking' }));
    await say(undefined);
    assert.deepEqual(
        named(),
        [],
        'a new reply starts in full until a sentence draws or names something',
    );
    await say([circle('r')]);
    assert.ok(named().length, 'the spotlight comes back with a drawing');
    await board.type('Wait');
    await board.act(async () => button(board.container, 'Send').click());
    assert.deepEqual(named(), [], 'a cut-in shows the whole page at once');
});
