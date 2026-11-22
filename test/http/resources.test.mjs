import { observeProvider } from '../support/events.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { tutorSystem } from '../../server/media/tutor-instructions.mjs';

test('the chat prompt lists the tree resources and a reply citing one shows as its citing conversation', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'tt-resources-http-')), 'trees.sqlite'),
    );
    const prompts = [];
    const app = createApp({
        store,
        auth: { status: () => ({ connected: false }) },
        provider: observeProvider({
            generate: async (tree, text, emit) => {
                prompts.push(tutorSystem(tree));
                emit({
                    type: 'item',
                    item: 'a',
                    text: 'Heaps sift [1](resource:1); a[1] is prose.',
                });
                emit({ type: 'status', status: 'completed' });
            },
        }),
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (path, body) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const tree = await (await post('/api/trees', {})).json();
    const resource = {
        url: 'https://example.com/heap',
        title: 'Heaps',
        site: 'example.com',
        kind: 'page',
    };
    store.addResource(tree.id, resource);
    await (await post(`/api/trees/${tree.id}/messages`, { text: 'q' })).text();
    assert.ok(
        prompts[0].includes(JSON.stringify([{ number: 1, title: 'Heaps', site: 'example.com' }])),
    );
    const saved = await (await fetch(`${origin}/api/trees/${tree.id}`)).json();
    assert.deepEqual(
        saved.resources.map(({ firstSeen, ...r }) => r),
        [{ number: 1, ...resource, conversations: [tree.id] }],
    );
});

test('the chat prompt lists only the newest 50 resources, newest first', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'tt-resources-limit-')), 'trees.sqlite'),
    );
    let listed;
    const app = createApp({
        store,
        auth: { status: () => ({ connected: false }) },
        provider: observeProvider({
            generate: async (tree, text, emit) => {
                listed = tree.resources.map((r) => r.number);
                emit({ type: 'status', status: 'completed' });
            },
        }),
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (path, body) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const tree = await (await post('/api/trees', {})).json();
    for (let i = 1; i <= 60; i++)
        store.addResource(tree.id, {
            url: `https://example.com/${i}`,
            title: `Page ${i}`,
            site: 'example.com',
            kind: 'page',
        });
    await (await post(`/api/trees/${tree.id}/messages`, { text: 'q' })).text();
    assert.deepEqual(
        listed,
        Array.from({ length: 50 }, (_, i) => 60 - i),
    );
});
