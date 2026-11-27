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
        this.sent.push(typeof data === 'string' ? JSON.parse(data) : { audio: data.byteLength });
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

// The browser's mic: getUserMedia records its constraints (or refuses), and frame() plays a worklet frame.
function fakeMic(t, { refuse } = {}) {
    const mic = { asked: [], stopped: 0, frame: null };
    const saved = [globalThis.AudioContext, globalThis.AudioWorkletNode];
    globalThis.AudioContext = class {
        audioWorklet = { addModule: async (url) => (mic.module = url) };
        destination = {};
        createMediaStreamSource = () => ({ connect: () => {} });
        resume = async () => {};
        close = async () => {};
    };
    globalThis.AudioWorkletNode = class {
        port = {};
        constructor() {
            mic.frame = (samples) => this.port.onmessage({ data: samples });
        }
        connect() {}
    };
    t.after(() => ([globalThis.AudioContext, globalThis.AudioWorkletNode] = saved));
    mic.install = (w) =>
        Object.defineProperty(w.navigator, 'mediaDevices', {
            value: {
                async getUserMedia(constraints) {
                    mic.asked.push(constraints);
                    if (refuse) throw Object.assign(new Error('denied'), { name: refuse });
                    return { getTracks: () => [{ stop: () => mic.stopped++ }] };
                },
            },
        });
    return mic;
}

async function mount(t, messages = [], speed, mic) {
    const reloads = [];
    let dom;
    const saved = globalThis.WebSocket;
    globalThis.WebSocket = FakeSocket;
    t.after(() => (globalThis.WebSocket = saved));
    const view = await render(
        h(Board, { conversation: 'c1', messages, reload: () => reloads.push('c1') }),
        (w) => {
            dom = ui(w);
            if (speed) w.localStorage.setItem('rabbithole.board-speed', speed);
            mic?.install(w);
        },
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
    return { ...view, socket, q, type, reloads, frames: () => view.act(async () => dom.frames()) };
}

test('board: an empty board waits for a typed question with the mic off, then shows it was heard', async (t) => {
    const board = await mount(t);
    assert.match(board.socket.url, /\/api\/trees\/c1\/board\?csrf=/);
    assert.ok(board.q('.board-empty'), 'the hint shows before the first board question');
    const mic = button(board.container, 'Turn mic on');
    assert.ok(!mic.disabled);
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

test('board: the first mic press downloads with progress while typing works, then the mic listens for a spoken question', async (t) => {
    const mic = fakeMic(t);
    const board = await mount(t, [], undefined, mic);
    const press = () => board.act(async () => board.q('.board-mic').click());
    await press();
    assert.deepEqual(mic.asked, [
        {
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        },
    ]);
    assert.equal(mic.module, '/mic-worklet.js');
    assert.deepEqual(board.socket.sent, [{ type: 'mic', on: true }]);

    await board.act(async () =>
        board.socket.server({ type: 'mic', status: 'loading', loaded: 26e6, total: 64e6 }),
    );
    const loading = board.q('.board-mic');
    assert.equal(loading.getAttribute('aria-label'), 'Turn mic on, downloading 40%');
    assert.equal(loading.getAttribute('aria-busy'), 'true');
    assert.equal(loading.getAttribute('aria-pressed'), 'false');
    assert.match(loading.textContent, /40%/);
    assert.equal(
        board.q('.board-notice[role=status]').textContent,
        'Getting voice ready: 26 of 64 MB. Your voice stays on this computer.',
    );
    mic.frame(new Float32Array(512));
    assert.deepEqual(board.socket.sent.length, 1, 'no audio goes up until the mic is on');
    // Typing and sending work while the models download.
    await board.type('Why is the Moon lit?');
    await board.act(async () => button(board.container, 'Send').click());
    assert.deepEqual(board.socket.sent.at(-1), { type: 'ask', text: 'Why is the Moon lit?' });
    await board.act(async () => board.socket.server({ type: 'state', state: 'idle' }));

    await board.act(async () => board.socket.server({ type: 'mic', status: 'on' }));
    assert.equal(board.q('.board-mic').getAttribute('aria-pressed'), 'true');
    assert.equal(board.q('.board-mic').getAttribute('aria-label'), 'Turn mic on');
    assert.equal(board.q('.board-notice'), null);
    assert.equal(board.q('.board-state').textContent, 'Listening');
    await board.act(async () => mic.frame(new Float32Array(512)));
    assert.deepEqual(board.socket.sent.at(-1), { audio: 2048 });

    await board.act(async () => board.socket.server({ type: 'hearing', on: true }));
    await board.act(async () => mic.frame(new Float32Array(512).fill(0.1)));
    assert.equal(board.q('.board-mic.hear .board-level').children.length, 4);
    await board.act(async () => board.socket.server({ type: 'hearing', on: false }));
    assert.equal(board.q('.board-mic.hear'), null);
    await board.act(async () => {
        board.socket.server({ type: 'heard', text: 'Why no eclipse every month?' });
        board.socket.server({ type: 'state', state: 'thinking' });
    });
    assert.equal(board.q('.board-caption.muted').textContent, 'Why no eclipse every month?');
    assert.equal(board.q('.board-state').textContent, 'Thinking');

    // A second press turns it off and lets the mic go.
    await press();
    assert.deepEqual(board.socket.sent.at(-1), { type: 'mic', on: false });
    assert.equal(board.q('.board-mic').getAttribute('aria-pressed'), 'false');
    assert.equal(mic.stopped, 1);
});

test('board: a blocked microphone leaves the mic off with a notice saying where to allow it', async (t) => {
    const mic = fakeMic(t, { refuse: 'NotAllowedError' });
    const board = await mount(t, [], undefined, mic);
    await board.act(async () => board.q('.board-mic').click());
    assert.equal(
        board.q('.board-notice[role=alert]').textContent,
        'The browser blocked the microphone. Allow it for this page, then press the mic again.',
    );
    assert.equal(board.q('.board-mic').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(board.socket.sent, [], 'the server is not asked for the speech models');
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

test('board: the chosen speed is still set after a reload', async (t) => {
    const board = await mount(t, [], '1.75');
    assert.ok(button(board.container, 'Speed, 1.75×'));
});
