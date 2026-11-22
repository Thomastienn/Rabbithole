import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAI } from '../../server/providers/openai.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

export async function open(t, providers = {}, options = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-openai-')),
        store = new Store(join(dir, 'trees.sqlite'));
    const endpoint = new OpenAI(dir);
    const app = createApp({
        store,
        dir,
        endpoint,
        providers,
        defaultProvider: 'claude',
        auth: { status: () => ({ connected: false }) },
        ...options,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const get = (path) => fetch(origin + path);
    const { csrf } = await (await get('/api/state')).json();
    const post = (path, body = {}, headers = {}) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf, ...headers },
            body: JSON.stringify(body),
        });
    // Adds a custom endpoint the way Settings does and returns its provider id.
    const addEndpoint = async (baseUrl, apiKey, name = 'Custom endpoint') =>
        (await (await post('/api/settings/endpoints', { name, baseUrl, apiKey })).json()).at(-1).id;
    return { dir, store, endpoint, app, origin, get, post, addEndpoint };
}
