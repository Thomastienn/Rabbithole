import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { boardPen, strokeImage } from '../../server/board/pen.mjs';
import { boardOps } from '../../server/board/ops.mjs';
import { button } from '../support/ui.mjs';
import { mount } from './mountBoard.mjs';

test('board pen: a stroke on a later page is cropped from that page', async () => {
    const png = await strokeImage([
        [1400, 1000],
        [1500, 1060],
    ]);
    const meta = await sharp(png).metadata();
    assert.deepEqual([meta.width, meta.height], [180, 140], 'the stroke plus 40 px around it');
});

test('board pen: strokes taken back leave the board and the next question; the tutor’s items stay', () => {
    const board = boardOps();
    board.read('t1 text "tip" at 800,450');
    const sent = [];
    const pen = boardPen(
        {},
        () => board,
        (m) => sent.push(m),
    );
    const loop = [
        [700, 380],
        [900, 380],
        [900, 520],
        [700, 520],
        [700, 380],
    ];
    assert.deepEqual(pen.stroke(loop).mark, { verb: 'circled', ids: ['t1'] });
    pen.stroke([[1500, 100]]);
    pen.unstroke(false);
    assert.deepEqual(sent, [{ type: 'unstroke', ids: ['p2'] }], 'the last stroke only');
    assert.equal(pen.take().note, 'pen: circled t1 · strokes p1');

    pen.stroke(loop);
    pen.stroke([[1500, 100]]);
    pen.unstroke(true);
    assert.deepEqual(sent.at(-1), { type: 'unstroke', ids: ['p4', 'p5'] });
    assert.deepEqual(
        pen.take(),
        { lines: [], note: '', free: [] },
        'nothing goes with the question',
    );
    pen.unstroke(true);
    assert.equal(sent.length, 2, 'with no strokes waiting, nothing to take back');
    assert.deepEqual(board.read('e1 erase t1').item?.ids, ['t1'], 't1 was never erased');
});

test('board: the marks pill’s × and Ctrl+Z take strokes back, and the server’s answer removes them', async (t) => {
    const board = await mount(t);
    const stroke = (id, mark) => ({
        type: 'stroke',
        item: { id, kind: 'stroke', points: [[200, 200]] },
        mark,
    });
    await board.act(async () => {
        board.socket.server(stroke('p1', { verb: 'circled', ids: ['t1'] }));
        board.socket.server(stroke('p2', null));
    });
    assert.equal(board.q('.board-marks').textContent, '2 marks go with your question');

    await board.act(async () =>
        window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true })),
    );
    assert.deepEqual(board.socket.sent.at(-1), { type: 'unstroke', all: false });
    await board.act(async () => board.socket.server({ type: 'unstroke', ids: ['p2'] }));
    assert.equal(board.q('.board-marks').textContent, '1 mark goes with your question');
    assert.equal(board.container.querySelectorAll('.board-learner').length, 1);

    await board.act(async () => button(board.container, 'Remove mark').click());
    assert.deepEqual(board.socket.sent.at(-1), { type: 'unstroke', all: true });
    await board.act(async () => board.socket.server({ type: 'unstroke', ids: ['p1'] }));
    assert.equal(board.q('.board-marks'), null, 'the pill goes with the last mark');
    assert.equal(board.container.querySelectorAll('.board-learner').length, 0);
});
