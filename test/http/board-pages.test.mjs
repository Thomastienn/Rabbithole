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
    assert.deepEqual(back[0], { id: 'o1', kind: 'open', page: 'first', top: 0 });
    assert.equal(back[1].kind, 'highlight', 'f1 is on the open page again');
    // The chat snapshot of each reply ends on its page.
    assert.equal(messages(env, id)[3].snapshot.findLast((i) => i.top !== undefined).top, 0);
    await answer('More?', 1);
    board.send({ type: 'leave' });
    const replies = (await connect().next('board')).replies;
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
});

// The learner's view (ADR 0029): opening a page sends nothing to the model; asking from it saves an open op with
// the question, names the page, and the tutor answers there, also after reopening.
test('board: asking from a page the learner opened answers on that page', async (t) => {
    const provider = boardProvider([
        ['> Forces push.\nf1 box at 400,450\n> Friction first.\ns1 page "Friction" from=f1\n'],
        ['> On the forces page.\na1 dot at 800,450\n'],
        ['> Still here.\na2 dot at 1200,450\n'],
    ]);
    const { env, id, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);
    const play = async (sentence) => {
        for (const phase of ['start', 'end'])
            board.send({ type: 'progress', sentence: sentence.id, phase });
    };
    board.send({ type: 'ask', text: 'Why does it stop?' });
    for (let i = 0; i < 2; i++) await play(await board.next('sentence'));
    await board.next('state', (e) => e.state === 'idle');

    // Opened, back to the tutor's page, then opened again: only the last open waits with the strokes.
    for (const page of ['first', 's1', 'first']) board.send({ type: 'view', page });
    for (const top of [0, 900, 0]) assert.equal((await board.next('stroke')).item.top, top);
    // The pen marks only items on the page on screen.
    board.send({
        type: 'stroke',
        points: [
            [600, 300],
            [545, 450],
        ],
    });
    assert.deepEqual((await board.next('stroke')).mark, { verb: 'pointed at', ids: ['f1'] });
    assert.equal(provider.boards[0].asked.length, 1, 'a view alone sends nothing');

    board.send({ type: 'ask', text: 'And here?' });
    const sentence = await board.next('sentence');
    assert.deepEqual(sentence.ops[0].at, [800, 450], 'the reply lands on the page asked from');
    assert.equal(
        provider.boards[0].asked[1],
        'And here?\n\npen: pointed at f1 · strokes p4\npage: first',
    );
    assert.deepEqual(
        env.store
            .boardReplies(id)
            .find((m) => m.role === 'user' && m.lines.length)
            .lines.map((line) => line.split(' ').slice(0, 2).join(' ')),
        ['p3 open', 'p4 stroke'],
    );
    // Mid-reply the view waits for the reply to end, so the tutor's items stay on its page.
    board.send({ type: 'view', page: 's1' });
    await play(sentence);
    assert.deepEqual((await board.next('stroke')).item, {
        id: 'p5',
        kind: 'open',
        page: 's1',
        top: 900,
    });
    await board.next('state', (e) => e.state === 'idle');
    board.send({ type: 'ask', text: 'Why?' });
    await play(await board.next('sentence'));
    await board.next('state', (e) => e.state === 'idle');
    assert.equal(provider.boards[0].asked[2], 'Why?\n\npage: s1');

    board.send({ type: 'leave' });
    const replies = (await connect().next('board')).replies;
    assert.deepEqual(
        replies.map((r) => [r.page, r.items.map((i) => i.at?.join() ?? i.id)]),
        [
            // The learner's ops join the board they were made on.
            ['first', ['400,450', 's1', 'p3', 'p4']],
            ['s1', ['800,450', 'p5']],
            ['s1', ['1200,1350']],
        ],
    );
});
