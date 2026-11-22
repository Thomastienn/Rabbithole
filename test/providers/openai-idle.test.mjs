import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAI } from '../../server/providers/openai.mjs';

const MINUTE = 60000;
const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

// A custom endpoint whose stream the test writes chunk by chunk under fake timers.
function endpoint(t) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let stream;
    t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
        const body = new ReadableStream({
            start(c) {
                stream = c;
            },
        });
        signal.addEventListener('abort', () => stream.error(signal.reason), { once: true });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    });
    const openai = new OpenAI(mkdtempSync(join(tmpdir(), 'idle-')));
    const [{ id }] = openai.add({ name: 'Idle', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'key' });
    const events = [];
    const reply = openai.providers()[id].generate(
        { model: 'm', messages: [] },
        'Hi',
        (e) => events.push(e),
        () => {},
        new AbortController().signal,
    );
    reply.catch(() => {});
    const send = (data) =>
        stream.enqueue(
            new TextEncoder().encode(
                `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
            ),
        );
    return {
        reply,
        events,
        send,
        after: async (ms) => {
            await settle();
            t.mock.timers.tick(ms);
            await settle();
        },
    };
}

test(
    'a custom endpoint that keeps streaming, even only reasoning, finishes well past 5 minutes',
    { timeout: 10000 },
    async (t) => {
        const { reply, events, send, after } = endpoint(t);
        await settle();
        for (let minute = 0; minute < 7; minute++) {
            send({
                choices: [
                    {
                        index: 0,
                        delta: minute % 2 ? { reasoning_content: '…' } : { content: `${minute} ` },
                    },
                ],
            });
            await after(4 * MINUTE);
        }
        send({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        send('[DONE]');
        await reply;
        assert.equal(events.at(-1).status, 'completed');
    },
);

test(
    'a custom endpoint silent for 5 minutes fails as stopped responding',
    { timeout: 10000 },
    async (t) => {
        const { reply, send, after } = endpoint(t);
        await settle();
        send({ choices: [{ index: 0, delta: { content: 'Start' } }] });
        await after(5 * MINUTE - 1);
        let done = false;
        reply.finally(() => (done = true)).catch(() => {});
        await settle();
        assert.equal(done, false, 'the limit counts from the last chunk');
        await after(1);
        await assert.rejects(reply, /The model stopped responding for 5 minutes/);
    },
);
