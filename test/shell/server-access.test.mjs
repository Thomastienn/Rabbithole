import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { replyStream, request, setAdapter, setCsrf } = await import('../../src/serverAccess.ts');

test('requests post JSON with the CSRF header and fail with the server message', async (t) => {
    const calls = [],
        answers = [
            [200, { ok: 1 }],
            [409, { error: 'Busy.' }],
            [500, {}],
            [200, []],
        ];
    const replaced = setAdapter(async (url, init) => {
        calls.push([url, init?.method, init?.headers]);
        const [status, body] = answers.shift();
        return { ok: status < 400, json: async () => body };
    });
    t.after(() => setAdapter(replaced));
    setCsrf('token');
    assert.deepEqual(await request('/api/a', { x: 1 }), { ok: 1 });
    await assert.rejects(request('/api/b', {}), { message: 'Busy.', data: { error: 'Busy.' } });
    await assert.rejects(request('/api/c', {}), {
        message: 'Request failed. Reload and try again.',
    });
    assert.deepEqual(await request('/api/d'), []);
    const headers = { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': 'token' };
    assert.deepEqual(calls, [
        ['/api/a', 'POST', headers],
        ['/api/b', 'POST', headers],
        ['/api/c', 'POST', headers],
        ['/api/d', undefined, undefined],
    ]);
});

test('a reply stream yields events split across chunks, skips keepalives and rejects on failure', async (t) => {
    const frame = (e) => `data: ${JSON.stringify(e)}\n\n`;
    const body = (chunks, drop) =>
        new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
                if (!drop) controller.close();
            },
            // Erroring in start would discard the queued chunks; a dropped connection fails after them.
            pull(controller) {
                controller.error(new Error('network error'));
            },
        });
    const answers = [
        new Response(
            body([
                frame({ type: 'text', text: 'A' }) + ': keepalive\n\n' + 'data: {"ty',
                'pe":"done"}\n\n',
            ]),
        ),
        new Response(body([frame({ type: 'text', text: 'A' })], true)),
        Response.json({ error: 'Busy.' }, { status: 409 }),
    ];
    const calls = [];
    const replaced = setAdapter(
        async (url, init) => (calls.push([url, init.method]), answers.shift()),
    );
    t.after(() => setAdapter(replaced));
    const events = [];
    for await (const event of await replyStream('/api/trees/a/messages', { body: '{}' }))
        events.push(event);
    assert.deepEqual(events, [{ type: 'text', text: 'A' }, { type: 'done' }]);
    const dropped = [];
    await assert.rejects(async () => {
        for await (const event of await replyStream('/api/trees/a/retry', {})) dropped.push(event);
    }, /network error/);
    assert.deepEqual(dropped, [{ type: 'text', text: 'A' }], 'events before the drop still arrive');
    await assert.rejects(replyStream('/api/trees/a/messages', {}), { message: 'Busy.' });
    assert.deepEqual(
        calls.map(([, method]) => method),
        ['POST', 'POST', 'POST'],
    );
});
