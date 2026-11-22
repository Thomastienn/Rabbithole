import { test } from 'node:test';
import assert from 'node:assert/strict';
import { open } from '../support/diagram-kit.mjs';

test('a fast stream of 1,000 tokens saves and sends the text a few times, the last with the full text', async () => {
    const env = await open({
        generate: async (tree, text, emit) => {
            for (let i = 0; i < 1000; i++) emit({ type: 'delta', item: 'a', text: `w${i} ` });
            emit({ type: 'status', status: 'completed' });
        },
    });
    try {
        const tree = await (await env.post('/api/trees', {})).json();
        const update = env.store.update;
        let saves = 0;
        env.store.update = function (...args) {
            saves++;
            return update.apply(this, args);
        };
        const body = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Q' })).text();
        const texts = body
            .split('\n\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => JSON.parse(line.slice(6)))
            .filter((event) => event.type === 'text');
        // far below one per token, with room for a slow runner
        assert.ok(saves < 50, `${saves} saves`);
        assert.ok(texts.length < 50, `${texts.length} text events`);
        assert.match(texts.at(-1).text, /^w0 .* w999 $/);
        assert.match(env.store.tree(tree.id).messages[1].text, /^w0 .* w999 $/);
    } finally {
        env.close();
    }
});

test('a reply reads its title and model without loading the conversation again', async () => {
    const env = await open({
        generate: async (tree, text, emit) => {
            emit({ type: 'delta', item: 'a', text: 'Answer' });
            emit({ type: 'usage', usage: { input: 1, output: 1, cacheRead: 0 } });
            emit({ type: 'status', status: 'completed' });
        },
    });
    try {
        const tree = await (await env.post('/api/trees', {})).json();
        const load = env.store.tree;
        let loads = 0;
        env.store.tree = function (id) {
            if (id === tree.id) loads++;
            return load.call(this, id);
        };
        const body = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Q' })).text();
        assert.match(body, /"type":"done","status":"completed"/);
        // The route itself, closing discussions, the discussion summary check and suggestions.
        assert.equal(loads, 4);
    } finally {
        env.close();
    }
});
