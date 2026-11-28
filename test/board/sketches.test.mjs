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

test('board ops: a drawing scales its paths from 0-100 into its box, and bad paths are skipped with their reason', () => {
    const board = boardOps();
    assert.deepEqual(board.read('dr drawing at 470,450 w=620 h=620').item.w, 620);
    assert.deepEqual(board.read('p1 path "M26 64H74V72H26Z" ink=ink fill=pink in dr').item, {
        ...{ id: 'p1', kind: 'path', on: 'dr', ink: 'ink', fill: 'pink', d: 'M26 64H74V72H26Z' },
        ...{ fit: [160, 140, 6.2], at: [470, 561.6], w: 297.6, h: 49.6 },
    });
    const leaf = board.read('p2 path "m51 42c9-4 20-11 25-20" ink=green in dr').item;
    assert.equal(leaf.fill, undefined, 'fill may be left out');
    assert.deepEqual([leaf.at, leaf.w, leaf.h], [[553.7, 338.4], 155, 124], 'relative points');
    assert.equal(Math.round(board.read('t1 pointer p2').item.at[0]), 643, 'a path is a board item');
    const ring = [
        [140, 120],
        [800, 120],
        [800, 780],
        [140, 780],
        [145, 125],
    ];
    assert.deepEqual(board.mark(ring), { verb: 'circled', ids: ['dr'] }, 'the whole drawing');
    for (const [line, cause] of [
        [
            'b1 path "M51 42 url(x)" ink=green in dr',
            'path needs "d" of SVG path commands and numbers only',
        ],
        ['b2 path "M1 1L2 2" ink=red in dr', 'ink is blue|green|pink|yellow|ink|muted'],
        ['b3 path "M1 1L2 2" ink=ink fill=#f00 in dr', 'fill is blue|green|pink|yellow|ink|muted'],
        [`b4 path "M${' 1'.repeat(300)}" ink=ink in dr`, 'path data is over 600 characters'],
        ['b5 path "M1 1L2 2" ink=ink in zz', 'unknown parent zz'],
    ])
        assert.deepEqual(board.read(line), { error: cause }, line);
    assert.match(board.index(), /: dr drawing \(2 paths\)$/m, 'the index counts its paths');
    for (let i = 3; i <= 24; i++) assert.ok(board.read(`q${i} path "M1 1L2 2" in dr`).item);
    assert.deepEqual(board.read('q25 path "M1 1L2 2" in dr'), { error: 'dr already has 24 paths' });
    board.read('n2 page');
    board.read('wd drawing at 800,450 w=1200 h=400');
    assert.deepEqual(
        board.read('w1 path "M0 0L100 100" in wd').item.fit,
        [600, 1150, 4],
        'the square scales by the smaller side and centres, on page 2 900 down',
    );
});
