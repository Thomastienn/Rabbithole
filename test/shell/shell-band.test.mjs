import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';
const {
  default: ShellBand,
  ContentsDrawer,
  SaveAlert,
  viewTab,
} = await import('../../src/shell/ShellBand.tsx');

test('desktop sidebar and narrow band keep control order, current views, drawer actions and layout Retry', async (t) => {
  let update;
  const calls = [];
  function Fixture() {
    const [value, set] = useState({ mobile: false, drawer: false, tab: 'Map', failed: true });
    update = set;
    const views = ['Read', 'Map', 'Knowledge', 'Videos'].map((label) =>
      viewTab(label, null, value.tab === label, () => {
        calls.push(label);
        set((v) => ({ ...v, tab: label }));
      }),
    );
    const setDrawer = (drawer) => set((v) => ({ ...v, drawer }));
    return h(
      'div',
      null,
      h(ShellBand, {
        ...value,
        busy: false,
        views,
        saveAlert:
          value.failed &&
          h(SaveAlert, {
            retry: () => {
              calls.push('retry');
              set((v) => ({ ...v, failed: false }));
            },
          }),
        contents: h('aside', { className: 'contents' }, h('button', null, '1 Fungi')),
        setDrawer,
        newChat: () => calls.push('new'),
        search: () => calls.push('search'),
        library: () => calls.push('library'),
        settings: () => calls.push('settings'),
      }),
      value.mobile &&
        h(ContentsDrawer, {
          tab: value.tab,
          drawer: value.drawer,
          setDrawer,
          views,
          contents: h('button', null, '1 Fungi'),
          library: () => calls.push('library'),
          settings: () => calls.push('settings'),
        }),
    );
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  assert.equal(container.querySelector('.shell-band, header'), null, 'no desktop top bar');
  let band = () => container.querySelector('nav.sidebar');
  assert.equal(band().previousElementSibling, button(container, 'Hide sidebar'));
  assert.deepEqual([...band().querySelectorAll('button')].map(name), [
    'Rabbithole',
    'Read',
    'Map',
    'Knowledge',
    'Videos',
    'Library',
    'Settings',
    'Search',
    'New chat',
    'Retry saving layout',
    '1 Fungi',
  ]);
  assert.ok(
    band().querySelector('.sidebar-top + .contents'),
    'page contents sit below the controls',
  );
  assert.match(
    band().querySelector('[role=alert]').textContent,
    /Map layout not saved.*retries every minute/s,
  );
  for (const label of ['Read', 'Knowledge', 'Videos', 'Map']) {
    await act(async () => button(band(), label).click());
    assert.equal(band().querySelector('[aria-current=page]').textContent, label);
  }
  for (const [label, expected] of [
    ['Search', 'search'],
    ['New chat', 'new'],
    ['Settings', 'settings'],
    ['Rabbithole', 'library'],
    ['Library', 'library'],
    ['Retry saving layout', 'retry'],
  ]) {
    await act(async () => button(band(), label).click());
    assert.equal(calls.at(-1), expected);
  }
  assert.equal(band().querySelector('[role=alert]'), null);
  await act(async () => update({ mobile: true, drawer: false, tab: 'Map', failed: false }));
  band = () => container.querySelector('.shell-band');
  assert.equal(container.querySelector('nav.sidebar'), null);
  assert.deepEqual([...band().querySelectorAll('button, .band-mark')].map(name), [
    'Contents',
    'Rabbithole',
    'Hide top bar',
    'Search learning trees',
    'New chat',
  ]);
  await act(async () => button(band(), 'Contents').click());
  assert.equal(button(band(), 'Contents').getAttribute('aria-expanded'), 'true');
  const drawer = document.querySelector('dialog[open]');
  assert.ok(drawer);
  assert.deepEqual([...drawer.querySelectorAll('.drawer-views button')].map(name), [
    'Read',
    'Map',
    'Library',
    'Knowledge',
    'Videos',
  ]);
  await act(async () => button(drawer, 'Settings').click());
  assert.equal(calls.at(-1), 'settings');
  assert.equal(button(band(), 'Contents').getAttribute('aria-expanded'), 'false');
});

test('focus mode hides the sidebar, survives a shell remount, keeps the save alert and ignores text entry, alternate chords and held keys', async (t) => {
  let mount;
  function Fixture() {
    const [mounted, setMounted] = useState(true);
    mount = setMounted;
    return h(
      'div',
      null,
      mounted &&
        h(ShellBand, {
          mobile: false,
          tab: 'learning',
          busy: false,
          drawer: false,
          views: [],
          saveAlert: h(SaveAlert, { retry() {} }),
          setDrawer() {},
          search() {},
          newChat() {},
          library() {},
          settings() {},
        }),
      h('input'),
      h('textarea'),
      h('select'),
      h(
        'div',
        { contentEditable: true, suppressContentEditableWarning: true },
        h('span', null, 'Editable'),
      ),
    );
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  const shown = 'nav.sidebar';
  const chord = async (target, options = {}) => {
    const e = new KeyboardEvent('keydown', {
      key: 'F',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    await act(async () => target.dispatchEvent(e));
    return e;
  };
  for (const target of container.querySelectorAll(
    'input, textarea, select, [contenteditable] span',
  )) {
    assert.equal((await chord(target)).defaultPrevented, false);
    assert.ok(container.querySelector(shown));
  }
  for (const options of [
    { ctrlKey: false },
    { shiftKey: false },
    { altKey: true },
    { metaKey: true },
    { repeat: true },
    { isComposing: true },
    { key: 'G' },
  ]) {
    assert.equal((await chord(container, options)).defaultPrevented, false);
    assert.ok(container.querySelector(shown));
  }
  const handled = new KeyboardEvent('keydown', {
    key: 'F',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  handled.preventDefault();
  await act(async () => container.dispatchEvent(handled));
  assert.ok(container.querySelector(shown));
  await chord(container);
  assert.equal(container.querySelector(shown), null);
  assert.equal(localStorage.getItem('rabbithole.focus-mode'), 'on');
  assert.match(
    container.querySelector('.focus-save [role=alert]').textContent,
    /Map layout not saved/,
    'save alert still announces while the sidebar is hidden',
  );
  assert.equal(container.querySelector('.focus-hot-zone'), null, 'desktop has no top hot zone');
  await chord(container);
  assert.ok(container.querySelector(shown));
  await chord(container);
  assert.equal(container.querySelector(shown), null);
  await act(async () => mount(false));
  await act(async () => mount(true));
  assert.equal(container.querySelector(shown), null);
  assert.equal(button(container, 'Show sidebar').getAttribute('aria-expanded'), 'false');
  await act(async () => button(container, 'Show sidebar').click());
  await act(async () => mount(false));
  await act(async () => mount(true));
  assert.ok(container.querySelector(shown));
  assert.equal(localStorage.getItem('rabbithole.focus-mode'), 'off');
});

test('the desktop sidebar toggle stays one button: a menu icon while hidden, a close icon while shown', async (t) => {
  const { container, act, cleanup } = await render(
    h(ShellBand, {
      mobile: false,
      tab: 'learning',
      busy: false,
      drawer: false,
      views: [viewTab('Read', null, true, () => {})],
      saveAlert: null,
      contents: h('aside', { className: 'contents' }, h('button', null, '1 Fungi')),
      setDrawer() {},
      search() {},
      newChat() {},
      library() {},
      settings() {},
    }),
    ui,
  );
  t.after(() => {
    localStorage.removeItem('rabbithole.focus-mode');
    cleanup();
  });
  const toggle = container.querySelector('.sidebar-toggle');
  const icon = () => toggle.querySelector('svg path').getAttribute('d');
  assert.equal(name(toggle), 'Hide sidebar');
  assert.equal(
    container.querySelectorAll('nav.sidebar button[aria-expanded]').length,
    0,
    'no second toggle in the sidebar',
  );
  const close = icon();
  await act(async () => {
    toggle.focus();
    toggle.click();
  });
  assert.equal(container.querySelector('nav.sidebar'), null);
  assert.equal(container.querySelector('.sidebar-toggle'), toggle, 'same button, not remounted');
  assert.equal(name(toggle), 'Show sidebar');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.notEqual(icon(), close, 'the icon changes');
  assert.equal(document.activeElement, toggle);
  await act(async () => toggle.click());
  assert.ok(container.querySelector('nav.sidebar'));
  assert.equal(icon(), close);
});

test('the sidebar toggle icon does not spin under prefers-reduced-motion', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
  assert.match(css, /\.sidebar-toggle svg \{\s*animation:/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.sidebar-toggle svg \{\s*animation: none;/,
  );
});

test('Ctrl+Shift+O starts one new chat per press from anywhere, including text entry, but not while opening', async (t) => {
  let setBusy;
  const calls = [];
  function Fixture() {
    const [busy, set] = useState(false);
    setBusy = set;
    return h(
      'div',
      null,
      h(ShellBand, {
        mobile: false,
        tab: 'library',
        busy,
        drawer: false,
        views: [],
        saveAlert: null,
        setDrawer() {},
        search() {},
        newChat: () => calls.push('new'),
        library() {},
        settings() {},
      }),
      h('textarea'),
      h('div', { className: 'astryx-chat-composer', contentEditable: true, role: 'textbox' }),
    );
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  const press = async (target, options = {}) => {
    const e = new KeyboardEvent('keydown', {
      key: 'O',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    await act(async () => target.dispatchEvent(e));
    return e.defaultPrevented;
  };
  for (const target of [
    container,
    container.querySelector('textarea'),
    container.querySelector('[role=textbox]'),
  ])
    assert.equal(await press(target), true, 'browser default prevented');
  assert.deepEqual(calls, ['new', 'new', 'new']);
  assert.equal(await press(container, { repeat: true }), true);
  assert.equal(await press(container, { isComposing: true }), false);
  for (const options of [
    { ctrlKey: false },
    { shiftKey: false },
    { altKey: true },
    { metaKey: true },
    { key: 'P' },
  ])
    assert.equal(await press(container, options), false);
  assert.equal(calls.length, 3, 'repeats, composition and other chords do nothing');
  await act(async () => setBusy(true));
  assert.equal(await press(container), true);
  assert.equal(calls.length, 3, 'nothing while a tree is opening');
});
