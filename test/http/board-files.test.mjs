import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { boardProvider, messages, opened, setup } from '../support/board-kit.mjs';

const file = (name, type, text) => ({ name, type, data: Buffer.from(text).toString('base64') });

test('board: files sent with a question are prepared as in chat, go to the tutor with it and are saved on it', async (t) => {
    const provider = boardProvider([['> Your notes cover tips.\n']]);
    provider.readsImages = true;
    const { env, id, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    board.send({
        type: 'ask',
        text: 'Explain my notes.',
        files: [
            file('notes.txt', 'text/plain', 'Hyphae grow at the tip.'),
            file('slide.png', 'image/png', 'png bytes'),
        ],
    });
    const sentence = await board.next('sentence');
    for (const phase of ['start', 'end'])
        board.send({ type: 'progress', sentence: sentence.id, phase });
    await board.next('state', (e) => e.state === 'idle');
    assert.equal(
        provider.boards[0].asked[0],
        'Explain my notes.\n\n[Attached file: notes.txt]\nHyphae grow at the tip.\n\n[image: slide.png]',
    );
    const [image] = provider.boards[0].images[0];
    assert.equal(image.type, 'image/png');
    assert.equal(image.bytes.toString(), 'png bytes');
    assert.ok(existsSync(image.path), 'an attached image is kept with the conversation');
    const question = messages(env, id)[0];
    assert.equal(question.text, 'Explain my notes.');
    assert.deepEqual(
        question.attachments.map((a) => [a.name, a.delivery]),
        [
            ['notes.txt', 'text'],
            ['slide.png', 'image'],
        ],
    );
});

test('board: a file that cannot be attached is said as a notice and nothing is asked', async (t) => {
    const provider = boardProvider([]);
    const { env, id, connect } = await setup(t, provider);
    const board = connect();
    await opened(board.ws);
    board.send({
        type: 'ask',
        text: 'Read this.',
        files: [file('a.zip', 'application/zip', '\0')],
    });
    assert.match((await board.next('notice')).notice, /a\.zip: this file type can't be attached/);
    await board.next('state', (e) => e.state === 'idle');
    assert.equal(provider.boards[0]?.asked.length ?? 0, 0);
    assert.equal(messages(env, id).length, 0);
});
