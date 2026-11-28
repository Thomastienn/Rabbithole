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

test('board ops: compare, sequence and equation children are checked against their sketch', () => {
    const board = boardOps();
    assert.deepEqual(
        board.read('c1 compare vs="Bacteria|Virus" at 800,450').item.w,
        1100,
        'a default box',
    );
    assert.ok(board.read('a1 aspect "Size" values="about 1 µm|about 0.1 µm" in c1').item);
    board.read('p2 page');
    const q1 = board.read('q1 sequence actors="Browser|DNS|Server" at 800,450').item;
    assert.deepEqual([q1.w, q1.h], [1200, 700]);
    assert.deepEqual(board.read('m1 send "GET /" by=Browser to=Server in q1 look=focus').item, {
        id: 'm1',
        kind: 'send',
        on: 'q1',
        text: 'GET /',
        by: 0,
        to: 2,
        look: 'focus',
    });
    assert.equal(board.read('m2 send "Draws it" by=browser in q1').item.to, undefined, 'a note');
    board.read('p3 page');
    board.read('x1 equation "E = m c^2" at 800,450');
    assert.equal(board.read('y1 symbol "c" means="the speed of light" in x1').item.token, 3);
    assert.equal(
        Math.round(board.read('t1 pointer y1').item.at[0]),
        1238,
        'stops right of the meaning',
    );
    for (const [line, cause] of [
        ['b1 aspect "Alive" values="yes" in c1', 'unknown parent c1'],
        ['b2 send "Hi" by=Client to=DNS in q1', 'unknown parent q1'],
        ['b3 symbol "x" means="a length" in x1', "symbol needs one of x1's symbols"],
        ['b4 symbol "=" means="equals" in x1', "symbol needs one of x1's symbols"],
        ['b5 symbol "E" in x1', 'symbol needs means="…"'],
        ['b6 compare vs="Only" at 800,450', 'compare needs vs="A|B"'],
        ['b7 sequence actors="Solo" at 800,450', 'sequence needs actors="A|B|C"'],
        ['b8 equation "= +" at 800,450', 'equation needs "symbols separated by spaces"'],
    ])
        assert.equal(board.read(line).error, cause, line);
    board.read('o1 open p2');
    for (const [line, cause] of [
        ['b9 send "Hi" by=Client to=DNS in q1', 'send needs by= one of Browser|DNS|Server'],
        ['b10 send "Hi" by=DNS to=Proxy in q1', 'send needs to= another of Browser|DNS|Server'],
        ['b11 send "Hi" by=DNS to=DNS in q1', 'send needs to= another of Browser|DNS|Server'],
    ])
        assert.equal(board.read(line).error, cause, line);
    board.read('o2 open first');
    for (const values of ['yes', 'yes|no|maybe', 'yes|'])
        assert.equal(
            board.read(`b12 aspect "Alive" values="${values}" in c1`).error,
            'aspect needs values="a|b", one per side of c1',
            values,
        );
    assert.match(board.index(), /c1 "Bacteria\|Virus" compare \(a1 "Size"\)/);
    assert.match(
        board.index(),
        /q1 "Browser\|DNS\|Server" sequence \(m1 "GET \/", m2 "Draws it"\)/,
    );
    assert.match(board.index(), /x1 "E = m c\^2" equation \(y1 "c"\)/);
});
