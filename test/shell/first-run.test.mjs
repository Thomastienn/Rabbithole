import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';

// A fresh install: no trees, no chat model, nothing signed in until `signedIn`.
async function mount(t, { firstRun = true, signedIn = true } = {}) {
  const posts = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (path, options) => {
    if (options?.method === 'POST') posts.push([path, JSON.parse(options.body)]);
    const body =
      path === '/api/state'
        ? {
            csrf: 'c',
            auth: { connected: false, email: null },
            trees: [],
            active: [],
            videos: [],
            firstRun,
          }
        : path === '/api/models'
          ? signedIn
            ? {
                models: [
                  { provider: 'claude', model: 'haiku', label: 'Haiku', efforts: [] },
                  {
                    provider: 'claude',
                    model: 'opus',
                    label: 'Opus',
                    isDefault: true,
                    efforts: [],
                  },
                ],
                providers: { claude: { label: 'Claude', connected: true } },
              }
            : { models: [], providers: { claude: { label: 'Claude', connected: false } } }
          : path === '/api/settings/chat'
            ? options?.method === 'POST'
              ? JSON.parse(options.body)
              : { provider: null, model: null, effort: null }
            : path === '/api/setup'
              ? { firstRun: false }
              : {};
    return { ok: true, json: async () => body };
  };
  const { default: ChatPage } = await import('../../src/shell/ChatPage.tsx');
  let stubs;
  const page = await render(
    h(ChatPage, { appearance: 'light', setAppearance() {}, theme: 'neutral', setTheme() {} }),
    (w) => {
      stubs = ui(w);
    },
  );
  t.after(async () => {
    await page.cleanup();
    globalThis.fetch = saved;
  });
  const settle = () => page.act(async () => stubs.frames());
  await settle();
  const click = async (label) => {
    await page.act(async () => button(page.container, label).click());
    await settle();
  };
  return { ...page, posts, click };
}

test('a fresh install opens on setup; confirming the prefilled default model lets the learner ask', async (t) => {
  const { container, posts, click } = await mount(t);
  assert.ok(container.querySelector('.first-run'));
  assert.equal(container.querySelector('.first-question'), null);
  assert.match(container.querySelector('.first-run').textContent, /Signed in through Claude Code/);
  assert.match(container.querySelector('[aria-haspopup=listbox]').textContent, /Opus/);
  await click('Start asking');
  assert.deepEqual(posts, [
    ['/api/settings/chat', { provider: 'claude', model: 'opus', effort: null }],
    ['/api/setup', {}],
  ]);
  assert.equal(container.querySelector('.first-run'), null);
  assert.match(container.querySelector('.chat-model').textContent, /Claude · Opus/);
  assert.doesNotMatch(container.textContent, /Choose a chat model in Settings/);
  const input = container.querySelector('[aria-label="Your question"]');
  assert.ok(
    input &&
      input.getAttribute('aria-disabled') !== 'true' &&
      !input.closest('[aria-disabled=true]'),
  );
});

test('"Set up later" ends setup without a model and falls back to the Send gate', async (t) => {
  const { container, posts, click } = await mount(t, { signedIn: false });
  assert.ok(button(container, 'Start asking').disabled, 'no model until a provider signs in');
  assert.ok(button(container, 'Continue with ChatGPT'));
  assert.ok(button(container, 'Check again'));
  await click('Set up later');
  assert.deepEqual(posts, [['/api/setup', {}]]);
  assert.equal(container.querySelector('.first-run'), null);
  assert.match(container.textContent, /Choose a chat model in Settings/);
});

test('an ended or upgraded install opens on the first question, not setup', async (t) => {
  const { container } = await mount(t, { firstRun: false });
  assert.equal(container.querySelector('.first-run'), null);
  assert.ok(container.querySelector('.first-question'));
});
