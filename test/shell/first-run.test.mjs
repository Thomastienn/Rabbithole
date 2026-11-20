import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';

// A fresh install: no trees, no chat model, nothing signed in until `signedIn`.
async function mount(
  t,
  {
    firstRun = true,
    signedIn = true,
    cli = { missing: false },
    system = { body: {} },
    sandbox = { windows: false, ready: true },
  } = {},
) {
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
          ? cli.missing
            ? {
                models: [],
                providers: { claude: { label: 'Claude', connected: false, installed: false } },
              }
            : signedIn
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
              : path === '/api/setup/system'
                ? system.body
                : path === '/api/setup/sandbox'
                  ? sandbox
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
  assert.deepEqual(
    [...container.querySelectorAll('.first-run .connection-status')].map((e) => e.textContent),
    ['Connected'],
  );
  assert.match(container.querySelector('[aria-label="Chat model"]').textContent, /Opus/);
  assert.doesNotMatch(
    container.textContent,
    /Video sandbox|administrator/,
    'Linux has no sandbox step',
  );
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

test('a missing CLI shows its official install page and command; "Check again" finds it once installed', async (t) => {
  const cli = { missing: true };
  const { container, click } = await mount(t, { cli });
  const setup = container.querySelector('.first-run');
  assert.match(setup.textContent, /Claude Code is not installed/);
  const status = setup.querySelector('.connection-status[data-state=missing]');
  assert.equal(status.textContent, 'Not found');
  assert.match(setup.textContent, /curl -fsSL https:\/\/claude\.ai\/install\.sh \| bash/);
  assert.ok(setup.querySelector('a[href="https://code.claude.com/docs/en/setup"]'));
  cli.missing = false;
  await click('Check again');
  assert.doesNotMatch(container.textContent, /not installed|Not found/);
  assert.match(container.querySelector('.first-run').textContent, /Signed in through Claude Code/);
});

test('Linux setup shows the one install line while packages are missing; "Check again" clears it and chat still starts', async (t) => {
  const command =
    'sudo apt install bubblewrap libcairo2-dev libpango1.0-dev pkg-config python3-dev build-essential';
  const system = { body: { command } };
  const { container, posts, click } = await mount(t, { system });
  const setup = () => container.querySelector('.first-run');
  assert.match(
    setup().textContent,
    /Video making needs a few system packages; chat works without them/,
  );
  assert.equal(setup().querySelector('code').textContent, command);
  system.body = {};
  await click('Check again');
  assert.doesNotMatch(setup().textContent, /Video tools|sudo apt/);
  await click('Start asking');
  assert.deepEqual(posts.at(-1), ['/api/setup', {}]);
  assert.equal(setup(), null);
});

test('other distros get the package list in words; setup still ends with the line unresolved', async (t) => {
  const { container, click } = await mount(t, {
    system: { body: { words: 'bubblewrap, pkg-config and the Cairo headers' } },
  });
  const text = container.querySelector('.first-run').textContent;
  assert.match(
    text,
    /Install bubblewrap, pkg-config and the Cairo headers with your distribution's package manager/,
  );
  assert.doesNotMatch(text, /sudo apt/);
  await click('Start asking');
  assert.equal(container.querySelector('.first-run'), null);
  assert.ok(container.querySelector('[aria-label="Your question"]'));
});

test('Windows setup asks once for admin rights; declining explains and setup still ends', async (t) => {
  const { container, posts, click } = await mount(t, { sandbox: { windows: true, ready: false } });
  const setup = () => container.querySelector('.first-run');
  assert.match(setup().textContent, /Video sandbox.*asks once for administrator rights/);
  await click('Enable sandbox');
  assert.deepEqual(posts, [['/api/setup/sandbox', {}]]);
  assert.match(
    setup().textContent,
    /Video making stays off until it is enabled; you can try again from Settings/,
  );
  assert.equal(
    [...setup().querySelectorAll('button')].find((b) =>
      /Enable sandbox|Try again/.test(b.textContent),
    ),
    undefined,
    'setup asks only once',
  );
  await click('Start asking');
  assert.deepEqual(posts.at(-1), ['/api/setup', {}]);
  assert.equal(setup(), null);
});
