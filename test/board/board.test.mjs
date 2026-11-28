import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
import { mount } from './mountBoard.mjs';

test('board: an empty board waits for a typed question with the mic off, then shows it was heard', async (t) => {
    const board = await mount(t);
    assert.match(board.socket.url, /\/api\/trees\/c1\/board\?csrf=/);
    assert.ok(board.q('.board-empty'), 'the hint shows before the first board question');
    const mic = button(board.container, 'Turn mic on');
    assert.ok(!mic.disabled);
    assert.equal(mic.getAttribute('aria-pressed'), 'false');
    await board.type('How does a hypha grow?');
    await board.act(async () => button(board.container, 'Send').click());
    assert.deepEqual(
        board.socket.sent,
        [{ type: 'typing' }, { type: 'ask', text: 'How does a hypha grow?' }],
        'typing holds a tutor’s question open, then the question goes',
    );
    assert.equal(board.q('.board-empty'), null);
    assert.equal(board.q('.board-caption').textContent, 'How does a hypha grow?');
    assert.ok(board.q('.board-caption.muted'), 'the question shows muted while the tutor thinks');
    assert.ok(
        board.q('.board-waiting'),
        'the board shows the tutor heard, as the question is sent',
    );
    assert.ok(board.q('[role=status]').textContent, 'the learner hears a busy status');
    assert.ok(button(board.container, 'Send').disabled, 'Send waits for the tutor');
    assert.equal(board.q('[contenteditable=true]').textContent, '', 'the composer clears');
});

test('board: each sentence becomes the caption, reported as it shows, and leaving asks the server to save', async (t) => {
    const board = await mount(t);
    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    const thinking = board.q('[role=status]').textContent;
    await board.act(async () => {
        board.socket.server({ type: 'state', state: 'speaking' });
        board.socket.server({
            type: 'sentence',
            id: '1',
            text: 'A hypha grows at its tip.',
            ops: [{ id: 'tip', kind: 'circle', at: [800, 450], r: 60, look: 'focus' }],
        });
        board.socket.server({
            type: 'sentence',
            id: '2',
            text: 'Vesicles carry wall forward.',
            ops: [
                {
                    id: 'v1',
                    kind: 'arrow',
                    points: [
                        [100, 100],
                        [300, 100],
                    ],
                },
            ],
        });
    });
    assert.equal(board.q('.board-waiting'), null, 'the waiting cue goes as the tutor speaks');
    // The sentence on show draws its items at their board coordinates; the next one waits its turn.
    const drawn = [...board.container.querySelectorAll('svg .board-item')];
    assert.deepEqual(
        drawn.map((g) => [g.getAttribute('class'), g.firstElementChild.getAttribute('cx')]),
        [['board-item focus', '800']],
    );
    assert.equal(board.q('.board-caption').textContent, 'A hypha grows at its tip.');
    assert.equal(board.q('.board-caption.muted'), null);
    assert.ok(board.q('[role=status]').textContent);
    assert.notEqual(
        board.q('[role=status]').textContent,
        thinking,
        'the accessible status changes',
    );
    assert.deepEqual(board.socket.sent.at(-1), { type: 'progress', sentence: '1', phase: 'start' });
    await board.act(async () => board.socket.server({ type: 'notice', notice: 'Stopped.' }));
    assert.equal(board.q('[role=alert]').textContent, 'Stopped.');
    await board.act(async () => board.socket.server({ type: 'state', state: 'idle' }));
    assert.ok(board.q('.board-caption.muted'), 'the reply’s last caption is held, muted');
    assert.equal(board.q('[role=status]').textContent, '');
    await board.cleanup();
    assert.deepEqual(board.socket.sent.at(-1), { type: 'leave' });
    board.socket.close();
    assert.deepEqual(board.reloads, ['c1'], 'the conversation reloads once the server has saved');
});

test('board: a question waiting for its answer stays in ink with the waiting cue, and a no-answer turn adds no learner line', async (t) => {
    const board = await mount(t, [], undefined, true);
    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    const say = (id, text) =>
        board.act(async () => {
            board.socket.server({ type: 'state', state: 'speaking' });
            board.socket.server({ type: 'sentence', id, text });
        });
    await board.act(async () =>
        board.socket.server({ type: 'state', state: 'thinking', user: 'q1', reply: 'r1' }),
    );
    await say('1', 'What is the slope at the top?');
    await board.act(async () =>
        board.socket.server({ type: 'state', state: 'idle', waiting: true }),
    );
    assert.ok(
        board.q('.board-caption') && !board.q('.board-caption.muted'),
        'the question stays in ink',
    );
    assert.ok(board.q('.board-waiting'), 'the waiting cue shows while it waits');
    await board.type('Zero');
    assert.equal(board.q('.board-waiting'), null, 'typing an answer ends the waiting cue');
    await board.act(async () =>
        board.socket.server({ type: 'state', state: 'thinking', user: null, reply: 'r2' }),
    );
    await say('2', 'Look at the very top.');
    assert.deepEqual(
        [...board.q('[role=log]').querySelectorAll('.board-rail-question')].map(
            (n) => n.textContent,
        ),
        ['Why?'],
        'the silence is not a learner message',
    );
});

test('board: the rail lists what was said, the caption shows open or collapsed, and branching from it pauses and saves first', async (t) => {
    const board = await mount(
        t,
        [
            { id: 'q1', role: 'user', text: 'What are hyphae?', status: 'completed' },
            { id: 'r1', role: 'assistant', text: 'Hyphae are threads.', status: 'completed' },
        ],
        undefined,
        true,
    );
    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    await board.act(async () => {
        board.socket.server({ type: 'state', state: 'thinking', user: 'q2', reply: 'r2' });
        board.socket.server({ type: 'state', state: 'speaking' });
        board.socket.server({ type: 'sentence', id: '1', text: 'A hypha grows at its tip.' });
        board.socket.server({ type: 'sentence', id: '2', text: 'Not yet spoken.' });
    });
    const said = () =>
        [
            ...board
                .q('[role=log]')
                .querySelectorAll('.board-rail-question, .board-rail-reply section'),
        ].map((n) => n.textContent);
    assert.deepEqual(said(), [
        'What are hyphae?',
        'Hyphae are threads.',
        'Why?',
        'A hypha grows at its tip.',
    ]);
    assert.equal(
        board.q('.board-caption').textContent,
        'A hypha grows at its tip.',
        'open, the caption still shows',
    );
    await board.act(async () => button(board.container, 'Collapse transcript').click());
    assert.equal(board.q('[role=log]'), null);
    assert.equal(board.q('.board-caption').textContent, 'A hypha grows at its tip.');
    await board.act(async () => button(board.container, 'Show transcript').click());
    // Select "hypha" in the spoken reply from the keyboard, ask, and send the branch.
    await board.act(async () => button(board.container, 'Select passage in tutor reply 2').click());
    const input = board.q('[role=log] textarea');
    await board.act(async () => {
        input.setSelectionRange(2, 7);
        input.dispatchEvent(
            new window.KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
        );
    });
    await board.act(async () => button(board.container, 'Ask about selection').click());
    await board.act(async () => button(board.q('[role=log] form'), 'Send').click());
    assert.equal(
        button(board.container, 'Resume').getAttribute('aria-pressed'),
        'true',
        'the board pauses',
    );
    assert.match(board.q('.board-rail-head').textContent, /Paused/);
    assert.deepEqual(board.socket.sent.at(-1), { type: 'leave' });
    assert.deepEqual(board.submitted, [], 'the branch waits for the reply to be saved');
    await board.act(async () => board.socket.close());
    assert.deepEqual(
        board.submitted.map((b) => b.anchor),
        [{ messageId: 'r2', start: 2, end: 7, text: 'hypha', at: undefined }],
    );
});

test('board: reopened, it holds the latest board reply’s last sentence and its whole board at once, with no hint', async (t) => {
    const board = await mount(t, [
        { id: 'q', role: 'user', text: 'Why?', status: 'completed', board: true },
        {
            id: 'r',
            role: 'assistant',
            text: 'A hypha grows at its tip.\nDr. Lin explains how.',
            status: 'completed',
            board: true,
        },
        { id: 'later', role: 'assistant', text: 'A later chat reply.' },
    ]);
    assert.equal(board.q('.board-empty'), null);
    assert.equal(board.q('.board-caption.muted').textContent, 'Dr. Lin explains how.');
    assert.equal(board.q('[role=status]').textContent, '');
    await board.act(async () =>
        board.socket.server({
            type: 'board',
            replies: [
                {
                    caption: 'Dr. Lin explains how.',
                    items: [
                        { id: 'tip', kind: 'circle', at: [800, 450], r: 60 },
                        { id: 'v1', kind: 'dot', at: [900, 450] },
                    ],
                },
            ],
        }),
    );
    const drawn = [...board.container.querySelectorAll('svg .board-item')];
    assert.deepEqual(
        drawn.map((g) => [
            g.firstElementChild.getAttribute('cx'),
            g.style.getPropertyValue('--board-ms'),
        ]),
        [
            ['800', '0ms'],
            ['900', '0ms'],
        ],
        'every saved item shows at once, without entry',
    );
});

test('board: a number line point arriving later moves a crowded label up onto a leader', async (t) => {
    const board = await mount(t, []);
    const line = {
        id: 'n1',
        kind: 'numberline',
        at: [800, 500],
        w: 1300,
        h: 240,
        d: 'M200 520H1400',
    };
    const point = (id, x, text) => ({ id, kind: 'point', on: 'n1', at: [x, 520], text });
    const send = (ops) =>
        board.act(async () =>
            board.socket.server({ type: 'board', replies: [{ caption: 'Points.', items: ops }] }),
        );
    const label = () => board.q('.board-point-label');
    await send([line, point('q1', 1040, '0.7')]);
    assert.equal(label().style.translate, '0 0px');
    assert.equal(board.q('.board-leader'), null);
    await send([line, point('q1', 1040, '0.7'), point('q2', 1000, '2/3')]);
    assert.equal(label().textContent, '0.7');
    assert.equal(label().style.translate, '0 -60px', 'the same label slides to the second row');
    assert.equal(board.q('.board-leader').getAttribute('d'), 'M1040 420V500');
});

test('board: a code block colours its lines in the theme syntax roles, and an unknown lang stays plain', async (t) => {
    const { loadLanguage } = await import('../../src/markdown/codeTokens.ts');
    await loadLanguage('py');
    const board = await mount(t, []);
    const block = (id, lang, x) => [
        { id, kind: 'code', lang, at: [x, 450], w: 700, h: 300 },
        { id: `${id}l1`, kind: 'line', on: id, text: '    return "a"  # c' },
    ];
    await board.act(async () =>
        board.socket.server({
            type: 'board',
            replies: [
                {
                    caption: 'Code.',
                    items: [...block('py', 'py', 400), ...block('cb', 'pseudo', 1200)],
                },
            ],
        }),
    );
    const tokens = (id) =>
        [...board.container.querySelectorAll(`[data-item="${id}"] tspan`)].map((e) => [
            e.textContent,
            e.getAttribute('class'),
        ]);
    assert.deepEqual(tokens('pyl1'), [
        ['return', 'astryx-token-keyword'],
        ['"a"', 'astryx-token-string'],
        ['# c', 'astryx-token-comment'],
    ]);
    assert.equal(
        board.q('[data-item="pyl1"] text').textContent,
        '    return "a"  # c',
        'indent kept',
    );
    assert.deepEqual(tokens('cbl1'), [], 'no grammar, plain ink');
    assert.ok(board.q('[data-item="py"] .board-part-box.panel'), 'the panel');
});

test('board: disconnecting holds the last caption and keeps a typed draft', async (t) => {
    const board = await mount(t);
    await board.type('Keep this draft');
    await board.act(async () => {
        board.socket.server({ type: 'state', state: 'speaking' });
        board.socket.server({ type: 'sentence', id: '1', text: 'The visible caption.' });
        board.socket.server({ type: 'sentence', id: '2', text: 'The queued caption.' });
        board.socket.close();
    });
    assert.ok(board.q('[role=alert]'));
    assert.equal(board.q('[role=status]').textContent, '');
    assert.equal(board.q('.board-caption.muted').textContent, 'The visible caption.');
    assert.ok(button(board.container, 'Send').disabled);
    assert.equal(board.q('[contenteditable=true]').textContent, 'Keep this draft');
});

test('board: the learner steps back to the board after an earlier reply, and asking returns to the latest', async (t) => {
    const board = await mount(t, [
        { id: 'r', role: 'assistant', text: 'The bulb glows.', status: 'completed', board: true },
    ]);
    const ids = () =>
        [...board.container.querySelectorAll('svg .board-item')].map(
            (g) => g.firstElementChild.getAttribute('cx') ?? g.firstElementChild.tagName,
        );
    await board.act(async () =>
        board.socket.server({
            type: 'board',
            replies: [
                {
                    caption: 'The bulb glows.',
                    items: [
                        { id: 'bulb', kind: 'circle', at: [1240, 450], r: 70 },
                        { id: 'e1', kind: 'dot', at: [560, 180] },
                    ],
                },
                {
                    caption: 'More push, more current.',
                    items: [
                        { id: 'p1', kind: 'pointer', from: [800, 450], at: [432, 450] },
                        { id: 'x1', kind: 'erase', ids: ['e1'] },
                        { id: 'n1', kind: 'clear', top: 900, title: 'Page 2', parent: 'first' },
                        {
                            id: 'ohm',
                            kind: 'math',
                            at: [800, 1230],
                            size: 'l',
                            text: 'I = \\frac{V}{R}',
                        },
                    ],
                },
            ],
        }),
    );
    const steps = board.q('[aria-label="Board at each reply"]');
    assert.equal(steps.textContent, 'Reply 2 of 2');
    assert.ok(button(board.container, 'Board after the next reply').disabled);
    // The latest board: the erased dot and the replayed pointer gone, a second page below.
    assert.deepEqual(ids(), ['1240', 'foreignObject']);
    assert.equal(
        [...board.q('.board-math').querySelectorAll('.board-term')].length,
        3,
        'the formula writes in as three terms',
    );
    assert.equal(board.q('.board-scroller > svg').getAttribute('viewBox'), '0 0 1600 1800');
    assert.ok(board.q('.board-seam'));

    await board.act(async () => button(board.container, 'Board after the previous reply').click());
    assert.equal(steps.textContent, 'Reply 1 of 2');
    assert.equal(
        board.q('.board-scroller > svg').getAttribute('aria-label'),
        'Board after reply 1',
    );
    assert.deepEqual(ids(), ['1240', '560'], 'the board as it stood, the erased dot back');
    assert.equal(board.q('.board-scroller > svg').getAttribute('viewBox'), '0 0 1600 900');
    assert.equal(board.q('.board-caption.muted').textContent, 'The bulb glows.');
    assert.ok(button(board.container, 'Board after the previous reply').disabled);

    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    assert.equal(board.q('.board-scroller > svg').getAttribute('aria-label'), 'Board');
    assert.equal(steps.textContent, 'Reply 3 of 3');
    assert.ok(
        button(board.container, 'Board after the previous reply').disabled,
        'off while the tutor speaks',
    );
    await board.act(async () =>
        board.socket.server({
            type: 'sentence',
            id: '9',
            text: 'The bulb can go now.',
            ops: [{ id: 'x2', kind: 'erase', ids: ['bulb'] }],
        }),
    );
    const bulb = board.q('[data-item="bulb"]');
    assert.ok(bulb.classList.contains('board-gone'), 'an erase fades its items out over its share');
    assert.notEqual(bulb.style.getPropertyValue('--gone-ms'), '0ms');
});

test('board: a voiced sentence waits for its first speech chunk before it shows', async (t) => {
    const board = await mount(t);
    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    await board.act(async () => {
        board.socket.server({ type: 'state', state: 'speaking' });
        board.socket.server({ type: 'sentence', id: '12', text: 'Spoken aloud.', voiced: true });
    });
    assert.equal(board.q('.board-caption').textContent, 'Why?', 'silent until its speech arrives');
    await board.act(async () => board.socket.audio('12', [1, 2, 3]));
    assert.equal(board.q('.board-caption').textContent, 'Spoken aloud.');
    assert.deepEqual(board.socket.sent.at(-1), {
        type: 'progress',
        sentence: '12',
        phase: 'start',
    });
});

test('board: the pen draws a stroke that waits for the question, and an erase op fades it out', async (t) => {
    const board = await mount(t);
    const pen = button(board.container, 'Pen');
    assert.equal(pen.getAttribute('aria-pressed'), 'false', 'the pen is off when a board opens');
    const svg = board.q('.board svg');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 450 });
    const drag = (type, x, y) =>
        board.act(async () =>
            svg.dispatchEvent(
                new window.PointerEvent(type, {
                    bubbles: true,
                    clientX: x,
                    clientY: y,
                    pointerId: 1,
                    pointerType: 'mouse',
                }),
            ),
        );
    await drag('pointerdown', 10, 10);
    await drag('pointerup', 10, 10);
    assert.deepEqual(board.socket.sent, [], 'with the pen off the board ignores the pointer');

    await board.act(async () => pen.click());
    assert.equal(pen.getAttribute('aria-pressed'), 'true');
    assert.ok(board.q('.board.pen-on'));
    await drag('pointerdown', 100, 100);
    await drag('pointermove', 101, 100);
    await drag('pointermove', 150, 120);
    assert.ok(board.q('.board-tip'), 'the stroke follows the pointer with a dot at the tip');
    await drag('pointerup', 150, 120);
    assert.deepEqual(
        board.socket.sent,
        [
            {
                type: 'stroke',
                points: [
                    [200, 200],
                    [300, 240],
                ],
            },
        ],
        'the stroke goes up in board pixels; drawing sends no question',
    );
    assert.equal(board.q('.board-tip'), null);

    const stroke = (id) => ({
        type: 'stroke',
        item: { id, kind: 'stroke', points: [[200, 200]] },
        mark: { verb: 'circled', ids: ['t1'] },
    });
    await board.act(async () => board.socket.server(stroke('p1')));
    assert.equal(board.q('.board-marks').textContent, '1 mark goes with your question');
    await board.act(async () => board.socket.server(stroke('p2')));
    assert.equal(board.q('.board-marks').textContent, '2 marks go with your question');
    assert.equal(board.container.querySelectorAll('.board-learner').length, 2);

    await board.type('What is this?');
    await board.act(async () => button(board.container, 'Send').click());
    assert.deepEqual(board.socket.sent.at(-1), { type: 'ask', text: 'What is this?' });
    assert.equal(board.q('.board-marks'), null, 'sending clears the pill');
    assert.equal(pen.getAttribute('aria-pressed'), 'true', 'the pen stays as the learner left it');

    await board.act(async () =>
        board.socket.server({
            type: 'sentence',
            id: '1',
            text: 'Ok.',
            ops: [{ id: 'e1', kind: 'erase', ids: ['p1'] }],
        }),
    );
    const gone = board.container.querySelectorAll('.board-item.board-gone');
    assert.equal(gone.length, 1);
    assert.ok(gone[0].querySelector('.board-learner'), 'p1 fades out');
});

test('board: speed is 1.5× until the learner picks another, which is remembered, and pause holds the reply', async (t) => {
    const board = await mount(t);
    const pill = () => board.q('.board-speed');
    assert.equal(pill().textContent, '1.5×', 'speech plays at 1.5× by default');
    await board.act(async () => pill().click());
    await board.frames();
    const items = [
        ...document
            .getElementById(pill().getAttribute('aria-controls'))
            .querySelectorAll('[role=menuitemradio]'),
    ];
    assert.deepEqual(
        items.map((e) => [e.textContent.trim(), e.getAttribute('aria-checked')]),
        [
            ['1×', 'false'],
            ['1.25×', 'false'],
            ['1.5×Default', 'true'],
            ['1.75×', 'false'],
            ['2×', 'false'],
        ],
    );
    await board.act(async () => items[1].click());
    assert.equal(pill().textContent, '1.25×');
    assert.ok(button(board.container, 'Speed, 1.25×'), 'the pill is named with its speed');
    assert.equal(localStorage.getItem('rabbithole.board-speed'), '1.25');

    const pause = () => board.q('.board-pause');
    assert.ok(pause().disabled, 'nothing to pause before a reply');
    await board.type('Why?');
    await board.act(async () => button(board.container, 'Send').click());
    await board.act(async () => {
        board.socket.server({ type: 'state', state: 'speaking' });
        board.socket.server({ type: 'sentence', id: '1', text: 'A hypha grows at its tip.' });
    });
    assert.equal(pause().disabled, false);
    await board.act(async () => pause().click());
    assert.equal(pause().getAttribute('aria-label'), 'Resume');
    assert.equal(pause().getAttribute('aria-pressed'), 'true');
    assert.equal(board.q('[role=status]').textContent, 'Paused');
    assert.ok(board.q('.board.paused'), 'drawing holds where it stopped');
    await board.act(async () => pause().click());
    assert.equal(pause().getAttribute('aria-label'), 'Pause');
    assert.equal(board.q('[role=status]').textContent, 'Speaking');
});

test('board: the state label names a running tutor tool, and goes back once it ends', async (t) => {
    const board = await mount(t, []);
    await board.type('What does the page say?');
    await board.act(async () => button(board.container, 'Send').click());
    const tool = (status) => ({ type: 'tool', tool: { id: 't1', name: 'read_page', status } });
    await board.act(async () => {
        board.socket.server({ type: 'state', state: 'thinking', reply: 'r1' });
        board.socket.server(tool('running'));
    });
    const label = () => board.q('.board-line [role=status]').textContent;
    assert.equal(label(), 'Running read_page…');
    await board.act(async () => board.socket.server(tool('done')));
    assert.equal(label(), 'Thinking');
});

test('board: the chosen speed is still set after a reload', async (t) => {
    const board = await mount(t, [], '1.75');
    assert.ok(button(board.container, 'Speed, 1.75×'));
});
