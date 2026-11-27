import test from 'node:test';
import assert from 'node:assert/strict';
import { boardOps } from '../../server/board/ops.mjs';
import { expression } from '../../server/board/components.mjs';

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

test('board ops: erase removes the items it names, and a learner stroke marks what it circles or points at', () => {
    const board = boardOps();
    board.read('load box at 370,548 w=140 h=112');
    board.read('pivot text "pivot" at 560,760 size=s');
    board.read('tip dot at 560,673');
    const loop = [
        [650, 620],
        [470, 600],
        [480, 800],
        [690, 760],
        [640, 615],
    ];
    assert.deepEqual(board.mark(loop), { verb: 'circled', ids: ['pivot', 'tip'] });
    assert.deepEqual(
        board.mark([
            [640, 380],
            [432, 500],
        ]),
        { verb: 'pointed at', ids: ['load'] },
    );
    assert.equal(
        board.mark([
            [1200, 100],
            [1300, 120],
        ]),
        null,
        'a stroke over no item marks nothing',
    );
    assert.deepEqual(board.read('p1 stroke circled=pivot,tip 650,620 470,600').item, {
        id: 'p1',
        kind: 'stroke',
        points: [
            [650, 620],
            [470, 600],
        ],
    });
    assert.ok(board.read('e1 erase p1 nowhere').error, 'an unknown id skips the whole erase');
    assert.deepEqual(board.read('e1 erase p1 tip').item, {
        id: 'e1',
        kind: 'erase',
        ids: ['tip', 'p1'],
    });
    assert.deepEqual(
        board.items().map((i) => i.id),
        ['load', 'pivot'],
    );
    assert.ok(board.read('e2 erase').error, 'erase needs an id');
});

test('board ops: a stroke over a plot marks its axes, and erasing the axes takes their plot', () => {
    const board = boardOps();
    board.read('a1 axes at 680,480 w=1080 h=680 x=0..5 y=0..32');
    board.read('sq plot on a1 y=x^2');
    const loop = [
        [150, 120],
        [1250, 120],
        [1250, 820],
        [150, 820],
        [160, 130],
    ];
    assert.deepEqual(board.mark(loop), { verb: 'circled', ids: ['a1'] });
    assert.deepEqual(board.read('e1 erase a1').item.ids, ['a1', 'sq']);
    assert.deepEqual(board.items(), []);
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

test('board ops: axes lay out in their box and each plot traces left to right in their units', () => {
    const board = boardOps();
    const axes = board.read('a1 axes at 680,480 w=1080 h=680 x=0..5 y=0..32').item;
    assert.match(axes.d, /^M200 760H1200M200 760V160/, 'axes as drawn in mockup Rabbithole-brd.5');
    assert.deepEqual(
        axes.labels.map((l) => l.text),
        ['0', '1', '2', '3', '4', '5', '0', '8', '16', '24', '32'],
    );
    assert.deepEqual(axes.labels[1], { at: [400, 808], text: '1' });
    assert.deepEqual(axes.labels.at(-1), { at: [176, 169], text: '32', end: true });
    const square = board.read('p1 plot on a1 y=x^2').item;
    assert.equal(square.on, 'a1');
    const xs = [...square.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    assert.deepEqual(xs[0], [200, 760]);
    assert.deepEqual(
        xs.find(([x]) => x === 400),
        [400, 741.3],
    );
    assert.deepEqual(xs.at(-1), [1200, 291.3]);
    assert.ok(
        xs.every(([x], i) => !i || x > xs[i - 1][0]),
        'left to right',
    );
    // 2^x ends in the top corner; x^3 leaves the top early, cut at the axes' edge.
    assert.ok(board.read('p2 plot "2^x" on a1').item.d.endsWith('L1200 160'));
    const cube = board.read('p3 plot "x^3" on a1').item.d;
    assert.match(cube, /L[\d.]+ 160$/, 'a curve leaving the axes stops at their top');
    assert.equal(board.read('dt dot 2,4 on a1').item.at.join(), '600,685');
});

test('board ops: a number line draws its ticks and each point sits at its value', () => {
    const board = boardOps();
    const line = board.read('n1 numberline at 800,500 w=1300 h=240 range=0..1 ticks=0,1/2,1').item;
    assert.equal(line.d, 'M200 520H1400M200 506V534M800 506V534M1400 506V534');
    assert.deepEqual(
        line.labels.map((l) => [l.at[0], l.at[1], l.text]),
        [
            [200, 580, '0'],
            [800, 580, '1/2'],
            [1400, 580, '1'],
        ],
    );
    assert.deepEqual(board.read('q1 point on n1 0.7 label=0.7').item, {
        id: 'q1',
        kind: 'point',
        on: 'n1',
        at: [1040, 520],
        text: '0.7',
    });
    assert.deepEqual(board.read('q2 point 2/3 in n1').item.at, [1000, 520]);
    assert.equal(board.read('q2 point 2/3 in n1').error, 'id q2 is already on the board');
});

test('board ops: to the guard a component is one item at its box, and bad children are skipped', () => {
    const board = boardOps();
    board.read('a1 axes at 680,480 w=1080 h=680 x=0..5 y=0..32');
    assert.equal(board.read('t1 text "x²" at 1265,294').moved, undefined, 'clear of the box');
    assert.equal(
        board.read('t3 text "in" at 600,400').moved,
        true,
        'a top-level item inside the box moves',
    );
    assert.equal(board.read('p1 plot on a1 y=x^2').moved, undefined, 'children are not guarded');
    const moved = board.read('a2 axes at 700,480 w=400 h=300 x=0..1 y=0..1');
    assert.equal(moved.moved, true);
    assert.ok(
        moved.item.d.startsWith(`M${moved.item.at[0] - 200 + 60} `),
        'laid out at its new box',
    );
    for (const [line, cause] of [
        ['p3 plot on a9 y=x^3', 'unknown parent a9'],
        ['p4 plot y=x^3', 'plot needs on ID'],
        ['p5 plot on a1 y=x^^3', 'bad math'],
        ['p6 plot on a1 "x +"', 'bad math'],
        ['p7 plot on a1 "foo(x)"', 'bad math'],
        ['q1 point on a1 1', 'point needs numberline, not axes a1'],
        ['d1 dot 9,9 on a1', 'dot needs X,Y inside the axes'],
        ['b1 box at 10,10 on a1', 'box cannot go on a component'],
        ['c1 arrow from t1 to p1', 'unknown id p1'],
        ['a3 axes at 300,300 x=5..1', 'ranges are LO..HI'],
    ])
        assert.equal(board.read(line).error, cause, line);
});

test('board ops: plot math keeps precedence, unary minus and implicit products', () => {
    for (const [text, x, y] of [
        ['-x^2', 3, -9],
        ['2x^2', 3, 18],
        ['x^2^3', 2, 256],
        ['2^-1', 0, 0.5],
        ['sin(x)^2', 1, Math.sin(1) ** 2],
        ['2(x+1)', 1, 4],
        ['e^x', 1, Math.E],
    ])
        assert.equal(expression(text)(x), y, text);
});

test('board ops: ticks keep exact values and skip a 0 an axis runs through', () => {
    const board = boardOps();
    const labels = (line) => board.read(line).item.labels.map((l) => l.text);
    assert.deepEqual(labels('n1 numberline at 800,150 range=0..0.5'), ['0', '0.25', '0.5']);
    assert.deepEqual(labels('a1 axes at 800,550 w=800 h=600 x=-2..2 y=-2..2'), [
        '-2',
        '-1',
        '1',
        '2',
        '-2',
        '-1',
        '1',
        '2',
    ]);
});
