import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { componentParts } = await import('../../src/board/layout.ts');

// The parts of `id` after the ops so far, as `key x,y,w,h | d | text@x,y`.
const draw = (ops, id) =>
    componentParts(ops)
        .get(id)
        .map((p) =>
            p.kind === 'box'
                ? `${p.key} ${p.x},${p.y},${p.w},${p.h}`
                : p.kind === 'line'
                  ? `${p.key} ${p.d}`
                  : p.kind === 'circle'
                    ? `${p.key} ${p.x},${p.y},${p.r}`
                    : `${p.text}@${p.x},${p.y}`,
        );

test('board layout: a flow adds one step and its arrow at a time, reflowing the earlier steps', () => {
    const ops = [{ id: 'f1', kind: 'flow', at: [800, 430], w: 1400, h: 260, dir: 'right' }];
    const step = (id, text) => ops.push({ id, kind: 'step', on: 'f1', text });
    step('s1', 'Grapes');
    assert.deepEqual(draw(ops, 's1'), ['box 670,375,260,110', 'Grapes@800,441']);
    step('s2', 'Crushed');
    assert.deepEqual(draw(ops, 's1'), ['box 320,375,260,110', 'Grapes@450,441'], 'reflowed');
    assert.deepEqual(draw(ops, 's2'), [
        'arrow M596 430H1004M990 416L1004 430L990 444',
        'box 1020,375,260,110',
        'Crushed@1150,441',
    ]);
    ['Ferment', 'Aged', 'Wine'].forEach((text, i) => step(`s${i + 3}`, text));
    assert.deepEqual(draw(ops, 's2'), [
        'arrow M344 430H416M402 416L416 430L402 444',
        'box 432,375,176,110',
        'Crushed@520,441',
    ]);
    const [arrow, box, text] = componentParts(ops).get('s2');
    assert.ok(arrow.t[1] <= box.t[0] && box.t[1] <= text.t[0], 'arrow, then box, then label');
});

test('board layout: a tree adds one node and its edge at a time, splitting its parent span', () => {
    const ops = [{ id: 't1', kind: 'tree', at: [800, 450], w: 1200, h: 640 }];
    const node = (id, text, under) => ops.push({ id, kind: 'node', on: 't1', text, under });
    node('c0', 'Cats');
    node('c1', 'Big cats', 'c0');
    assert.deepEqual(draw(ops, 'c1'), [
        'edge M800 252L800 408',
        'box 695,408,210,84',
        'Big cats@800,462',
    ]);
    node('c2', 'Small cats', 'c0');
    assert.deepEqual(draw(ops, 'c1')[0], 'edge M800 252L500 408', 'its edge swings with it');
    node('c3', 'Lion', 'c1');
    node('c4', 'Tiger', 'c1');
    assert.deepEqual(draw(ops, 'c4'), [
        'edge M500 492L650 648',
        'box 573,648,154,84',
        'Tiger@650,702',
    ]);
    node('c5', 'Cub', 'c4');
    assert.deepEqual(
        [draw(ops, 'c4')[2], draw(ops, 'c5')[2]],
        ['Tiger@650,542', 'Cub@650,702'],
        'a deeper row tightens the rows evenly',
    );
});

test('board layout: a table adds one row at a time and tightens them when they would not fit', () => {
    const ops = [
        { id: 'p1', kind: 'table', at: [800, 450], w: 1100, h: 420, cols: ['Planet', 'One spin'] },
    ];
    const row = (id, ...cells) => ops.push({ id, kind: 'row', on: 'p1', cells });
    row('r1', 'Earth', '1 day');
    assert.deepEqual(draw(ops, 'p1'), ['Planet@274,288', 'One spin@824,288', 'rule M250 310H1350']);
    assert.deepEqual(draw(ops, 'r1'), ['Earth@274,377', '1 day@824,377']);
    row('r2', 'Mars', '1 day');
    row('r3', 'Mercury', '59 days');
    row('r4', 'Venus', '243 days');
    assert.deepEqual(draw(ops, 'r1'), ['Earth@274,366', '1 day@824,366'], 'reflowed to 87.5');
    assert.deepEqual(draw(ops, 'r4'), [
        'seam M250 572.5H1350',
        'Venus@274,628',
        '243 days@824,628',
    ]);
});

test('board layout: a Venn diagram draws one circle at a time, then items in their regions', () => {
    const ops = [
        { id: 'v1', kind: 'venn', at: [800, 470], w: 1100, h: 620, sets: ['Birds', 'Can fly'] },
    ];
    assert.deepEqual(draw(ops, 'v1'), [
        'circle0 640,480,260',
        'Birds@520,192',
        'circle1 960,480,260',
        'Can fly@1080,192',
    ]);
    const item = (id, text, region) => ops.push({ id, kind: 'item', on: 'v1', text, region });
    item('i1', 'Penguin', [0]);
    item('i2', 'Sparrow', [0, 1]);
    item('i3', 'Bat', [1]);
    assert.deepEqual(draw(ops, 'i1'), ['Penguin@500,492']);
    item('i4', 'Ostrich', [0]);
    assert.deepEqual(draw(ops, 'i1'), ['Penguin@500,462'], 'pushed up by the second item');
    assert.deepEqual([draw(ops, 'i4'), draw(ops, 'i2'), draw(ops, 'i3')].flat(), [
        'Ostrich@500,522',
        'Sparrow@800,492',
        'Bat@1100,492',
    ]);
    const three = [
        {
            id: 'v2',
            kind: 'venn',
            at: [800, 480],
            w: 1100,
            h: 800,
            sets: ['Lays eggs', 'Can fly', 'Swims'],
        },
        { id: 'd', kind: 'item', on: 'v2', text: 'Duck', region: [0, 1, 2] },
        { id: 'p', kind: 'item', on: 'v2', text: 'Penguin', region: [0, 2] },
    ];
    assert.deepEqual(
        draw(three, 'v2').filter((p) => p.startsWith('circle')),
        ['circle0 680,380,230', 'circle1 920,380,230', 'circle2 800,588,230'],
    );
    assert.deepEqual([draw(three, 'd'), draw(three, 'p')].flat(), [
        'Duck@800,461',
        'Penguin@668,540',
    ]);
});

// Sketches (mockup Rabbithole-bsk.4): the numbers are the mockup's.
const sketch = (parent, kind, children) => [
    parent,
    ...children.map((fields, i) => ({ id: `${kind}${i + 1}`, kind, on: parent.id, ...fields })),
];

test('board layout: a cycle shares its loop between two runs and moves stages as new ones arrive', () => {
    const box = { id: 'w1', kind: 'cycle', at: [800, 450], w: 1200, h: 560 };
    const stages = ['Evaporation', 'Condensation', 'Precipitation', 'Collection'].map((text) => ({
        text,
    }));
    const one = sketch(box, 'stage', stages.slice(0, 1));
    assert.equal(componentParts(one).get('w1'), undefined, 'no loop for one stage');
    assert.deepEqual(draw(one, 'stage1'), ['station 800,220,14', 'Evaporation@800,275']);
    const three = sketch(box, 'stage', stages.slice(0, 3));
    assert.deepEqual(draw(three, 'stage2'), [
        'chevron M792 236L808 220L792 204',
        'station 1080,220,14',
        'Condensation@1080,275',
    ]);
    const four = sketch(box, 'stage', stages);
    assert.deepEqual(draw(four, 'stage1'), ['station 520,220,14', 'Evaporation@520,275']);
    assert.deepEqual(draw(four, 'stage3')[0], 'chevron M1344 422L1360 438L1376 422');
    assert.deepEqual(draw(four, 'stage4'), [
        'chevron M808 624L792 640L808 656',
        'station 520,640,14',
        'Collection@520,695',
        'close M256 438L240 422L224 438',
    ]);
    assert.ok(!draw(four, 'stage3').some((p) => p.startsWith('close')), 'only the last closes');
    const ten = sketch(
        box,
        'stage',
        Array.from({ length: 10 }, (_, i) => ({ text: `S${i}` })),
    );
    assert.deepEqual(draw(ten, 'stage1'), ['station 352,220,11.4', 'S0@352,265']);
    assert.deepEqual(draw(ten, 'stage10')[1], 'station 352,640,11.4');
});

test('board layout: a stack centres its layers, lining notes up past the widest name', () => {
    const box = { id: 'n1', kind: 'stack', at: [800, 450], w: 1100, h: 600 };
    const layers = [
        { text: 'HTTP', note: 'the page you asked for' },
        { text: 'TLS', note: 'keeps it secret' },
    ];
    assert.deepEqual(draw(sketch(box, 'layer', layers.slice(0, 1)), 'layer1'), [
        'HTTP@250,457',
        'the page you asked for@364.6,456',
        'shelf M250 494H1350',
    ]);
    const two = sketch(box, 'layer', layers);
    assert.deepEqual(draw(two, 'layer1')[0], 'HTTP@250,407', 'lifted by half a row');
    layers.push({ text: 'Ethernet', note: 'the wire' });
    assert.equal(draw(sketch(box, 'layer', layers), 'layer2')[1], 'keeps it secret@431.1,456');
    const ten = sketch(
        box,
        'layer',
        Array.from({ length: 10 }, (_, i) => ({ text: `L${i}` })),
    );
    assert.deepEqual(draw(ten, 'layer1'), ['L0@250,185', 'shelf M250 204H1350']);
    assert.deepEqual(draw(ten, 'layer10')[1], 'shelf M250 744H1350', 'still inside the box');
});

test('board layout: a timeline runs its events down one line, each drawing the line from the last', () => {
    const box = { id: 'y1', kind: 'timeline', at: [800, 450], w: 1000, h: 640 };
    const events = [
        { text: 'Anglo-Saxons arrive', when: '450' },
        { text: 'Normans conquer', when: '1066' },
    ];
    assert.deepEqual(draw(sketch(box, 'event', events.slice(0, 1)), 'event1'), [
        'station 389.9,450,14',
        '450@351.9,461',
        'Anglo-Saxons arrive@427.9,461',
    ]);
    const two = sketch(box, 'event', events);
    assert.deepEqual(draw(two, 'event1')[0], 'station 406.6,395,14', 'reflowed');
    assert.deepEqual(draw(two, 'event2').slice(0, 2), [
        'line M406.6 409V491',
        'station 406.6,505,14',
    ]);
});

test('board layout: parts hang off a bus from the whole, the bus growing with each part', () => {
    const box = { id: 'r1', kind: 'parts', at: [800, 450], w: 1300, h: 560, whole: 'A neuron' };
    assert.deepEqual(draw([box], 'r1'), ['station 323.1,450,14', 'A neuron@285.1,461']);
    const list = [
        { text: 'Dendrites', note: 'take signals in' },
        { text: 'Cell body', note: 'keeps it alive' },
    ];
    assert.deepEqual(draw(sketch(box, 'part', list.slice(0, 1)), 'part1'), [
        'bus M337.1 450H403.1M403.1 450V450',
        'branch M403.1 450H469.1',
        'station 483.1,450,14',
        'Dendrites@521.1,461',
        'take signals in@710.9,460',
    ]);
    const two = sketch(box, 'part', list);
    assert.equal(draw(two, 'part1')[0], 'bus M337.1 450H403.1M403.1 395V505');
    assert.deepEqual(draw(two, 'part2'), [
        'branch M403.1 505H469.1',
        'station 483.1,505,14',
        'Cell body@521.1,516',
        'keeps it alive@710.9,515',
    ]);
});

test('board layout: an erased child keeps its place while the rest reflow without it', () => {
    const box = { id: 'y1', kind: 'timeline', at: [800, 450], w: 1000, h: 640 };
    const ops = sketch(box, 'event', [
        { text: 'A', when: '1' },
        { text: 'B', when: '2' },
    ]);
    const parts = componentParts(ops, new Set(['event2']));
    assert.equal(parts.get('event1')[0].y, 450, 'alone again, centred');
    assert.equal(parts.get('event2')[1].y, 505, 'fading where it was');
});

// Compare, sequence and equation (mockup Rabbithole-bsk.6): the numbers are the mockup's.
test('board layout: a compare widens its aspect column to the longest name and stacks rows down', () => {
    const box = {
        id: 'c1',
        kind: 'compare',
        at: [800, 450],
        w: 1100,
        h: 500,
        vs: ['Bacteria', 'Virus'],
    };
    const one = sketch(box, 'aspect', [{ text: 'Size', values: ['about 1 µm', 'about 0.1 µm'] }]);
    assert.deepEqual(draw(one, 'c1'), [
        'Bacteria@458,244',
        'Virus@904,244',
        'rule M458 270H864M904 270H1350',
    ]);
    assert.deepEqual(draw(one, 'aspect1'), [
        'Size@250,338',
        'about 1 µm@458,339',
        'about 0.1 µm@904,339',
    ]);
    const rows = ['Alive on its own', 'Has a cell wall', 'Antibiotics work'].map((text) => ({
        text,
        values: ['yes', 'no'],
    }));
    const four = sketch(box, 'aspect', [
        { text: 'Size', values: ['about 1 µm', 'about 0.1 µm'] },
        ...rows,
    ]);
    assert.equal(draw(four, 'c1')[2], 'rule M531 270H900.5M940.5 270H1350', 'reflowed');
    assert.deepEqual(draw(four, 'aspect3'), [
        'seam M250 472H1350',
        'Has a cell wall@250,530',
        'yes@531,531',
        'no@940.5,531',
    ]);
    const ten = sketch(
        box,
        'aspect',
        Array.from({ length: 10 }, (_, i) => ({ text: `A${i}`, values: ['x', 'y'] })),
    );
    const last = componentParts(ten).get('aspect10');
    assert.ok(
        last.every((p) => p.kind === 'line' || p.y <= 700),
        'still inside the box',
    );
    assert.equal(last[1].size, 22.8, 'notes shrink by 26/32');
});

test('board layout: a sequence draws arrows between actors, breaks crossed lifelines and notes an actor', () => {
    const box = {
        id: 'q1',
        kind: 'sequence',
        at: [800, 450],
        w: 1200,
        h: 700,
        actors: ['Browser', 'DNS', 'Server'],
    };
    const sends = [
        { text: 'Where is example.com?', by: 0, to: 1 },
        { text: '93.184.215.14', by: 1, to: 0 },
        { text: 'GET /', by: 0, to: 2 },
        { text: 'The page', by: 2, to: 0 },
        { text: 'Draws it', by: 0 },
    ];
    assert.deepEqual(draw(sketch(box, 'send', []), 'q1').slice(3), [
        'life0 M400 160V240',
        'life1 M800 160V240',
        'life2 M1200 160V240',
    ]);
    const one = sketch(box, 'send', sends.slice(0, 1));
    assert.equal(draw(one, 'q1')[3], 'life0 M400 160V300');
    assert.deepEqual(draw(one, 'send1'), [
        'Where is example.com?@600,238',
        'arrow M400 258H794M780 272L794 258L780 244',
    ]);
    const five = sketch(box, 'send', sends);
    assert.deepEqual(draw(five, 'send2')[1], 'arrow M800 358H406M420 344L406 358L420 372');
    assert.deepEqual(draw(five, 'send3'), [
        'gap1 M800 404V468',
        'GET /@800,438',
        'arrow M400 458H1194M1180 472L1194 458L1180 444',
    ]);
    assert.deepEqual(draw(five, 'send5'), ['station 400,640,12', 'Draws it@430,650']);
    assert.equal(draw(five, 'q1')[5], 'life2 M1200 160V700');
    const tcp = { ...box, actors: ['Client', 'Server'] };
    const ten = sketch(
        tcp,
        'send',
        Array.from({ length: 10 }, (_, i) => ({ text: 'SYN', by: i % 2, to: 1 - (i % 2) })),
    );
    assert.deepEqual(draw(ten, 'send1'), [
        'SYN@800,213.9',
        'arrow M500 230.1H1094M1080 244.1L1094 230.1L1080 216.1',
    ]);
    assert.equal(draw(ten, 'q1')[3], 'life1 M1100 160V790', 'still inside the box');
});

test('board layout: an equation hangs each meaning off its symbol, the rightmost symbol on top', () => {
    const box = { id: 'x1', kind: 'equation', at: [800, 450], w: 1200, h: 500, text: 'E = m c^2' };
    assert.deepEqual(draw([box], 'x1'), [
        'E@667.9,310',
        '=@735.2,310',
        'm@802.6,310',
        'c@869.9,310',
        '2@909.2,280',
    ]);
    const one = sketch(box, 'symbol', [{ text: 'E', means: 'energy', token: 0 }]);
    assert.deepEqual(draw(one, 'symbol1'), ['leader M687.6 334V390H727.6', 'energy@743.6,400']);
    const three = sketch(box, 'symbol', [
        { text: 'E', means: 'energy', token: 0 },
        { text: 'm', means: 'mass', token: 2 },
        { text: 'c', means: 'the speed of light', token: 3 },
    ]);
    assert.deepEqual(draw(three, 'symbol1'), ['leader M687.6 334V534H727.6', 'energy@743.6,544']);
    assert.deepEqual(draw(three, 'symbol2'), ['leader M822.2 334V462H862.2', 'mass@878.2,472']);
    assert.deepEqual(draw(three, 'symbol3'), [
        'leader M889.5 334V390H929.5',
        'the speed of light@945.5,400',
    ]);
});
