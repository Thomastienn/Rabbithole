// Built-app browser fixture (in-process fake provider, not a live model) for the moss shell band:
// view tabs with aria-current, keyboard order, paper focus ring, AA contrast, search, New chat, Settings,
// the save-failure state and the Library that replaced the rail. Saves dark and light screenshots.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
  session = `shell-band-${process.pid}`;
const b = async (...args) =>
  (
    await run('agent-browser', ['--session', session, ...args], {
      env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') },
    })
  ).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'shell-band-')), 'data.sqlite'));
store.message(store.create('Roman roads').id, 'user', 'Who built the roads?', 'completed');
const fungi = store.create('How do fungi trade with plant roots?');
store.message(fungi.id, 'user', 'How do fungi trade?', 'completed');
store.message(
  fungi.id,
  'assistant',
  'Fungi trade **phosphorus** for sugar along their hyphae.',
  'completed',
);
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
    generate: async () => {},
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
const current = () =>
  ev(
    `[...document.querySelectorAll('.shell-band [aria-current=page]')].map(e => e.getAttribute('aria-label') || e.innerText.trim())`,
  );
const visible = (sel) =>
  ev(
    `(() => { const e = document.querySelector('${sel}'); return !!e && !e.closest('[hidden]') && getComputedStyle(e).display !== 'none'; })()`,
  );
const settle = async () => {
  await wait(
    'document.getAnimations().every(a => a.playState !== "running") && !document.documentElement.matches(":active-view-transition")',
  );
  await new Promise((r) => setTimeout(r, 300));
};
const shot = async (name) => {
  await settle();
  await b('screenshot', `${process.cwd()}/docs/verification/shell-band-${name}.png`);
};
// WCAG relative-luminance contrast of two computed CSS colours (opaque, as the band and its text are).
const contrast = (fg, bg) =>
  ev(`(() => {
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = v => { c.clearRect(0, 0, 1, 1); c.fillStyle = v; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const L = v => { const [r, g, b] = rgb(v).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, d] = [L(${JSON.stringify(fg)}), L(${JSON.stringify(bg)})].sort((x, y) => y - x); return (a + 0.05) / (d + 0.05);
})()`);
const style = (sel, prop) => ev(`getComputedStyle(document.querySelector('${sel}')).${prop}`);
async function checkContrast(appearance) {
  const band = await style('.shell-band', 'backgroundColor');
  for (const [sel, min] of [
    ['.band-mark', 4.5],
    ['.view-tab:not([aria-current])', 4.5],
    ['.new-chat', 4.5],
    ['.tree-switcher', 4.5],
  ]) {
    const ratio = await contrast(await style(sel, 'color'), band);
    assert.ok(ratio >= min, `${appearance}: ${sel} contrast ${ratio.toFixed(2)} on the band`);
  }
  const tab = '.view-tab[aria-current=page]';
  const tabRatio = await contrast(await style(tab, 'color'), await style(tab, 'backgroundColor'));
  assert.ok(tabRatio >= 4.5, `${appearance}: current tab contrast ${tabRatio.toFixed(2)}`);
  await b('focus', '.view-tab[aria-current=page]');
  await b('press', 'Tab');
  const ring = await ev(
    `(() => { const s = getComputedStyle(document.activeElement); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor, inBand: !!document.activeElement.closest('.shell-band') }; })()`,
  );
  assert.ok(
    ring.inBand && ring.style !== 'none' && ring.width >= 2,
    `${appearance}: visible focus ring ${JSON.stringify(ring)}`,
  );
  assert.equal(
    ring.color,
    await ev(
      `(() => { const e = document.createElement('i'); e.style.color = 'var(--treetutor-band-ink)'; document.querySelector('.shell-band').append(e); const c = getComputedStyle(e).color; e.remove(); return c; })()`,
    ),
    `${appearance}: focus ring is the paper band ink`,
  );
  const ringRatio = await contrast(ring.color, band);
  assert.ok(ringRatio >= 3, `${appearance}: focus ring contrast ${ringRatio.toFixed(2)}`);
  // Tooltips render inside the band and must keep their own colours.
  await b('hover', '.tree-switcher');
  await wait(`document.querySelector('.shell-band [role=tooltip]')?.checkVisibility()`);
  const tip = await ev(
    `(() => { const t = document.querySelector('.shell-band [role=tooltip]'); let e = t; while (e && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor)) e = e.firstElementChild; return { fg: getComputedStyle(e ?? t).color, bg: getComputedStyle(e ?? t).backgroundColor }; })()`,
  );
  const tipRatio = await contrast(tip.fg, tip.bg);
  assert.ok(
    tipRatio >= 4.5,
    `${appearance}: band tooltip contrast ${tipRatio.toFixed(2)} ${JSON.stringify(tip)}`,
  );
  await b('mouse', 'move', '700', '600');
  steps.push(
    `${appearance}: tooltip ${tipRatio.toFixed(1)}:1; band text >= 4.5:1, current tab ${tabRatio.toFixed(1)}:1, paper focus ring ${ringRatio.toFixed(1)}:1 on moss`,
  );
}
try {
  await b('set', 'viewport', '1400', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await wait(`document.querySelector('.react-flow__node')`);
  assert.equal(
    await ev(
      `!!document.querySelector('aside:not(.ink-legend), #tree-navigation, .sidebar-expand, [aria-label="Expand learning trees"]')`,
    ),
    false,
    'the left rail is gone',
  );
  assert.deepEqual(await current(), ['Map'], 'the newest tree opens on its map');
  assert.match(
    await ev(`document.querySelector('.tree-switcher').innerText`),
    /How do fungi trade with plant roots\?/,
  );
  steps.push(
    'Load: band shows TreeTutor, the open tree in the switcher, Map current; no left rail',
  );
  await shot('map-dark');

  // Keyboard order through the band.
  await b('focus', '.tree-switcher');
  const order = [await ev(`document.activeElement.getAttribute('aria-label')`)];
  for (let i = 0; i < 7; i++) {
    await b('press', 'Tab');
    order.push(
      await ev(
        `document.activeElement.getAttribute('aria-label') || document.activeElement.innerText.trim()`,
      ),
    );
  }
  assert.deepEqual(order, [
    'How do fungi trade with plant roots? · Learning trees',
    'Read',
    'Map',
    'Knowledge',
    'Videos',
    'Search learning trees',
    'New chat',
    'Settings',
  ]);
  steps.push(`Tab order: ${order.join(' → ')}`);

  // Read and Map drive the focused-chat switch.
  await b('focus', '.view-tab:nth-child(1)');
  await b('press', 'Enter');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`);
  assert.deepEqual(await current(), ['Read']);
  await shot('read-dark');
  await checkContrast('dark');
  await click('Map');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  assert.deepEqual(await current(), ['Map']);
  steps.push('Read (Enter) opens the focused chat with aria-current=page; Map returns to the map');

  // Knowledge and Videos open their pages.
  await b('focus', '.view-tab:nth-child(3)');
  await b('press', 'Enter');
  await wait(`!document.querySelector('main[aria-label=Knowledge]').hidden`);
  assert.deepEqual(await current(), ['Knowledge']);
  await click('Videos');
  await wait(`!document.querySelector('main[aria-label=Videos]').hidden`);
  assert.deepEqual(await current(), ['Videos']);
  await click('Return to learning tree');
  await wait(`!document.querySelector('main.conversation').hidden`);
  assert.deepEqual(await current(), ['Map']);
  steps.push(
    'Knowledge and Videos open their pages as the current tab; their Return buttons still lead back',
  );

  // The switcher opens the Library: everything the rail offered.
  await b('click', '.tree-switcher');
  await wait(`document.querySelector('.saved-chat-title')`);
  assert.deepEqual(await current(), ['How do fungi trade with plant roots? · Learning trees']);
  assert.deepEqual(
    await ev(
      `[...document.querySelectorAll('.saved-chat-title')].map(e => e.innerText.split('\\n')[0])`,
    ),
    ['How do fungi trade with plant roots?', 'Roman roads'],
  );
  assert.equal(
    await ev(
      `document.querySelector('.saved-chat-title[aria-current=true]').innerText.split('\\n')[0]`,
    ),
    'How do fungi trade with plant roots?',
  );
  await click('Actions for How do fungi trade with plant roots?');
  await wait(
    `['Rename chat', 'Delete chat…'].every(n => [...document.querySelectorAll('[role=menuitem]')].some(e => e.innerText.trim() === n))`,
  );
  await b('press', 'Escape');
  await shot('library-dark');
  await b('find', 'role', 'button', 'click', '--name', 'Roman roads');
  await wait(
    `document.querySelector('.tree-switcher').innerText.includes('Roman roads') && !document.querySelector('main.conversation').hidden`,
  );
  steps.push(
    'Switcher opens the Library: grouped tree list, branch counts, current tree, Rename/Delete menu; a title opens that tree',
  );

  // Search learning trees keeps title search with its empty and no-match text.
  const palette = `document.querySelector('dialog[open][aria-label="Search learning trees"]')`;
  await b('click', '.tree-search');
  await wait(`${palette}?.innerText.includes('Type part of a learning tree’s title')`);
  await b('type', 'dialog[open][aria-label="Search learning trees"] input', 'zzz');
  await wait(`${palette}.innerText.includes('No learning tree titles match')`);
  await b('fill', 'dialog[open][aria-label="Search learning trees"] input', 'fungi');
  await wait(`${palette}.querySelector('[role=option]')`);
  // The palette keeps popover colours rather than the band's text overrides.
  const option = await ev(
    `(() => { const o = document.querySelector('dialog[open][aria-label="Search learning trees"] [role=option]'); let e = o; while (e && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor)) e = e.parentElement; return { fg: getComputedStyle(o).color, bg: e ? getComputedStyle(e).backgroundColor : getComputedStyle(document.body).backgroundColor }; })()`,
  );
  const optionRatio = await contrast(option.fg, option.bg);
  assert.ok(optionRatio >= 4.5, `search result contrast ${optionRatio.toFixed(2)}`);
  await shot('search-dark');
  await b('press', 'ArrowDown');
  await b('press', 'Enter');
  await wait(`!${palette} && document.querySelector('.tree-switcher').innerText.includes('fungi')`);
  steps.push('Search: empty hint, no-match text, a title match opens its tree');

  // Settings and New chat.
  await click('Settings');
  await wait(`document.activeElement?.id === 'settings-heading'`);
  await b('press', 'Escape');
  await wait(
    `!document.querySelector('.settings-page:not([hidden])') && document.activeElement.matches('.band-settings')`,
  );
  await click('New chat');
  await wait(
    `document.activeElement?.closest('.first-question [role=textbox]') && document.querySelector('.tree-switcher').innerText.includes('Learning trees')`,
  );
  assert.deepEqual(await current(), ['Read']);
  steps.push(
    'Settings opens and returns focus to its band button; New chat opens a blank focused composer in Read',
  );
  // New chat saved nothing; reopen the fungi tree for the map checks.
  await b('click', '.tree-search');
  await b('fill', 'dialog[open][aria-label="Search learning trees"] input', 'fungi');
  await wait(`${palette}?.querySelector('[role=option]')`);
  await b('press', 'ArrowDown');
  await b('press', 'Enter');
  await wait(`!${palette} && document.querySelector('.tree-switcher').innerText.includes('fungi')`);

  // Save state: a failed layout write shows in the band with its retry.
  await click('Map');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  await ev(
    `window.realFetch = window.fetch; window.fetch = (url, options) => String(url).endsWith('/layout') ? Promise.resolve(new Response('{"error":"Synthetic write failure"}', { status: 500, headers: { 'Content-Type': 'application/json' } })) : window.realFetch(url, options); true`,
  );
  await click('Zoom in');
  await ev('__layoutMinute()');
  await wait(
    `document.querySelector('.shell-band [role=alert]')?.textContent.includes('Map layout not saved. It retries every minute while this tree stays open.')`,
  );
  await shot('save-failed-dark');
  const alert = await contrast(
    await ev(`getComputedStyle(document.querySelector('.band-save').firstElementChild).color`),
    await style('.band-save', 'backgroundColor'),
  );
  assert.ok(alert >= 4.5, `failure pill contrast ${alert.toFixed(2)}`);
  await ev('window.fetch = window.realFetch; true');
  await click('Retry saving layout');
  await wait(`!document.querySelector('.shell-band [role=alert]')`);
  steps.push(
    `Save failure: band alert "Map layout not saved." (${alert.toFixed(1)}:1) with Retry saving layout, cleared on success`,
  );

  // Light appearance.
  await b('eval', `localStorage.setItem('treetutor.appearance', 'light'); location.reload(); true`);
  await wait(`document.querySelector('.react-flow__node')`);
  await click('Read');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`);
  await shot('read-light');
  await checkContrast('light');
  await click('Map');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  await shot('map-light');
  await b('click', '.tree-search');
  await b('type', 'dialog[open][aria-label="Search learning trees"] input', 'roman');
  await wait(
    `document.querySelector('dialog[open][aria-label="Search learning trees"] [role=option]')`,
  );
  const lightOption = await ev(
    `(() => { const o = document.querySelector('dialog[open][aria-label="Search learning trees"] [role=option]'); let e = o; while (e && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(e).backgroundColor)) e = e.parentElement; return { fg: getComputedStyle(o).color, bg: e ? getComputedStyle(e).backgroundColor : getComputedStyle(document.body).backgroundColor }; })()`,
  );
  const lightRatio = await contrast(lightOption.fg, lightOption.bg);
  assert.ok(lightRatio >= 4.5, `light search result contrast ${lightRatio.toFixed(2)}`);
  await shot('search-light');
  await b('press', 'Escape');
  steps.push(
    `Search palette keeps popover colours: result text ${optionRatio.toFixed(1)}:1 dark, ${lightRatio.toFixed(1)}:1 light`,
  );
  console.log(steps.map((s) => `PASS ${s}`).join('\n'));
} finally {
  await b('close').catch(() => {});
  app.server.close();
}
