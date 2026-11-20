import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { EdgeTTS } from '@andresaya/edge-tts';
import { edgeNarration } from '../../server/media/narration.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';

test('actual Edge client sends private script once, receives audio/boundaries, does not retry refusal, and closes on cancel', async (t) => {
    let requests = 0,
        mode = 'ready',
        ssml,
        closed;
    const sent = Promise.withResolvers(),
        disconnected = Promise.withResolvers();
    const server = createServer((_req, res) => {
        requests++;
        res.writeHead(403);
        res.end();
    });
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        requests++;
        if (mode === 'refused') {
            socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.on('close', () => {
                closed = true;
                if (mode === 'cancel') disconnected.resolve();
            });
            ws.on('message', async (message) => {
                if (!message.toString().includes('Path:ssml')) return;
                ssml = message.toString();
                if (mode === 'cancel') {
                    sent.resolve();
                    return;
                }
                const { audio, wordBoundaries, sentenceBoundaries } = await fakeNarration();
                const header = Buffer.from('Path:audio\r\n'),
                    size = Buffer.alloc(2);
                size.writeUInt16BE(header.length);
                ws.send(Buffer.concat([size, header, audio]));
                ws.send(
                    'Path:audio.metadata\r\n\r\n' +
                        JSON.stringify({
                            Metadata: [
                                ...wordBoundaries.map((b) => ({
                                    Type: 'WordBoundary',
                                    Data: {
                                        Offset: b.offset,
                                        Duration: b.duration,
                                        text: { Text: b.text },
                                    },
                                })),
                                ...sentenceBoundaries.map((b) => ({
                                    Type: 'SentenceBoundary',
                                    Data: {
                                        Offset: b.offset,
                                        Duration: b.duration,
                                        text: { Text: b.text },
                                    },
                                })),
                            ],
                        }),
                );
                ws.send('Path:turn.end\r\n\r\n');
            });
        });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(async () => {
        for (const ws of wss.clients) ws.terminate();
        wss.close();
        await new Promise((r) => server.close(r));
    });
    const client = () =>
        new EdgeTTS({ wssUrl: `ws://127.0.0.1:${server.address().port}/synthesis` });
    const ready = await edgeNarration('Winners advance.', new AbortController().signal, client());
    assert.match(ssml, /Winners advance\./);
    assert.deepEqual(ready.audio, (await fakeNarration()).audio);
    assert.equal(ready.wordBoundaries.length, 2);
    assert.equal(ready.sentenceBoundaries[0].duration, 18000000);
    assert.equal(requests, 1);
    mode = 'refused';
    await assert.rejects(
        edgeNarration('Private script.', new AbortController().signal, client()),
        /Video narration failed/,
    );
    assert.equal(requests, 2, 'no handshake recovery HEAD request or second synthesis');
    mode = 'cancel';
    closed = false;
    ssml = null;
    const controller = new AbortController(),
        pending = edgeNarration('Stop this.', controller.signal, client());
    await sent.promise;
    assert.ok(ssml);
    controller.abort();
    await assert.rejects(pending);
    await disconnected.promise;
    assert.equal(closed, true);
    assert.equal(requests, 3);
});
