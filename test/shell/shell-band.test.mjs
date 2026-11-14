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

test('desktop and narrow bands keep control order, current views, drawer actions and layout Retry', async (t) => {
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
        rootTitle: 'Fungi',
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
  const band = () => container.querySelector('.shell-band');
  assert.deepEqual([...band().querySelectorAll('button')].map(name), [
    'Fungi · Learning trees',
    'Read',
    'Map',
    'Knowledge',
    'Videos',
    'Retry saving layout',
    'Search learning trees',
    'New chat',
    'Settings',
  ]);
  assert.match(
    band().querySelector('[role=alert]').textContent,
    /Map layout not saved.*retries every minute/s,
  );
  for (const label of ['Read', 'Knowledge', 'Videos', 'Map']) {
    await act(async () => button(band(), label).click());
    assert.equal(band().querySelector('[aria-current=page]').textContent, label);
  }
  for (const [label, expected] of [
    ['Search learning trees', 'search'],
    ['New chat', 'new'],
    ['Settings', 'settings'],
    ['Fungi · Learning trees', 'library'],
    ['Retry saving layout', 'retry'],
  ]) {
    await act(async () => button(band(), label).click());
    assert.equal(calls.at(-1), expected);
  }
  assert.equal(band().querySelector('[role=alert]'), null);
  await act(async () => update({ mobile: true, drawer: false, tab: 'Map', failed: false }));
  assert.deepEqual([...band().querySelectorAll('button, .band-mark')].map(name), [
    'Contents',
    'TreeTutor',
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
