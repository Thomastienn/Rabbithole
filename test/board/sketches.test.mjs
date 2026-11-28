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

test('board ops: bars, pie, spectrum and quadrant children are range-checked and reach highlight and the index', () => {
    const board = boardOps();
    assert.equal(board.read('g1 bars at 800,450').item.h, 520, 'a default box');
    for (const [id, text, value] of [
        ['b1', 'Mercury', 3.2],
        ['b2', 'Venus', 6],
        ['b3', 'Earth', 8.3],
        ['b4', 'Mars', 12.7],
        ['b5', 'Jupiter', 43],
    ])
        assert.equal(
            board.read(`${id} bar "${text}" value=${value} unit="min" in g1`).item.value,
            value,
        );
    const wash = board.read('h1 highlight b3').item;
    assert.deepEqual(
        [wash.at[0] - wash.w / 2, wash.at[1] - wash.h / 2, wash.w, wash.h],
        [180, 408, 496, 84], // the mockup rounds the value's width down to 495.9,
    );
    board.read('p2 page');
    board.read('a1 pie at 800,450');
    board.read('s1 slice "Nitrogen" value=78 in a1');
    board.read('t1 spectrum ends="acid..alkaline" at 800,450 w=1300 h=440');
    assert.equal(board.read('q1 place "Water" in t1').item.text, 'Water', 'note may be left out');
    board.read('k1 quadrant x="cheap..costly" y="dirty..clean" at 800,450 w=1300 h=780');
    assert.deepEqual(board.read('m1 spot "Coal" 2,1 in k1').item.xy, [2, 1]);
    for (const [line, cause] of [
        ['x1 bar "Less" value=-1 in g1', 'unknown parent g1'],
        ['x2 slice "Gone" value=-5 in a1', 'slice value must be above 0'],
        ['x3 slice "Nothing" in a1', 'slice needs value=N'],
        ['x4 spot "Far" 11,2 in k1', 'spot X and Y are from 0 to 10'],
        ['x5 spot "Under" 3,-1 in k1', 'spot X and Y are from 0 to 10'],
        ['x6 spot "Nowhere" in k1', 'spot needs X,Y'],
        ['x7 spectrum at 800,450', 'spectrum needs ends="low..high"'],
        ['x8 quadrant x="a..b" at 800,450', 'quadrant needs x="low..high" y="low..high"'],
        ['x9 place "Lost" in a1', 'place needs spectrum, not pie a1'],
    ])
        assert.equal(board.read(line).error, cause, line);
    board.read('p3 page');
    board.read('g2 bars at 800,450');
    assert.equal(board.read('x10 bar "Less" value=-1 in g2').error, 'bar value must be 0 or more');
    assert.match(
        board.index(),
        /a1 pie \(s1 "Nitrogen"\), t1 spectrum \(q1 "Water"\), k1 quadrant \(m1 "Coal"\)/,
    );
});
