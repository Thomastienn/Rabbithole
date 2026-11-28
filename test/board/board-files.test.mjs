import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
import { mount } from './mountBoard.mjs';

test('board: the paperclip attaches a file, which goes with the typed question and leaves the tray', async (t) => {
    const board = await mount(t);
    const input = board.q('input[type=file]');
    Object.defineProperty(input, 'files', {
        configurable: true,
        value: [new File(['Hyphae grow at the tip.'], 'notes.txt', { type: 'text/plain' })],
    });
    await board.act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    assert.match(board.container.textContent, /notes\.txt/, 'the file waits in the tray');
    await board.type('Explain my notes.');
    await board.act(async () => button(board.container, 'Send').click());
    for (let i = 0; i < 50 && !board.socket.sent.some((m) => m.files); i++)
        await board.act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    assert.deepEqual(board.socket.sent.at(-1), {
        type: 'ask',
        text: 'Explain my notes.',
        files: [
            {
                name: 'notes.txt',
                type: 'text/plain',
                data: Buffer.from('Hyphae grow at the tip.').toString('base64'),
            },
        ],
    });
    assert.doesNotMatch(board.container.textContent, /notes\.txt/, 'the tray clears once sent');
});
