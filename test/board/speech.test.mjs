import { once } from 'node:events';
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket, { WebSocketServer } from 'ws';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { edgeSpeech } from '../../server/board/speech.mjs';
import { boardFillers } from '../../server/board/fillers.mjs';

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

    // The service closes idle sockets: each next sentence opens a fresh one and still streams.
    const fresh = async () => {
        const connected = Promise.withResolvers();
        // Config and sentence can arrive in one read, so the peer is watched from its first frame.
        server.once('connection', (peer) => {
            let frames = 0;
            peer.on('message', () => ++frames === 2 && connected.resolve(peer));
        });
        const spoken = client.speak('Again.', () => {});
        const peer = await connected.promise;
        peer.send('Path:turn.end\r\n\r\n');
        await spoken;
        return peer;
    };
    const idle = await fresh();
    const closed = once(idle, 'close');
    idle.close();
    await closed;
    await fresh();
});

test('board speech gives up on a sentence whose first audio is late, and drops its socket', async (t) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    t.after(() => {
        for (const socket of server.clients) socket.terminate();
        return new Promise((resolve) => server.close(resolve));
    });
    await once(server, 'listening');
    const client = edgeSpeech(
        undefined,
        () => new WebSocket(`ws://127.0.0.1:${server.address().port}`),
        50,
    );
    // Warmed first, so the timer runs only while the open socket sends nothing.
    const connected = once(server, 'connection');
    await client.warm();
    const [peer] = await connected;
    const dropped = once(peer, 'close');
    await assert.rejects(
        client.speak('Silent.', () => {}),
        /no audio within 50 ms/,
    );
    await dropped;
});

test('board speech keeps the retry socket when a connect it gave up on fails later', async (t) => {
    // The first socket hangs its handshake, then drops; the next one is a real server.
    const hung = net.createServer((s) => setTimeout(() => s.destroy(), 200));
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    t.after(() => {
        hung.close();
        for (const socket of server.clients) socket.terminate();
        return new Promise((resolve) => server.close(resolve));
    });
    hung.listen(0, '127.0.0.1');
    await Promise.all([once(hung, 'listening'), once(server, 'listening')]);
    const ports = [hung.address().port, server.address().port];
    const client = edgeSpeech(
        undefined,
        () => new WebSocket(`ws://127.0.0.1:${ports.shift()}`),
        50,
    );
    await assert.rejects(
        client.speak('Hung.', () => {}),
        /no audio within 50 ms/,
    );
    const connected = once(server, 'connection');
    await client.warm();
    const [peer] = await connected;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const dropped = once(peer, 'close');
    client.close();
    await dropped;
});

test('board fillers are synthesized once per voice and read back from disk after', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'fillers-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const spoken = [];
    const speech = () => ({
        async speak(text, chunk) {
            spoken.push(text);
            chunk(Buffer.from(text));
        },
        close() {},
    });
    const clips = await boardFillers(dir, 'en-US-AriaNeural', speech);
    assert.deepEqual(clips.map(String), ['Hmm.', 'Okay.', 'Good question.']);
    assert.deepEqual(await boardFillers(dir, 'en-US-AriaNeural', speech), clips);
    // A later run of the app finds them on disk.
    const restarted = await import(`../../server/board/fillers.mjs?again`);
    await restarted.boardFillers(dir, 'en-US-AriaNeural', speech);
    assert.equal(spoken.length, 3, 'each filler is synthesized once');
    await boardFillers(dir, 'other-voice', speech);
    assert.equal(spoken.length, 6, 'another voice gets its own');
});
