// Replaces the server for one test through the server access module's adapter.
// answer(path, body, init) returns the reply's JSON body or a Response-like object (with json or blob);
// a throw fails the request like a dropped connection.
import { setAdapter } from '../../src/serverAccess.ts';

export function fakeServer(t, answer) {
    const calls = [];
    const replaced = setAdapter(async (path, init) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
        calls.push({ path, body, init });
        const reply = await answer(path, body, init);
        if (typeof reply?.json === 'function' || typeof reply?.blob === 'function') return reply;
        return { ok: true, json: async () => structuredClone(reply ?? {}) };
    });
    t.after(() => setAdapter(replaced));
    return calls;
}
