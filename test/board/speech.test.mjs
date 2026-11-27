import { once } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket, { WebSocketServer } from 'ws';
import { edgeSpeech } from '../../server/board/speech.mjs';

test('board speech warms one socket, streams before the clip ends, and closes on cancellation', async (t) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    t.after(() => {
        for (const socket of server.clients) socket.terminate();
        return new Promise((resolve) => server.close(resolve));
    });
    await once(server, 'listening');
    const client = edgeSpeech(
        undefined,
        () => new WebSocket(`ws://127.0.0.1:${server.address().port}`),
    );
    const configured = Promise.withResolvers();
    server.once('connection', (peer) => {
        peer.once('message', (frame) => configured.resolve({ peer, config: frame.toString() }));
    });
    await client.warm();
    const { peer, config } = await configured.promise;
    assert.match(config, /webm-24khz-16bit-mono-opus/);

    const received = [];
    const first = Promise.withResolvers();
    const request = once(peer, 'message');
    const clip = client.speak('Rock & soil.', (bytes) => {
        received.push(Buffer.from(bytes).toString());
        first.resolve();
    });
    const [frame] = await request;
    assert.match(frame.toString(), /en-US-AriaNeural/);
    assert.match(frame.toString(), /Rock &amp; soil\./);
    const header = Buffer.from('Path:audio\r\n');
    const send = (bytes) =>
        peer.send(Buffer.concat([Buffer.from([0, header.length]), header, Buffer.from(bytes)]));
    send('first');
    await first.promise;
    assert.deepEqual(received, ['first']);
    send('second');
    peer.send('Path:turn.end\r\n\r\n');
    await clip;
    assert.deepEqual(received, ['first', 'second']);

    const controller = new AbortController();
    const reused = once(peer, 'message');
    const cancelled = assert.rejects(
        client.speak('This should stop.', () => {}, controller.signal),
        { name: 'AbortError' },
    );
    const [next] = await reused;
    assert.match(next.toString(), /This should stop\./);
    const disconnected = once(peer, 'close');
    controller.abort();
    await Promise.all([cancelled, disconnected]);
});
