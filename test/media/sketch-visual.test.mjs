import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complete, source, until, open } from '../support/visual-kit.mjs';

const reply =
    'Entropy counts those ways.\n\n```sketch bars\ntitle: Sequences per head count\n0 heads: 1\n*2 heads*: 6\n```\n\nMixed results win.';

test('Expand into visual draws a visual in the sketch place from its title, items and nearby text, a switch away from the sketch', async () => {
    const calls = [];
    const env = await open(
        { generate: async (_tree, _text, emit) => complete(emit, reply) },
        {
            generate: async (tree, text, emit) => {
                calls.push(JSON.parse(text.split('\n\ncurrentVersion:\n')[0]));
                complete(emit, source);
            },
        },
    );
    try {
        const id = env.tree.id;
        await (await env.post(`/api/trees/${id}/messages`, { text: 'Why mixed?' })).text();
        const message = (await env.get(`/api/trees/${id}`)).messages.at(-1),
            at = message.text.indexOf('```sketch');
        const expand = (offset = at) =>
            env.post(`/api/trees/${id}/messages/${message.id}/sketches/${offset}`);
        assert.equal((await expand(at + 1)).status, 404, 'no sketch starts there');
        const pending = await (await expand()).json();
        assert.deepEqual(
            [pending.kind, pending.position, pending.sketch, pending.title],
            ['visual', at, 'hidden', 'Sequences per head count'],
        );
        await until(
            async () =>
                (await env.get(`/api/trees/${id}/artifacts/${pending.id}`)).status === 'ready',
        );
        const { request } = calls[0];
        assert.match(
            request.intent,
            /bars sketch "Sequences per head count".*0 heads, 1; 2 heads, 6, focus/,
        );
        assert.match(request.excerpt, /Entropy counts those ways\.[\s\S]*Mixed results win\./);
        // A second expand returns the same visual with no new request.
        assert.equal((await (await expand()).json()).id, pending.id);
        assert.equal(calls.length, 1);
        // The switch moves between the visual and its sketch, and the choice is saved with the conversation.
        const flip = async () =>
            (await (await env.post(`/api/trees/${id}/artifacts/${pending.id}/sketch`)).json())
                .sketch;
        assert.equal(await flip(), 'shown');
        assert.equal((await env.get(`/api/trees/${id}`)).artifacts[0].sketch, 'shown');
        assert.equal(await flip(), 'hidden');
        const reopened = (await env.get(`/api/trees/${id}`)).artifacts[0];
        assert.deepEqual([reopened.status, reopened.sketch], ['ready', 'hidden']);
        assert.equal(calls.length, 1);
    } finally {
        await env.close();
    }
});
