import test from 'node:test';
import assert from 'node:assert/strict';
import { boardOps } from '../../server/board/ops.mjs';

test('board ops: each kind becomes an item at its board coordinates, with its look', () => {
    const board = boardOps();
    const read = (line) => board.read(line).item;
    assert.deepEqual(read('bat box at 360,450 w=120 h=220 look=focus'), {
        id: 'bat',
        kind: 'box',
        look: 'focus',
        at: [360, 450],
        w: 120,
        h: 220,
    });
    assert.deepEqual(read('bulb circle "lamp" at 1240,450 r=70'), {
        id: 'bulb',
        kind: 'circle',
        at: [1240, 450],
        r: 70,
        text: 'lamp',
    });
    assert.deepEqual(read('e1 dot at 560,180 look=good'), {
        id: 'e1',
        kind: 'dot',
        look: 'good',
        at: [560, 180],
    });
    assert.deepEqual(read('bt text "battery" at 190,450 size=s look=muted'), {
        id: 'bt',
        kind: 'text',
        look: 'muted',
        at: [190, 450],
        size: 's',
        text: 'battery',
    });
    assert.equal(read('t2 text "two words" at 10,20').size, 'm', 'labels default to size m');
    assert.deepEqual(read('w1 line 360,340 -> 360,180').points, [
        [360, 340],
        [360, 180],
    ]);
    assert.deepEqual(read('c1 arrow 680,130 -> 920,130 look=new').points, [
        [680, 130],
        [920, 130],
    ]);
});

test('board ops: a connector runs between the edges of the items it names', () => {
    const board = boardOps();
    board.read('a box at 200,450 w=200 h=100');
    board.read('b circle at 1000,450 r=100');
    board.read('d dot at 1000,800');
    assert.deepEqual(board.read('ab arrow from a to b look=wrong').item.points, [
        [308, 450],
        [892, 450],
    ]);
    assert.deepEqual(board.read('bd line from b to d').item.points, [
        [1000, 558],
        [1000, 778],
    ]);
});

test('board ops: a malformed op or one naming an unknown id is skipped with its reason', () => {
    const board = boardOps();
    board.read('bulb circle at 1240,450 r=70');
    for (const line of [
        'bl text "bulb" at 1460 size=s',
        'c3 arrow from batt to bulb',
        'c4 arrow 10,10',
        'x1 hexagon at 10,10',
        'x2 box w=10 h=10',
        'x3 text at 10,10',
        'x4 text "big" at 10,10 size=xl',
        'x4 text "big" at 10,10 size=constructor',
        'x5 circle at 10,10 r=-4',
        'x6 dot at 10,10 look=red',
        'x7 box at 10,10 sideways',
        'bulb dot at 20,20',
        'This is a stray sentence.',
    ])
        assert.ok(board.read(line).error, line);
    assert.ok(board.read('c5 line 0,0 -> 10,10').item, 'the board carries on');
    assert.ok(board.read('bl text "bulb" at 1460,450').item, 'a skipped id stays free');
});
