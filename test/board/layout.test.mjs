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
