import { test } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../support/diagram-kit.mjs';
import { boardProvider, messages, opened, setup } from '../support/board-kit.mjs';

// Board pages (ADR 0029) through the board session: sent down, saved as op lines and replayed on reopen.
test('board: pages and opens are saved as op lines and reopen on the page the latest reply ended on', async (t) => {
    const provider = boardProvider([
        [
            '> Forces push.\nf1 box at 400,450\n> Friction first.\ns1 page "Friction" from=f1\nr1 dot at 800,450\n',
        ],
        ['> Back to the forces.\no1 open first\nh1 highlight f1\n'],
        // A board saved before pages: its clear still opens a fresh untitled page.
        ['> Fresh space.\nn1 clear\nd1 dot at 800,450\n'],
        ['> Still here.\n'],
    ]);
    const { env, id, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const answer = async (text, sentences) => {
        board.send({ type: 'ask', text });
        const ops = [];
        for (let i = 0; i < sentences; i++) {
            const sentence = await board.next('sentence');
            ops.push(...sentence.ops);
            for (const phase of ['start', 'end'])
                board.send({ type: 'progress', sentence: sentence.id, phase });
        }
        await board.next('state', (e) => e.state === 'idle');
        return ops;
    };
    const side = await answer('Why does it stop?', 2);
    assert.deepEqual(side[1], {
        id: 's1',
        kind: 'page',
        top: 900,
        title: 'Friction',
        parent: 'first',
        origin: 'f1',
    });
    assert.deepEqual(side[2].at, [800, 1350], 'r1 lands on the side page');
    const back = await answer('Got it.', 1);
    // Each turn starts with the page index, the open page marked.
    assert.equal(
        provider.boards[0].indexes[1],
        'BOARD PAGES (* marks the open page)\nfirst "Page 1": f1\n* s1 "Friction" parent=first from=f1: r1',
    );
    assert.deepEqual(back[0], { id: 'o1', kind: 'open', page: 'first', top: 0 });
    assert.equal(back[1].kind, 'highlight', 'f1 is on the open page again');
    // The chat snapshot of each reply ends on its page.
    assert.equal(messages(env, id)[3].snapshot.findLast((i) => i.top !== undefined).top, 0);
    await answer('More?', 1);
    board.send({ type: 'leave' });
    const again = connect();
    const replies = (await again.next('board')).replies;
    assert.deepEqual(
        replies.map((r) => [r.page, r.items.map((i) => i.id)]),
        [
            ['s1', ['f1', 's1', 'r1']],
            ['first', ['o1', 'h1']],
            ['n1', ['n1', 'd1']],
        ],
    );
    assert.deepEqual(replies[2].items[0], {
        id: 'n1',
        kind: 'clear',
        top: 1800,
        title: 'Page 3',
        parent: 'first',
    });
    // A new model process still gets every saved page, rebuilt from the store.
    again.send({ type: 'ask', text: 'Still there?' });
    await until(() => provider.boards[1]?.indexes.length);
    assert.equal(
        provider.boards[1].indexes[0],
        'BOARD PAGES (* marks the open page)\nfirst "Page 1": f1\ns1 "Friction" parent=first from=f1: r1\n* n1 "Page 3" parent=first: d1',
    );
});
