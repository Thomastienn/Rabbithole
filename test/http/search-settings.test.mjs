import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeSearxng } from '../support/fake-searxng.mjs';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';

async function launch(t) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-search-'));
    const path = join(dir, 'trees.sqlite'),
        store = new Store(path);
    const managed = await fakeSearxng(t),
        custom = await fakeSearxng(t),
        model = await fakeOpenAI(t);
    model.models = [{ id: 'tooled', capabilities: { tools: true } }];
    const app = createApp({
        store,
        dir,
        providers: {},
        defaultProvider: null,
        auth: { status: () => ({ connected: false }) },
        log: () => {},
        endpoint: new OpenAI(dir),
        searxng: () => ({ ready: true, url: managed.url, error: null }),
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const get = async (p) => (await fetch(origin + p)).json();
    const { csrf } = await get('/api/state');
    const post = (p, body) =>
        fetch(origin + p, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Rabbithole-CSRF': csrf,
            },
            body: JSON.stringify(body),
        });
    return { store, path, managed, custom, model, get, post, origin };
}

test('Settings defaults to managed search; Test diagnoses without saving; override persists and resets', async (t) => {
    const env = await launch(t),
        path = '/api/settings/searxng';
    assert.equal((await env.get(path)).url, env.managed.url);
    let status = await (await env.post(path + '/test', { url: env.custom.url })).json();
    assert.equal(status.ready, true);
    assert.equal(status.url, env.custom.url);
    assert.equal(env.store.searxngUrl(), null, 'testing a draft does not save it');
    env.custom.status = 403;
    status = await (await env.post(path + '/test', { url: env.custom.url })).json();
    assert.equal(status.ready, false);
    assert.match(status.error, /JSON.*403/);
    env.custom.status = 200;
    status = await (await env.post(path, { url: env.custom.url })).json();
    assert.equal(status.customUrl, env.custom.url);
    const reopened = new Store(env.path);
    assert.equal(reopened.searxngUrl(), env.custom.url);
    reopened.close();
    const hits = env.managed.hits.length;
    await env.get(path);
    assert.equal(env.managed.hits.length, hits, 'custom replaces managed, with no fallback');
    const invalid = await env.post(path, { url: 'file:///tmp/x' });
    assert.equal(invalid.status, 400);
    assert.equal(env.store.searxngUrl(), env.custom.url);
    await env.post(path, { url: null });
    assert.equal(env.store.searxngUrl(), null);
    status = await (await env.post(path, { url: env.managed.url })).json();
    assert.equal(
        status.customUrl,
        null,
        'saving the managed port follows future managed instances',
    );
    const response = await fetch(env.origin + '/api/state');
    assert.match(
        response.headers.get('Content-Security-Policy'),
        /img-src 'self' data: https: http:/,
    );
    const sandbox = await fetch(env.origin + '/sandbox.html');
    assert.match(sandbox.headers.get('Content-Security-Policy'), /img-src data: blob:;/);
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
});

test('custom model searches and finds images through the default runner, stores results, then hides unavailable search', async (t) => {
    const env = await launch(t);
    env.managed.data = {
        results: [
            {
                title: 'Heap',
                url: 'https://example.org/heap',
                content: 'Root first.',
                img_src: 'https://example.org/heap.png',
                thumbnail_src: 'https://example.org/thumb.png',
            },
        ],
    };
    const endpoint = (
        await (
            await env.post('/api/settings/endpoints', {
                name: 'Fake',
                baseUrl: env.model.baseUrl,
                apiKey: 'sk-test',
            })
        ).json()
    ).at(-1).id;
    let count = 0;
    env.model.reply = (req, res, body) => {
        count++;
        if (count === 1) {
            assert.deepEqual(
                body.tools.map((d) => d.function.name),
                [
                    'web_search',
                    'find_images',
                    'read_page',
                    'update_memory_note',
                    'look_up_concept',
                    'search_conversations',
                    'read_conversation',
                    'make_video',
                    'start_discussion',
                ],
            );
            streamToolCalls(res, [
                { name: 'web_search', input: { query: 'heap' } },
                { name: 'find_images', input: { query: 'heap diagram' } },
            ]);
        } else {
            assert.match(
                body.messages
                    .filter((m) => m.role === 'tool')
                    .map((m) => m.content)
                    .join(' '),
                /Root first.*sourceUrl/,
            );
            streamReply(res, ['![Heap](https://example.org/heap.png)']);
        }
    };
    const id = env.store.create('Search', endpoint, 'tooled').id;
    const response = await env.post(`/api/trees/${id}/messages`, {
        text: 'Search the web and find an image of a heap.',
    });
    const events = await response.text();
    assert.match(events, /find_images/);
    const reply = env.store.tree(id).messages.at(-1);
    assert.equal(reply.status, 'completed');
    assert.deepEqual(
        reply.tools.map((tool) => [tool.name, tool.status]),
        [
            ['web_search', 'done'],
            ['find_images', 'done'],
        ],
    );
    assert.equal(
        JSON.parse(reply.tools[1].output).results[0].sourceUrl,
        'https://example.org/heap',
    );
    env.managed.status = 503;
    env.model.reply = (req, res, body) => {
        assert.deepEqual(
            body.tools.map((d) => d.function.name),
            [
                'read_page',
                'update_memory_note',
                'look_up_concept',
                'search_conversations',
                'read_conversation',
                'make_video',
                'start_discussion',
            ],
        );
        streamReply(res, ['Search is unavailable.']);
    };
    await (await env.post(`/api/trees/${id}/messages`, { text: 'Search again.' })).text();
    assert.equal(env.store.tree(id).messages.at(-1).status, 'completed');
});
