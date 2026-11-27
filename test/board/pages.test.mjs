import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
import { mount } from './mountBoard.mjs';

// The page strip and back chip (mockup Rabbithole-pgs.4): the learner moves between board pages.
test('board: the strip lists pages with side pages after their parent, and the learner opens any of them', async (t) => {
    const board = await mount(t, [
        { id: 'r', role: 'assistant', text: 'Friction.', status: 'completed', board: true },
    ]);
    const page = (id, title, top, parent) => ({ id, kind: 'page', top, title, parent });
    await board.act(async () =>
        board.socket.server({
            type: 'board',
            replies: [
                {
                    caption: 'Friction.',
                    items: [
                        { id: 'f1', kind: 'dot', at: [800, 450] },
                        page('s1', 'Friction', 900, 'first'),
                        page('c1', 'Heat from rubbing', 1800, 's1'),
                        { id: 'o1', kind: 'open', page: 'first', top: 0 },
                        page('s2', 'Page 4', 2700, 'first'),
                        { id: 'o2', kind: 'open', page: 's1', top: 900 },
                    ],
                },
            ],
        }),
    );
    const strip = () =>
        [...board.q('[aria-label="Board pages"]').children].map(
            (b) =>
                `${b.querySelector('[aria-label=from]') ? '↳' : ''}${b.textContent}` +
                (b.getAttribute('aria-current') ? ' *' : ''),
        );
    const back = () => board.q('.board-back')?.textContent;
    assert.deepEqual(strip(), ['Page 1', '↳Friction *', '↳Heat from rubbing', '↳Page 4']);
    assert.equal(back(), 'Back to Page 1');
    const views = () => board.socket.sent.filter((m) => m.type === 'view');

    await board.act(async () => button(board.container, 'Heat from rubbing').click());
    assert.deepEqual(strip(), ['Page 1', '↳Friction', '↳Heat from rubbing *', '↳Page 4']);
    assert.equal(back(), 'Back to Friction');
    await board.act(async () => button(board.container, 'Back to Friction').click());
    assert.equal(strip()[1], '↳Friction *');
    assert.deepEqual(views(), [
        { type: 'view', page: 'c1' },
        { type: 'view', page: 's1' },
    ]);
    await board.act(async () => button(board.container, 'Page 1').click());
    assert.equal(back(), undefined, 'the first page came from no page');

    // While the tutor draws, its next item brings the view back to its open page and tells the session.
    await board.act(async () =>
        board.socket.server({
            type: 'sentence',
            id: '1',
            text: 'Back on friction.',
            ops: [{ id: 'd2', kind: 'dot', at: [800, 1350] }],
        }),
    );
    assert.equal(strip()[1], '↳Friction *');
    assert.deepEqual(views().at(-1), { type: 'view' });
});
