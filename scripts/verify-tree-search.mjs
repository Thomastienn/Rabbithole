// Built-app browser fixture (in-process fake provider, not a live model) for floating title search in the shell band and the quiet Library list scrollbar.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `tree-search-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, '--hide-scrollbars', 'false', ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'tree-search-')), 'data.sqlite'));
// Enough older trees that the Library list must scroll to reach the oldest one.
for (let i = 1; i <= 30; i++) store.create(`Filler topic ${i}`);
const photo = store.create('Photosynthesis basics');
store.message(photo.id, 'user', 'How do leaves make sugar?', 'completed');
const reply = store.message(photo.id, 'assistant', 'Leaves use **chlorophyll** to capture light.', 'completed');
const child = store.branch(store.tree(photo.id), { messageId: reply, start: 0, end: 6, text: 'Leaves', question: 'Why green?' }, 'ctx');
store.message(child.id, 'user', 'Why green?', 'completed');
store.message(child.id, 'assistant', 'Green light is reflected by the thylakoid membranes.', 'completed');
store.message(store.create('Roman roads').id, 'user', 'Who built the roads?', 'completed');
let calls = 0;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async () => { calls++; } } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
const palette = `document.querySelector('dialog[open][aria-label="Search learning trees"]')`;
const input = 'dialog[open][aria-label="Search learning trees"] input';
const options = () => ev(`[...(${palette}?.querySelectorAll('[role=option]') ?? [])].map(e => e.innerText.trim())`);
const highlighted = () => ev(`document.getElementById(document.querySelector('${input}').getAttribute('aria-activedescendant'))?.innerText.trim() ?? null`);
const current = () => ev(`document.querySelector('.tree-switcher-title')?.innerText`);
const openSearch = async () => { await b('click', '.tree-search'); await wait(`${palette} && document.activeElement.matches('${input}')`); };
// Any visible chat header or map; a plain selector wait can pick a hidden .overview first.
const ready = () => b('wait', '--fn', `[...document.querySelectorAll('.chat-header, .overview')].some(e => e.checkVisibility())`);
try {
  await b('set', 'viewport', '1400', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await ready();
  assert.equal(await ev(`!!document.querySelector('.shell-band input:not(dialog input)')`), false, 'no persistent search field in the band');

  await openSearch();
  assert.match(await ev(`${palette}.innerText`), /Type part of a learning tree’s title/, 'empty query explains what to type');
  steps.push('Wide dark: search icon opens a floating dialog with the field focused and a title hint');

  await b('type', input, 'THYLAKOID');
  await wait(`${palette}.innerText.includes('No learning tree titles match')`);
  assert.deepEqual(await options(), [], 'message-only match shows no result');
  steps.push('Typed "THYLAKOID" (message text only): "No learning tree titles match." and no options');

  await b('fill', input, 'O');
  await wait(`${palette}.querySelectorAll('[role=option]').length >= 3`);
  const all = await options();
  assert.deepEqual(all.slice(0, 2), ['Roman roads', 'Photosynthesis basics'], 'case-insensitive title matches, newest first');
  await b('press', 'ArrowDown');
  const first = await highlighted();
  await b('press', 'ArrowDown');
  const second = await highlighted();
  assert.notEqual(first, second, 'ArrowDown moves the highlight');
  await b('press', 'ArrowUp');
  assert.equal(await highlighted(), first, 'ArrowUp moves it back');
  steps.push(`Typed "O": ${all.length} title results; ArrowDown/ArrowUp move highlight (${first} → ${second} → ${first})`);

  await b('fill', input, 'photo');
  await wait(`${palette}.querySelectorAll('[role=option]').length === 1`);
  await b('press', 'ArrowDown');
  await b('press', 'Enter');
  await wait(`!${palette} && document.querySelector('.tree-switcher-title')?.innerText.startsWith('Photosynthesis')`);
  assert.equal(await current(), 'Photosynthesis basics');
  steps.push('Typed "photo", ArrowDown, Enter: dialog closes and Photosynthesis basics opens');

  await openSearch();
  await b('type', input, 'roman');
  await wait(`${palette}.querySelectorAll('[role=option]').length === 1`);
  await b('press', 'Escape');
  await wait(`!${palette}`);
  assert.equal(await ev(`document.activeElement.matches('.tree-search')`), true, 'Escape returns focus to the search icon');
  assert.equal(await current(), 'Photosynthesis basics', 'dismissal keeps the current tree');
  await openSearch();
  assert.equal(await ev(`document.querySelector('${input}').value`), '', 'reopening starts empty');
  await b('press', 'Escape');
  await wait(`!${palette}`);
  steps.push('Escape dismisses without opening anything; focus returns to the icon; reopening starts empty');

  // Scrollbar: thin rounded transparent-track thumb, hidden at rest, shown on hover/scroll/focus.
  const nav = `document.querySelector('.library-panel')`;
  await b('click', '.tree-switcher');
  await b('wait', '.saved-chat-title');
  await b('mouse', 'move', '1300', '450');
  assert.equal(await ev(`${nav}.scrollHeight > ${nav}.clientHeight`), true, 'Library list overflows');
  const css = await ev(`(() => { const s = [...document.styleSheets].flatMap(x => [...x.cssRules]).map(r => r.cssText).join('\\n'); return { radius: s.includes('border-radius: 999px'), track: /library-panel::-webkit-scrollbar \\{[^}]*background: transparent/.test(s), resting: getComputedStyle(${nav}).overflowY }; })()`);
  assert.deepEqual(css, { radius: true, track: true, resting: 'auto' }, 'rounded thumb, transparent track, scroll never disabled');
  await b('screenshot', join('docs', 'verification', 'tree-search-scroll-rest-dark.png'));
  await b('hover', '.library-panel');
  await b('screenshot', join('docs', 'verification', 'tree-search-scroll-hover-dark.png'));
  await b('mouse', 'wheel', '600');
  await wait(`${nav}.scrollTop > 0 && 'scrolling' in ${nav}.dataset`);
  await b('mouse', 'move', '1300', '450');
  await wait(`!('scrolling' in ${nav}.dataset)`);
  steps.push('Mouse wheel scrolls the Library list and marks it scrolling (thumb shown), mark clears after scrolling stops; rest/hover screenshots saved');

  await ev(`${nav}.scrollTop = 0; true`);
  await ev(`[...document.querySelectorAll('.saved-chat-title')].at(-1).focus(); true`);
  const last = await ev(`(() => { const e = [...document.querySelectorAll('.saved-chat-title')].at(-1), r = e.getBoundingClientRect(), n = ${nav}.getBoundingClientRect(); return { text: e.innerText.split('\\n')[0], visible: r.top >= n.top && r.bottom <= n.bottom + 1, scrolled: ${nav}.scrollTop > 0 }; })()`);
  assert.deepEqual(last, { text: 'Filler topic 1', visible: true, scrolled: true }, 'keyboard focus reaches and reveals the oldest tree');
  assert.equal(await ev(`document.querySelectorAll('.tree-date-heading').length > 0`), true, 'grouping intact');
  steps.push('Keyboard focus on the oldest tree scrolls it into view; date groups intact');

  // Narrow: the band's search icon opens search; choose a result.
  await b('set', 'viewport', '390', '800');
  await b('reload');
  await ready();
  await b('click', '.tree-search');
  await wait(`${palette} && document.activeElement.matches('${input}')`);
  await b('type', input, 'roman');
  await wait(`${palette}.querySelectorAll('[role=option]').length === 1`);
  await b('screenshot', join('docs', 'verification', 'tree-search-narrow-dark.png'));
  await b('click', `${input.replace(' input', '')} [role=option]`);
  await wait(`!${palette} && document.querySelector('.chat-header')?.innerText.includes('Roman roads')`);
  steps.push('Narrow dark: band search icon opens search; tapping "Roman roads" opens it; docs/verification/tree-search-narrow-dark.png');

  for (const [w, h] of [['1400', '900'], ['390', '800']]) {
    await b('set', 'viewport', w, h);
    await ev(`localStorage.setItem('treetutor.appearance', 'light'); true`);
    await b('reload');
    await ready();
    if (w === '390') await b('click', '.tree-search');
    else { await b('click', '.tree-switcher'); await b('wait', '.saved-chat-title'); await b('hover', '.library-panel'); await b('screenshot', join('docs', 'verification', 'tree-search-scroll-hover-light.png')); await b('click', '.tree-search'); }
    await wait(`${palette}`);
    await b('type', input, 'leaves');
    await wait(`${palette}.innerText.includes('No learning tree titles match')`);
    await b('fill', input, 'basics');
    await wait(`${palette}.querySelectorAll('[role=option]').length === 1`);
    const file = join('docs', 'verification', `tree-search-${w === '390' ? 'narrow' : 'wide'}-light.png`);
    await b('screenshot', file);
    await b('press', 'Escape');
    steps.push(`Light ${w}px: "leaves" (message-only) empty state, "basics" one result; ${file}`);
  }
  await ev(`localStorage.removeItem('treetutor.appearance'); true`);
  assert.equal(calls, 0, 'search made no model calls');
  console.log(JSON.stringify({ pass: true, steps }, null, 2));
} catch (e) { console.error(steps); throw e; } finally { await b('close').catch(() => {}); app.stop(); store.close(); }
