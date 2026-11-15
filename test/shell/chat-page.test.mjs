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

async function mount(
  t,
  trees,
  { mobile = false, contents = 'open', focus = 'off', vim = false } = {},
) {
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
            : path === '/api/graph'
              ? { concepts: [], links: [], topics: [] }
              : path === '/api/videos'
                ? []
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
      stubs = ui(w, { mobile });
      w.localStorage.setItem('treetutor.contents', contents);
      w.localStorage.setItem('treetutor.focus-mode', focus);
      w.localStorage.setItem('treetutor.vim', vim ? 'on' : 'off');
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

const summary = {
  id: 't1',
  title: 'Fungi',
  parent: null,
  layout: { folded: [], selected: 't1', panel: 'beside' },
};

test('with no saved trees the page shows the first-question composer and its model menu', async (t) => {
  const { container, calls } = await mount(t, []);
  assert.ok(calls.includes('/api/state') && calls.includes('/api/models'));
  assert.ok(container.querySelector('.first-question'));
  assert.match(name(button(container, 'Model for next reply')), /Model for next reply/);
  assert.match(container.querySelector('.chat-model').textContent, /Claude · Opus/);
});

test('files sit above the question bubble, and a files-only question draws no bubble', async (t) => {
  const file = (id, name) => ({ id, name, type: 'text/plain', size: 1, delivery: 'text' });
  tree.messages.push(
    {
      id: 'q2',
      role: 'user',
      text: 'And these?',
      status: 'completed',
      attachments: [file('f1', 'a.txt')],
    },
    { id: 'a2', role: 'assistant', text: 'Yes.', status: 'completed' },
    { id: 'q3', role: 'user', text: '', status: 'completed', attachments: [file('f2', 'b.txt')] },
  );
  t.after(() => tree.messages.splice(2));
  const { container } = await mount(t, [summary]);
  const [, withText, filesOnly] = container.querySelectorAll('.chat-question');
  const files = withText.querySelector('.message-files');
  assert.equal(files.nextElementSibling, withText.querySelector('.question-bubble'));
  assert.ok(
    !withText.querySelector('.question-bubble .message-files'),
    'files are outside the bubble',
  );
  assert.match(filesOnly.querySelector('.message-files').textContent, /b\.txt/);
  assert.equal(filesOnly.querySelector('.question-bubble'), null);
});

test('a saved tree opens its conversation with the thread, title and map', async (t) => {
  const { container, calls } = await mount(t, [summary]);
  assert.ok(calls.includes('/api/trees/t1'));
  assert.equal(container.querySelector('#rename-conversation h2').textContent, 'Fungi');
  assert.equal(container.querySelector('.question-bubble').textContent, 'What are hyphae?');
  assert.match(container.querySelector('.chat-reply').textContent, /Thin threads\./);
  assert.ok(container.querySelector('#learning-tree-map'));
  assert.ok(button(container, 'Copy tutor reply 1'));
});

test('collapsed contents is one floating control; opening and closing transfers focus', async (t) => {
  const { container, act } = await mount(t, [summary], { contents: 'collapsed' });
  const floating = () => container.querySelector('.focused-chat > .contents-reopen');
  assert.equal(container.querySelector('aside[aria-label="Learning tree contents"]'), null);
  assert.equal(container.querySelector('.contents-rail'), null);
  assert.equal(container.querySelectorAll('[aria-label="Show contents"]').length, 1);
  assert.equal(name(floating()), 'Show contents');
  assert.equal(floating().getAttribute('aria-expanded'), 'false');
  await act(async () => {
    floating().focus();
    floating().click();
  });
  assert.equal(floating(), null);
  assert.ok(container.querySelector('.contents'));
  assert.equal(document.activeElement, button(container, 'Hide contents'));
  await act(async () => button(container, 'Hide contents').click());
  assert.equal(document.activeElement, floating());
  await act(async () => button(container, 'Hide top bar').click());
  assert.ok(floating());
  assert.equal(container.querySelector('.shell-band'), null);
  await act(async () => floating().click());
  assert.ok(container.querySelector('.contents'));
});

test('focus mode toggles from chat, map and non-chat pages without consuming composer or Vim keys', async (t) => {
  const { container, act } = await mount(t, [summary], { vim: true });
  const key = async (target, options = {}) => {
    const event = new KeyboardEvent('keydown', {
      key: 'F',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    await act(async () => target.dispatchEvent(event));
    return event;
  };
  const band = () => container.querySelector('.shell-band');
  const hide = button(container, 'Hide top bar');
  assert.equal(hide.getAttribute('aria-expanded'), 'true');
  await act(async () => {
    hide.focus();
    hide.click();
  });
  assert.equal(band(), null);
  assert.equal(localStorage.getItem('treetutor.focus-mode'), 'on');
  let restore = button(container, 'Show top bar');
  assert.equal(restore.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, restore);
  await act(async () => restore.click());
  assert.ok(band());
  assert.equal(document.activeElement, button(container, 'Hide top bar'));
  assert.equal(localStorage.getItem('treetutor.focus-mode'), 'off');
  for (const target of [
    container.querySelector('[role=textbox]'),
    button(container.querySelector('.astryx-chat-composer'), 'Model for next reply'),
  ]) {
    assert.equal((await key(target)).defaultPrevented, false);
    assert.ok(band());
  }
  assert.equal((await key(container.querySelector('.question-bubble'))).defaultPrevented, true);
  assert.equal(band(), null);
  await key(container);
  await act(async () => button(band(), 'Map').click());
  const canvas = container.querySelector('.tree-canvas');
  assert.equal((await key(canvas, { key: 'f', shiftKey: false })).defaultPrevented, false);
  assert.ok(band());
  assert.equal((await key(canvas)).defaultPrevented, true);
  assert.equal(band(), null);
  await key(canvas);
  for (const label of ['Knowledge', 'Videos', 'Settings']) {
    await act(async () => button(band(), label).click());
    await act(async () => button(band(), 'Hide top bar').click());
    assert.equal(band(), null, label);
    await act(async () => button(container, 'Show top bar').click());
    assert.ok(band());
    assert.equal((await key(container)).defaultPrevented, true);
    assert.equal(band(), null, label);
    await key(container);
  }
});

test('narrow focused chat keeps its contents drawer usable in saved focus mode', async (t) => {
  const { container, act } = await mount(t, [summary], { mobile: true, focus: 'on' });
  assert.equal(container.querySelector('.shell-band'), null);
  const show = button(container, 'Show contents');
  assert.equal(show.getAttribute('aria-expanded'), 'false');
  assert.equal(show.getAttribute('aria-haspopup'), 'dialog');
  await act(async () => {
    show.focus();
    show.click();
  });
  assert.equal(show.getAttribute('aria-expanded'), 'true');
  const drawer = document.querySelector('dialog[open]');
  assert.ok(drawer);
  assert.ok(button(drawer, 'Read'));
  assert.ok(drawer.querySelector('.contents'));
  await act(async () => button(drawer, 'Knowledge').click());
  assert.equal(show.getAttribute('aria-expanded'), 'false');
  // jsdom has no CSS transitions; finish the drawer exit without waiting for its timer.
  const exit = new Event('transitionend', { bubbles: true });
  Object.defineProperty(exit, 'propertyName', { value: 'transform' });
  await act(async () => drawer.dispatchEvent(exit));
  assert.ok(!document.querySelector('dialog[open]'));
  assert.equal(container.querySelector('.shell-band'), null);
  await act(async () => button(container, 'Show top bar').click());
  assert.ok(button(container.querySelector('.shell-band'), 'Contents'));
});
