import { observeStore, observeProvider } from './events.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { fixerTask, patchOf } from './video-kit.mjs';

export { fixerTask };
// A writer's answer: a retry of a previous fragment answers output as a patch of it; an unchanged output
// gains a trailing newline, which validation trims, so the patch has a hunk.
export const visualAnswer = (text, output) => {
    const { previousFragment } = fixerTask(text);
    if (previousFragment === undefined) return output;
    return patchOf(previousFragment, output === previousFragment ? output + '\n' : output);
};

export const task = {
    title: 'Rounds',
    description: 'Two winners meet in the final.',
    intent: 'Show the winners advancing.',
    excerpt: 'Winners advance.',
};

export const block = (title = task.title) =>
    '\n```rabbithole-visual\n' + JSON.stringify({ ...task, title }) + '\n```';

export const source =
    '<svg viewBox="0 0 200 80" role="img" aria-label="Two winners"><text x="10" y="35" fill="var(--color-text-primary)">A → Final ← B</text></svg>';

export const complete = (emit, text) => {
    emit({ type: 'item', item: 'answer', text });
    emit({ type: 'usage', usage: { input: 10, output: 3, cacheRead: 2 } });
    emit({ type: 'status', status: 'completed' });
};

export const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
};

export { until } from './events.mjs';

export const models = async () => [{ model: 'smart', isDefault: true, efforts: ['low', 'high'] }];

export async function open(chat, smart, options = {}) {
    const path = options.path ?? join(mkdtempSync(join(tmpdir(), 'tt-visuals-')), 'trees.sqlite');
    smart.models ??= models;
    // Visuals run on the conversation's chat model: the conversation uses the worker provider, whose
    // visual calls reach the `smart` fixture and whose tutor calls reach the `chat` fixture.
    const visual = smart.generate;
    smart.generate = function (tree, ...rest) {
        return tree.role === 'visual'
            ? visual.call(this, tree, ...rest)
            : chat.generate(tree, ...rest);
    };
    const store = observeStore(new Store(path)),
        smartProvider = options.smartProvider ?? 'claude';
    const app = createApp({
        store,
        providers: {
            openai: observeProvider({ models, ...chat }),
            [smartProvider]: observeProvider(smart),
        },
        auth: { status: () => ({ connected: true }) },
        ...options,
    });
    await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${app.server.address().port}`,
        { csrf } = await (await fetch(origin + '/api/state')).json();
    const get = async (path) => (await fetch(origin + path)).json();
    const post = (path, body = {}) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    await post('/api/settings/smart', {
        model: { provider: smartProvider, model: options.smartModel ?? 'smart' },
        followEffort: false,
        effort: 'high',
    });
    const tree = store.create('Visuals', smartProvider, options.smartModel ?? 'smart', 'high');
    return {
        store,
        app,
        origin,
        path,
        get,
        post,
        tree,
        close: async () => {
            await app.stop();
            store.close();
        },
    };
}
