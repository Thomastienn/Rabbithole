import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { request, setCsrf } = await import('../../src/serverAccess.ts');

test('requests post JSON with the CSRF header and fail with the server message', async (t) => {
    const calls = [],
        answers = [
            [200, { ok: 1 }],
            [409, { error: 'Busy.' }],
            [500, {}],
            [200, []],
        ];
    const fetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        calls.push([url, init?.method, init?.headers]);
        const [status, body] = answers.shift();
        return { ok: status < 400, json: async () => body };
    };
    t.after(() => (globalThis.fetch = fetch));
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
