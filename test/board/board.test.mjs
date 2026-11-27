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

test('board: reopened, it holds the latest board reply’s last sentence and no hint', async (t) => {
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
