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

test('tokens that arrive inside the interval reach the page within one interval while the reply streams', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const env = await open({
        generate: async (tree, text, emit) => {
            emit({ type: 'delta', item: 'a', text: 'first ' });
            emit({ type: 'delta', item: 'a', text: 'second' });
            await gate;
            emit({ type: 'status', status: 'completed' });
        },
    });
    try {
        const tree = await (await env.post('/api/trees', {})).json();
        const reader = (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Q' })).body
            .pipeThrough(new TextDecoderStream())
            .getReader();
        let seen = '';
        while (!seen.includes('"text":"first second"')) seen += (await reader.read()).value;
        assert.doesNotMatch(seen, /"type":"done"/);
        release();
        while (!(await reader.read()).done);
    } finally {
        release();
        env.close();
    }
});

test('a failed save in the trailing update fails the reply and leaves the server running', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const env = await open({
        generate: async (tree, text, emit) => {
            emit({ type: 'delta', item: 'a', text: 'first ' });
            emit({ type: 'delta', item: 'a', text: 'second' });
            await gate;
            emit({ type: 'status', status: 'completed' });
        },
    });
    try {
        const tree = await (await env.post('/api/trees', {})).json();
        const update = env.store.update;
        env.store.update = function (id, text, ...rest) {
            if (text === 'first second' && rest[0] === 'streaming') {
                release();
                throw new Error('disk full');
            }
            return update.call(this, id, text, ...rest);
        };
        const body = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Q' })).text();
        assert.match(body, /disk full/);
        assert.match(body, /"type":"done","status":"failed"/);
    } finally {
        release();
        env.close();
    }
});
