import assert from 'node:assert/strict';
import test from 'node:test';
import { authRoutes } from '../../server/http/routes/auth.mjs';

// The callback arrives cross-site; a redirect to / would carry that and be refused, so success is a page.
test('a successful ChatGPT callback answers with a page, not a redirect', async () => {
    const res = {
        writeHead(status, headers) {
            Object.assign(this, { status, headers });
        },
        end(body) {
            this.body = body;
        },
    };
    const url = new URL('http://127.0.0.1:4317/auth/callback?state=s&code=c');
    const ctx = { auth: { callback: async () => {} } };
    assert.equal(await authRoutes({ method: 'GET' }, res, url, ctx), true);
    assert.equal(res.status, 200);
    assert.equal(res.headers.Location, undefined);
    assert.match(res.body, /Signed in to ChatGPT/);
});
