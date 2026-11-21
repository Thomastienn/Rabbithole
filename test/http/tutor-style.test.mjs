import { observeProvider } from '../support/events.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { DEFAULT_TUTOR_STYLE, TUTOR_SKILLS, tutorSystem } from '../../server/media/diagrams.mjs';

test('tutor style saves, normalizes empty or default text to null, restores and reaches the next message', async (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-style-')), 'trees.sqlite'));
    const prompts = [];
    const app = createApp({
        store,
        auth: { status: () => ({ connected: false }) },
        provider: observeProvider({
            generate: async (tree, text, emit) => {
                prompts.push(tutorSystem(tree));
                emit({ type: 'item', item: 'a', text: 'Answer' });
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
    const save = async (style) => (await post('/api/settings/tutor-style', { style })).json();
    const unedited = { style: null, default: DEFAULT_TUTOR_STYLE };
    assert.deepEqual(await (await fetch(`${origin}/api/settings/tutor-style`)).json(), unedited);
    const tree = await (await post('/api/trees', {})).json();
    const ask = async () => {
        await (await post(`/api/trees/${tree.id}/messages`, { text: 'q' })).text();
        return prompts.at(-1);
    };
    assert.ok((await ask()).endsWith(TUTOR_SKILLS + DEFAULT_TUTOR_STYLE));
    assert.deepEqual(await save(' Use sports analogies. '), {
        ...unedited,
        style: 'Use sports analogies.',
    });
    assert.equal(store.tutorStyle(), 'Use sports analogies.');
    assert.equal(
        await ask(),
        tutorSystem({
            tutorStyle: 'Use sports analogies.',
            nativeTools: ['web_search'],
            tools: [{ name: 'update_memory_note' }, { name: 'make_video' }],
        }),
    );
    for (const style of ['', '   ', ` ${DEFAULT_TUTOR_STYLE}\n`, null]) {
        await save('Edited');
        assert.deepEqual(await save(style), unedited, JSON.stringify(style));
    }
    assert.ok((await ask()).endsWith(TUTOR_SKILLS + DEFAULT_TUTOR_STYLE));
    for (const style of [undefined, 3, ['x']])
        assert.equal((await post('/api/settings/tutor-style', { style })).status, 400);
});
