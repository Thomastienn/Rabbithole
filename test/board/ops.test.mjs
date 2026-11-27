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

test('board ops: the guard moves an overlapping or off-board item to the nearest free spot', () => {
    const board = boardOps();
    board.read('a box at 400,450 w=200 h=100');
    const over = board.read('b box at 450,450 w=200 h=100');
    assert.equal(over.moved, true);
    assert.deepEqual(over.item.at, [450, 350], 'just clear of a, the shortest way');
    const off = board.read('c circle at 1580,20 r=60');
    assert.equal(off.moved, true);
    assert.deepEqual(off.item.at, [1540, 60], 'pulled just inside the corner');
    board.read('w arrow 800,100 -> 800,800');
    const label = board.read('t text "speed" at 800,300 size=s');
    assert.equal(label.moved, true, 'a label on a drawn arrow moves');
    assert.notDeepEqual(label.item.at, [800, 300]);
    assert.equal(board.read('wd text "far" at 1300,800').moved, undefined);
});

test('board ops: a label in a shape, a line over shapes and a connector at its ends stay put', () => {
    const board = boardOps();
    board.read('a box at 300,450 w=300 h=200');
    assert.equal(board.read('al text "inside" at 300,450 size=s').moved, undefined);
    assert.equal(
        board.read('ln line 100,300 -> 700,600').moved,
        undefined,
        'a line may cross a shape',
    );
    board.read('b circle at 1200,450 r=100');
    assert.equal(board.read('ab arrow from a to b').moved, undefined);
    // A label touching the connector, but not its ends, still moves.
    assert.equal(board.read('x text "flow" at 800,450 size=s').moved, true);
    assert.equal(
        board.read('lb arrow from al to b').moved,
        undefined,
        'a connector across a shape is never moved',
    );
});
