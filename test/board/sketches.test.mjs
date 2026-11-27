import test from 'node:test';
import assert from 'node:assert/strict';
import { boardOps } from '../../server/board/ops.mjs';

test('board ops: sketch children are checked, and highlight, pointer, pen and the index reach each one', () => {
    const board = boardOps();
    assert.deepEqual(board.read('w1 cycle at 800,450').item.w, 1200, 'a default box');
    for (const text of ['Evaporation', 'Condensation', 'Rain', 'Collection'])
        assert.ok(board.read(`c${text.length} stage "${text}" in w1`).item, text);
    assert.deepEqual(board.read('h1 highlight c12').item, {
        ...{ id: 'h1', kind: 'highlight', names: ['c12'], at: [1080, 244.5] },
        ...{ w: 239.7, h: 117 },
    });
    assert.equal(board.read('n1 stack at 800,800 w=1100 h=600').moved, true, 'guarded as a box');
    board.read('p2 page');
    board.read('y1 timeline at 800,450');
    board.read('r1 parts whole="A neuron" at 800,450 w=1300 h=560');
    assert.equal(board.read('e1 event "Normans" when="1066" in y1 look=focus').item.look, 'focus');
    board.read('p1 part "Axon" note="carries it" in r1');
    assert.equal(
        Math.round(board.read('t1 pointer p1').item.at[0]),
        785,
        'stops right of the note',
    );
    // Page p2 starts 900 down the board.
    const ring = [
        [520, 1330],
        [780, 1320],
        [780, 1380],
        [520, 1380],
        [525, 1332],
    ];
    assert.deepEqual(board.mark(ring), { verb: 'circled', ids: ['p1'] });
    const all = [
        [100, 1000],
        [1500, 1000],
        [1500, 1800],
        [100, 1800],
        [105, 1005],
    ];
    assert.deepEqual(board.mark(all).ids, ['y1', 'r1'], 'whole sketches, not each piece');
    for (const [line, cause] of [
        ['x1 stage "Late" in w1', 'unknown parent w1'],
        ['x2 stage "Wrong" in y1', 'stage needs cycle, not timeline y1'],
        ['x3 event "No date" in y1', 'event needs when="…"'],
        ['x4 part in r1', 'part needs a "label"'],
        ['x5 parts at 800,450', 'parts needs whole="…"'],
    ])
        assert.equal(board.read(line).error, cause, line);
    assert.match(
        board.index(),
        /: w1 cycle \(c11 "Evaporation", c12 "Condensation", c4 "Rain", c10 /,
    );
    assert.match(board.index(), /y1 timeline \(e1 "Normans"\), r1 "A neuron" parts \(p1 "Axon"\)$/);
});
