import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

export const task = {
  title: 'Rounds',
  description: 'Two winners meet in the final.',
  intent: 'Show the winners advancing.',
  excerpt: 'Winners advance.',
};

export const block = (title = task.title) =>
  '\n```treetutor-visual\n' + JSON.stringify({ ...task, title }) + '\n```';

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

export const until = async (predicate) => {
  const end = Date.now() + 5000;
  while (!(await predicate())) {
    assert.ok(Date.now() < end, 'condition timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};

export const models = async () => [{ model: 'smart', isDefault: true, efforts: ['low', 'high'] }];

export async function open(chat, smart, options = {}) {
  const path = options.path ?? join(mkdtempSync(join(tmpdir(), 'tt-visuals-')), 'trees.sqlite');
  smart.models ??= models;
  const store = new Store(path),
    smartProvider = options.smartProvider ?? 'claude';
  const app = createApp({
    store,
    providers: { openai: { models, ...chat }, [smartProvider]: smart },
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
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify(body),
    });
  await post('/api/settings/smart', {
    model: { provider: smartProvider, model: options.smartModel ?? 'smart' },
    followEffort: false,
    effort: 'high',
  });
  const tree = store.create('Visuals', 'openai', 'chat');
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
