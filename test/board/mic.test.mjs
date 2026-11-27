import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
import { fakeMic, mount } from './mountBoard.mjs';

test('board: the first mic press downloads with progress while typing works, then the mic listens for a spoken question', async (t) => {
    const mic = fakeMic(t);
    const board = await mount(t, [], undefined, false, mic);
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
    assert.match(loading.getAttribute('aria-label'), /40%/);
    assert.equal(loading.getAttribute('aria-busy'), 'true');
    assert.equal(loading.getAttribute('aria-pressed'), 'false');
    assert.match(loading.textContent, /40%/);
    assert.match(board.q('.board-notice[role=status]').textContent, /26 of 64 MB/);
    mic.frame(new Float32Array(512));
    assert.deepEqual(board.socket.sent.length, 1, 'no audio goes up until the mic is on');
    // Typing and sending work while the models download.
    await board.type('Why is the Moon lit?');
    await board.act(async () => button(board.container, 'Send').click());
    assert.deepEqual(board.socket.sent.at(-1), { type: 'ask', text: 'Why is the Moon lit?' });
    await board.act(async () => board.socket.server({ type: 'state', state: 'idle' }));

    await board.act(async () => board.socket.server({ type: 'mic', status: 'on' }));
    assert.equal(board.q('.board-mic').getAttribute('aria-pressed'), 'true');
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
    const board = await mount(t, [], undefined, false, mic);
    await board.act(async () => board.q('.board-mic').click());
    assert.ok(board.q('.board-notice[role=alert]'));
    assert.equal(board.q('.board-mic').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(board.socket.sent, [], 'the server is not asked for the speech models');
});

test('board: with push-to-talk on, only speech while the mic or Space is held goes up, and letting go sends it', async (t) => {
    const mic = fakeMic(t);
    const install = mic.install;
    mic.install = (w) => {
        install(w);
        w.localStorage.setItem('rabbithole.push-to-talk', 'on');
    };
    const board = await mount(t, [], undefined, false, mic);
    const ptt = () => board.q('.board-mic');
    // jsdom has no PointerEvent: a mouse event with the pointer's id and type stands in.
    const pointer = (type) =>
        board.act(async () =>
            ptt().dispatchEvent(
                Object.assign(new window.MouseEvent(type, { bubbles: true }), {
                    pointerId: 1,
                    pointerType: 'mouse',
                }),
            ),
        );
    const space = (type, target = document.body) =>
        board.act(async () =>
            target.dispatchEvent(new window.KeyboardEvent(type, { code: 'Space', bubbles: true })),
        );
    assert.equal(ptt().getAttribute('aria-label'), 'Hold to talk');
    assert.equal(ptt().getAttribute('aria-keyshortcuts'), 'Space');
    assert.equal(ptt().textContent, 'Hold to talkSpace');

    // The first hold downloads the speech models and records nothing until they are ready.
    await pointer('pointerdown');
    assert.deepEqual(board.socket.sent, [{ type: 'mic', on: true }]);
    await board.act(async () =>
        board.socket.server({ type: 'mic', status: 'loading', loaded: 26e6, total: 64e6 }),
    );
    assert.match(ptt().getAttribute('aria-label'), /Hold to talk, downloading 40%/);
    await board.act(async () => board.socket.server({ type: 'mic', status: 'on' }));
    assert.deepEqual(board.socket.sent.at(-1), { type: 'hold', on: true });
    assert.equal(ptt().getAttribute('aria-pressed'), 'true');
    assert.match(ptt().textContent, /Release to send/);
    assert.equal(ptt().querySelector('.board-level').children.length, 4);
    assert.equal(board.q('.board-state').textContent, 'Listening');
    await board.act(async () => mic.frame(new Float32Array(512)));
    assert.deepEqual(board.socket.sent.at(-1), { audio: 2048 });
    await pointer('pointerup');
    assert.deepEqual(board.socket.sent.at(-1), { type: 'hold', on: false });
    assert.equal(ptt().getAttribute('aria-pressed'), 'false');
    assert.equal(board.q('.board-state'), null, 'nothing listens until held');

    // Not held, the mic sends nothing, so voice detection never cuts in.
    const sent = board.socket.sent.length;
    await board.act(async () => mic.frame(new Float32Array(512).fill(0.5)));
    assert.equal(board.socket.sent.length, sent);

    // Space holds to talk, but types a space in the composer.
    await space('keydown');
    assert.deepEqual(board.socket.sent.at(-1), { type: 'hold', on: true });
    await space('keyup');
    assert.deepEqual(board.socket.sent.at(-1), { type: 'hold', on: false });
    await space('keydown', board.q('[contenteditable=true]'));
    assert.equal(board.socket.sent.length, sent + 2);
});

test('board: with push-to-talk on, letting go of the mic while the models download neither turns it off nor records once they are ready', async (t) => {
    const mic = fakeMic(t);
    const install = mic.install;
    mic.install = (w) => {
        install(w);
        w.localStorage.setItem('rabbithole.push-to-talk', 'on');
    };
    const board = await mount(t, [], undefined, false, mic);
    const fire = (type) =>
        board.act(async () =>
            board
                .q('.board-mic')
                .dispatchEvent(
                    Object.assign(new window.MouseEvent(type, { bubbles: true }), { pointerId: 1 }),
                ),
        );
    await fire('pointerdown');
    await board.act(async () =>
        board.socket.server({ type: 'mic', status: 'loading', loaded: 26e6, total: 64e6 }),
    );
    // A browser follows pointerup with a click on the same button.
    await fire('pointerup');
    await fire('click');
    assert.deepEqual(board.socket.sent, [{ type: 'mic', on: true }]);
    await board.act(async () => board.socket.server({ type: 'mic', status: 'on' }));
    assert.deepEqual(board.socket.sent, [{ type: 'mic', on: true }], 'nothing is held');
    assert.equal(board.q('.board-mic').getAttribute('aria-pressed'), 'false');
});
