import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: Board } = await import('../../src/board/Board.tsx');

// The board session's socket, driven by the test: it records what the board sends and plays what the server says.
class FakeSocket {
    static OPEN = 1;
    static last;
    readyState = 0;
    sent = [];
    constructor(url) {
        this.url = url;
        FakeSocket.last = this;
    }
    send(data) {
        this.sent.push(JSON.parse(data));
    }
    close() {
        this.readyState = 3;
        this.onclose?.();
    }
    open() {
        this.readyState = 1;
        this.onopen?.();
    }
    server(message) {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
    // A speech frame as the board session sends it: one byte of id length, the id, then the audio.
    audio(id, bytes) {
        this.onmessage?.({
            data: new Uint8Array([id.length, ...Buffer.from(id), ...bytes]).buffer,
        });
    }
}

async function mount(t, messages = []) {
    const reloads = [];
    const saved = globalThis.WebSocket;
    globalThis.WebSocket = FakeSocket;
    t.after(() => (globalThis.WebSocket = saved));
    const view = await render(
        h(Board, { conversation: 'c1', messages, reload: () => reloads.push('c1') }),
        (w) => ui(w),
    );
    t.after(view.cleanup);
    const socket = FakeSocket.last;
    await view.act(async () => socket.open());
    const q = (selector) => view.container.querySelector(selector);
    // The composer input is contenteditable: typing replaces its text and fires input.
    const type = async (text) => {
        const input = q('[contenteditable=true]');
        await view.act(async () => {
            input.textContent = text;
            input.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
    };
    return { ...view, socket, q, type, reloads };
}

test('board: an empty board waits for a typed question with the mic off, then shows it was heard', async (t) => {
    const board = await mount(t);
    assert.match(board.socket.url, /\/api\/trees\/c1\/board\?csrf=/);
    assert.ok(board.q('.board-empty'), 'the hint shows before the first board question');
    const mic = button(board.container, 'Turn mic on');
    assert.ok(mic.disabled);
    assert.equal(mic.getAttribute('aria-pressed'), 'false');
    await board.type('How does a hypha grow?');
    await board.act(async () => button(board.container, 'Send').click());
    assert.deepEqual(board.socket.sent, [{ type: 'ask', text: 'How does a hypha grow?' }]);
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
        { role: 'assistant', text: 'A later chat reply.' },
    ]);
    assert.equal(board.q('.board-empty'), null);
    assert.equal(board.q('.board-caption.muted').textContent, 'Dr. Lin explains how.');
    assert.equal(board.q('[role=status]').textContent, '');
    await board.act(async () =>
        board.socket.server({
            type: 'board',
            items: [
                { id: 'tip', kind: 'circle', at: [800, 450], r: 60 },
                { id: 'v1', kind: 'dot', at: [900, 450] },
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
    const send = (ops) => board.act(async () => board.socket.server({ type: 'board', items: ops }));
    const label = () => board.q('.board-point-label');
    await send([line, point('q1', 1040, '0.7')]);
    assert.equal(label().style.translate, '0 0px');
    assert.equal(board.q('.board-leader'), null);
    await send([line, point('q1', 1040, '0.7'), point('q2', 1000, '2/3')]);
    assert.equal(label().textContent, '0.7');
    assert.equal(label().style.translate, '0 -60px', 'the same label slides to the second row');
    assert.equal(board.q('.board-leader').getAttribute('d'), 'M1040 420V500');
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
    const svg = board.q('.board > svg');
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
    assert.equal(board.container.querySelectorAll('.board-item.erased').length, 1);
    await board.act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    assert.equal(board.container.querySelectorAll('.board-learner').length, 1, 'p1 left the board');
});
