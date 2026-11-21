import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';
import { observeStore, until } from '../support/events.mjs';

const SVG =
    '<svg viewBox="0 0 10 10" role="img" aria-label="Dot"><circle cx="5" cy="5" r="2"/></svg>';

test('a custom endpoint places each visual at its marker in one request, with no show_visual offered', async (t) => {
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
    const dir = mkdtempSync(join(tmpdir(), 'tt-visual-marker-')),
        store = observeStore(new Store(join(dir, 'trees.sqlite')));
    const app = createApp({
        store,
        dir,
        endpoint: new OpenAI(dir),
        providers: {},
        defaultProvider: 'claude',
        auth: { status: () => ({ connected: false }) },
        log: () => {},
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
    const endpoint = (
        await (
            await post('/api/settings/endpoints', {
                name: 'Local',
                baseUrl: fake.baseUrl,
                apiKey: 'sk-test',
            })
        ).json()
    ).at(-1).id;

    const reply =
        'Halve the list.\n[[visual: halve | shows: A list cut in half]]\nCompare the middle. [[visual: compare | title: Compare | shows: The middle against the target]] Search one half.';
    const text = 'Halve the list.\n\nCompare the middle.  Search one half.';
    fake.reply = async (req, res, body) => {
        if (body.messages[0].content.startsWith('You create one self-contained visual'))
            return streamReply(res, [SVG]);
        return streamReply(res, [reply.slice(0, 30), reply.slice(30, 90), reply.slice(90)]);
    };
    const id = store.create('Visuals', endpoint, 'tooled').id;
    await (await post(`/api/trees/${id}/messages`, { text: 'Show binary search.' })).text();
    const saved = store.tree(id);
    assert.equal(saved.messages.at(-1).text, text);
    assert.deepEqual(
        saved.artifacts.map((a) => [a.title, a.position, a.side]),
        [
            ['halve', 'Halve the list.\n'.length, null],
            ['Compare', text.indexOf(' Search'), null],
        ],
    );
    // The visual writer also carries a tool (load_skill); the tutor's one request offers make_video.
    const tutor = fake.calls.filter(
        (c) =>
            c.path === '/v1/chat/completions' &&
            c.body.tools?.some((tool) => tool.function.name === 'make_video'),
    );
    assert.equal(tutor.length, 1);
    assert.ok(!tutor[0].body.tools.some((tool) => tool.function.name === 'show_visual'));
    await until(() => store.tree(id).artifacts.every((a) => a.status === 'ready'));
});
