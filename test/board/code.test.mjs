import test from 'node:test';
import assert from 'node:assert/strict';
import { boardOps } from '../../server/board/ops.mjs';

test('board ops: a code block takes its lines in order, each its own item, and skips bad ones', () => {
    const board = boardOps();
    assert.deepEqual(board.read('cb code lang="py" at 570,450 w=900 h=640').item, {
        id: 'cb',
        kind: 'code',
        at: [570, 450],
        w: 900,
        h: 640,
        lang: 'py',
    });
    assert.deepEqual(board.read('l1 line "def f(n):" in cb').item, {
        id: 'l1',
        kind: 'line',
        on: 'cb',
        text: 'def f(n):',
    });
    assert.equal(
        board.read('l2 line "    return 1  " in cb').item.text,
        '    return 1',
        'indent kept',
    );
    assert.equal(board.read('l3 line "" in cb').item.text, '', 'a blank line');
    assert.equal(board.read('cx code at 1300,450 w=400 h=300').item.lang, 'plaintext');
    assert.deepEqual(
        board.read('c1 line 100,100 -> 300,100').item.points,
        [
            [100, 100],
            [300, 100],
        ],
        'a line off a code block is still a stroke',
    );
    const pointer = board.read('p1 pointer l2').item;
    assert.equal(pointer.names[0], 'l2', 'a line is a board item the pointer reaches');
    assert.ok(pointer.at[1] > 200 && pointer.at[1] < 300, 'at its own row');
    board.read('cs code at 1300,800 w=400 h=100');
    board.read('s1 line "a" in cs');
    for (const [line, cause] of [
        ['c2 code lang="c c" at 800,800', 'lang is a language name like py'],
        ['c3 code lang=py at 800,800 w=0', 'sizes must be positive'],
        ['l4 line in cb', 'line needs one "code"'],
        ['l5 line "a" "b" in cb', 'line needs one "code"'],
        ['l6 line "x = "hi"" in cb', 'unexpected token "hi"""'],
        ['l7 line "a" in c9', 'unknown parent c9'],
        ['l8 line "a" in cs', 'no room for l8 in cs'],
    ])
        assert.equal(board.read(line).error, cause, line);
});
