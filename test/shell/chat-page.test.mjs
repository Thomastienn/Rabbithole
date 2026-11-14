import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';

// Composition check for the split ChatPage: its hooks load state, models and a chat into the regions.
const models = {
  models: [{ provider: 'claude', model: 'opus', label: 'Opus', isDefault: true, efforts: [] }],
  providers: { claude: { label: 'Claude', connected: true } },
};
const tree = {
  id: 't1',
  title: 'Fungi',
  provider: 'claude',
  model: 'opus',
  effort: null,
  branch: null,
  artifacts: [],
  messages: [
    { id: 'q1', role: 'user', text: 'What are hyphae?', status: 'completed' },
    { id: 'a1', role: 'assistant', text: 'Thin threads.', status: 'completed' },
  ],
};

async function mount(t, trees) {
  const calls = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (path) => {
    calls.push(path);
    const body =
      path === '/api/state'
        ? { csrf: 'c', auth: { connected: true, email: null }, trees, active: [], videos: [] }
        : path === '/api/models'
          ? models
          : path === '/api/settings/chat'
            ? { provider: 'claude', model: null, effort: null }
            : path === '/api/trees/t1'
              ? tree
              : {};
    return { ok: true, json: async () => body };
  };
  const { default: ChatPage } = await import('../../src/shell/ChatPage.tsx');
  let stubs;
  const page = await render(
    h(ChatPage, { appearance: 'light', setAppearance() {}, theme: 'neutral', setTheme() {} }),
    (w) => {
      stubs = ui(w);
      w.DOMMatrixReadOnly = class {
        m22 = 1;
      };
    },
  );
  t.after(async () => {
    await page.cleanup();
    globalThis.fetch = saved;
  });
  const settle = () =>
    page.act(async () => {
      stubs.frames();
    });
  await settle();
  return { ...page, calls, settle };
}

test('with no saved trees the page shows the first-question composer and its model menu', async (t) => {
  const { container, calls } = await mount(t, []);
  assert.ok(calls.includes('/api/state') && calls.includes('/api/models'));
  assert.ok(container.querySelector('.first-question'));
  assert.match(name(button(container, 'Model for next reply')), /Model for next reply/);
  assert.match(container.querySelector('.chat-model').textContent, /Claude · Opus/);
});

test('a saved tree opens its conversation with the thread, title and map', async (t) => {
  const summary = {
    id: 't1',
    title: 'Fungi',
    parent: null,
    layout: { folded: [], selected: 't1', panel: 'beside' },
  };
  const { container, calls } = await mount(t, [summary]);
  assert.ok(calls.includes('/api/trees/t1'));
  assert.equal(container.querySelector('#rename-conversation h2').textContent, 'Fungi');
  assert.equal(container.querySelector('.question-bubble').textContent, 'What are hyphae?');
  assert.match(container.querySelector('.chat-reply').textContent, /Thin threads\./);
  assert.ok(container.querySelector('#learning-tree-map'));
  assert.ok(button(container, 'Copy tutor reply 1'));
});
