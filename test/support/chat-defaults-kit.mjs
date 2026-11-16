import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

export async function start(dir = mkdtempSync(join(tmpdir(), 'tt-chat-defaults-'))) {
  const store = new Store(join(dir, 'trees.sqlite')),
    calls = [];
  const providers = Object.fromEntries(
    ['claude', 'codex', 'openai'].map((provider) => [
      provider,
      {
        models: async () => [
          { model: 'chat', label: 'Chat', isDefault: true, efforts: ['low', 'high'] },
          { model: 'plain', label: 'Plain', efforts: [] },
        ],
        model: async () => 'chat',
        generate: async (tree, text, emit, save) => {
          calls.push({ tree, text });
          save(tree.thread ?? `${provider}-${tree.id}`, tree.model);
          emit({ type: 'item', item: 'reply', text: 'A fixed passage about trees.' });
          emit({ type: 'status', status: 'completed' });
        },
      },
    ]),
  );
  const app = createApp({
    store,
    providers,
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: true }) },
    dir,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async (path) => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const post = (path, body = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const send = async (id, text = 'Continue') => {
    const response = await post(`/api/trees/${id}/messages`, { text });
    assert.match(await response.text(), /"status":"completed"/);
    return get(`/api/trees/${id}`);
  };
  return {
    dir,
    store,
    app,
    providers,
    calls,
    get,
    post,
    send,
    close: async () => {
      await app.stop();
      store.close();
    },
  };
}
