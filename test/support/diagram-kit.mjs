import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

export const task = {
  title: 'Tournament tree',
  description: 'Pairs of winners advance to the root.',
  intent: 'Show two winners combining.',
  excerpt: 'A and B advance to the final.',
};
export const directive = '\n```treetutor-diagram\n' + JSON.stringify(task) + '\n```';
export const source = 'flowchart TD\n  A[Winner A] --> C[Final]\n  B[Winner B] --> C';
export const complete = (emit, text) => {
  emit({ type: 'item', item: 'answer', text });
  emit({ type: 'status', status: 'completed' });
};
export async function open(provider, options = {}) {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-artifacts-')), 'trees.sqlite');
  const store = new Store(path);
  const app = createApp({
    store,
    provider,
    auth: { status: () => ({ connected: true }) },
    ...options,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  return {
    store,
    app,
    origin,
    path,
    get: (path) => fetch(origin + path),
    post: (path, body = {}) =>
      fetch(origin + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(body),
      }),
    close: () => {
      app.stop();
      store.close();
    },
  };
}
