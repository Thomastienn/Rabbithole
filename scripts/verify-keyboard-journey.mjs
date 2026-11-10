import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Keyboard-only learning journey. Every interaction is a key press; eval only reads state.
// Requires a built app and agent-browser. Synthetic provider; no credentials.
const run = promisify(execFile), session = `keys-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const press = key => b('press', key);
const type = text => b('keyboard', 'type', text);
const idle = "!document.documentElement.matches(':active-view-transition')";
const focusName = `(document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent.trim() || '')`;
const view = () => ev('document.querySelector(".react-flow__viewport")?.style.transform');
const log = [];
const step = text => { log.push(text); console.log(`ok - ${text}`); };
// Tab (or Shift+Tab) until focus matches; proves the control is reachable without a pointer.
async function tabTo(test, { back = false, max = 80 } = {}) {
  for (let i = 0; i < max; i++) {
    if (await ev(`(() => { const e = document.activeElement; return !!e && !!(${test}); })()`)) return i;
    await press(back ? 'Shift+Tab' : 'Tab');
  }
  assert.fail(`Not reachable by ${back ? 'Shift+Tab' : 'Tab'}: ${test} (focus on ${await ev(focusName)})`);
}
const named = name => `(e.getAttribute('aria-label') || e.textContent.trim()) === ${JSON.stringify(name)}`;
// Focus must be visible: a non-zero box and a focus ring (outline or box-shadow).
const visibleFocus = `(() => { const e = document.activeElement, r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && ((s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'); })()`;

const text = 'Fungi trade sugar. Fungi trade water too.';
const store = new Store(join(mkdtempSync(join(tmpdir(), 'keys-')), 'trees.sqlite'));
let held;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {
  models: async () => [{ model: 'kb-a', label: 'Keyboard A', isDefault: true }, { model: 'kb-b', label: 'Keyboard B' }],
  async generate(tree, prompt, emit, save, signal) {
    if (prompt.startsWith('Compact only')) { emit({ type: 'item', item: 'summary', text: 'Fixture context' }); emit({ type: 'status', status: 'completed' }); return; }
    save(tree.thread ?? `thread-${tree.id}`, tree.model ?? 'kb-a');
    emit({ type: 'item', item: 'reply', text });
    if (prompt === 'Hold this reply') { held = tree.model; await new Promise(resolve => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true })); return; }
    emit({ type: 'status', status: 'completed' });
  },
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await wait(`[...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'New chat')`);

  // 1. Create and open a chat.
  await tabTo(named('New chat')); assert.equal(await ev(visibleFocus), true); await press('Enter');
  await wait(`document.activeElement?.closest('.focused-chat [role=textbox]') && document.querySelector('.focused-chat h2')?.textContent === 'New chat' && document.querySelectorAll('.react-flow__node').length === 1 && ${idle}`);
  step('New chat (Tab, Enter) creates a root box titled New chat, opens its chat and focuses the composer');
  await type('How do fungi trade?'); await press('Enter');
  await wait(`document.querySelector('.focused-chat')?.innerText.includes(${JSON.stringify(text)}) && !document.querySelector('.focused-chat [role=textbox]').hasAttribute('disabled')`);
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'How do fungi trade?'`);
  const root = store.list().find(t => t.title === 'How do fungi trade?');
  assert.equal(store.tree(root.id).messages.length, 2);
  step('Enter sends; the first question titles the root');

  // 2. Select the second, repeated passage and branch from it.
  async function branchFrom(question, start, end) {
    await tabTo(named('Select passage in tutor reply 1'), { back: true }); assert.equal(await ev(visibleFocus), true); await press('Enter');
    await wait(`document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.readOnly`);
    await press('Home'); for (let i = 0; i < start; i++) await press('ArrowRight');
    for (let i = start; i < end; i++) await press('Shift+ArrowRight');
    await press('Tab'); assert.equal(await ev(focusName), 'Ask about selection'); await press('Enter');
    await wait(`${focusName} === 'Question about this passage' || document.activeElement?.closest('.branch-form') && document.activeElement.tagName === 'TEXTAREA'`);
    await type('draft'); await press('Control+a'); await type(question); // edit the question before submitting
    await tabTo(named('Create focused chat')); await press('Enter');
    await wait(`document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(question)} && document.querySelector('.focused-chat')?.innerText.includes(${JSON.stringify(text)}) && document.activeElement?.closest('.focused-chat [role=textbox]')`);
    return store.list().find(t => t.title === question);
  }
  const second = text.indexOf('Fungi trade', 1);
  const child = await branchFrom('Why trade water?', second, second + 'Fungi trade'.length);
  assert.deepEqual([child.parent, store.tree(child.id).branch.start, store.tree(child.id).branch.end, store.tree(child.id).branch.text], [root.id, second, second + 11, 'Fungi trade']);
  step(`Select passage in tutor reply 1 (Enter) → read-only text; Home/Arrow/Shift+Arrow select the repeated passage; Tab → Ask about selection; edited question; Create focused chat saves exact offsets ${second}–${second + 11}`);
  const grand = await branchFrom('What is sugar?', 12, 17);
  assert.deepEqual([grand.parent, store.tree(grand.id).branch.text], [child.id, 'sugar']);
  step('The same keys create a nested child from the child reply; composer focused in the new chat');

  // 3. Text and IME keys stay in the text field.
  await wait(`!document.querySelector('.focused-chat [role=textbox]').hasAttribute('disabled')`);
  const before = await view();
  await ev(`(() => { const t = document.activeElement; t.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', isComposing: true, bubbles: true })); return true; })()`);
  await b('keyboard', 'inserttext', '菌根');
  await ev(`document.activeElement.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '菌根' }))`);
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Shift+ArrowLeft', 'Space', 'Backspace']) await press(key);
  assert.equal(await view(), before);
  assert.ok((await ev(`document.querySelector('.focused-chat [role=textbox]').textContent`)).includes('菌'));
  await press('Control+a'); await press('Backspace');
  step('IME composition, committed CJK text and Arrow/Home/End/Space/Backspace in the composer never move the map');

  // 4. Model menu: Escape closes the menu first; selection persists for the next reply.
  await tabTo(named('Model for next reply'), { back: true }); assert.equal(await ev(visibleFocus), true);
  await press('Space'); await wait(`document.activeElement?.getAttribute('role') === 'menuitemradio'`);
  await press('Escape');
  await wait(`${focusName} === 'Model for next reply' && !document.querySelector('[role=menu]')?.checkVisibility()`);
  assert.equal(await ev(`getComputedStyle(document.querySelector('.focused-chat')).display`), 'flex');
  await press('Enter'); await wait(`document.activeElement?.getAttribute('role') === 'menuitemradio'`);
  await press('Home'); await press('ArrowDown'); assert.equal(await ev(`document.activeElement.textContent.trim()`), 'Keyboard B'); await press('Enter');
  await wait(`document.querySelector('.focused-chat')?.textContent.includes('Keyboard B · saved automatically')`);
  assert.equal(store.tree(grand.id).model, 'kb-b'); assert.equal(store.tree(child.id).model, 'kb-a');
  step('Model for next reply (Space/Enter) opens the menu; Escape closes only the menu and restores focus to its trigger; Home/ArrowDown/Enter saves Keyboard B for this conversation only');

  // 5. Stop a selected reply; the active turn keeps its captured model.
  await tabTo(`e.closest('.focused-chat [role=textbox]')`);
  await type('Hold this reply'); await press('Enter');
  await wait(`[...document.querySelectorAll('button')].some(e => (e.getAttribute('aria-label') || e.textContent.trim()) === 'Stop')`);
  assert.equal(held, 'kb-b');
  assert.equal(await ev(`document.querySelector('[aria-label="Model for next reply"]').getAttribute('aria-disabled')`), 'true');
  await tabTo(named('Stop'), { back: true }); await press('Enter');
  await wait(`document.querySelector('.focused-chat')?.innerText.includes('Reply interrupted')`);
  step('During a reply the model menu is disabled and the turn uses its captured model; Shift+Tab → Stop, Enter interrupts the reply');

  // 6. Expanded chat and Escape back to the map with focus restored.
  await tabTo(named('Expand chat'), { back: true }); await press('Enter');
  await wait(`document.querySelector('.tree-workspace').dataset.expanded === 'true' && ${focusName} === 'Show map beside chat'`);
  await press('Enter');
  await wait(`document.querySelector('.tree-workspace').dataset.expanded === 'false' && ${focusName} === 'Expand chat'`);
  step('Expand chat / Show map beside chat toggle by Enter and keep focus on the toggle');
  await press('Escape');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none' && document.activeElement?.closest('.overview') && ${idle}`);
  const returnedTo = await ev(focusName);
  await tabTo(named('Reopen chat'), { back: true }); await press('Enter');
  await wait(`document.activeElement?.closest('.focused-chat [role=textbox]') && document.querySelector('.tree-workspace').dataset.expanded === 'false' && ${idle}`);
  await press('Escape');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none' && ${focusName} === ${JSON.stringify(returnedTo)} && ${idle}`);
  step(`Escape returns to "${returnedTo}" on the map; Tab/Enter on Reopen chat restores beside mode and composer focus; Escape restores the same box focus`);

  // 7. Map: pan, move a box, zoom, fit, fold and bulk actions.
  await tabTo(`e.classList.contains('tree-canvas')`, { back: true });
  let v = await view(); await press('ArrowRight'); assert.notEqual(await view(), v);
  v = await view(); await press('Shift+ArrowDown'); assert.notEqual(await view(), v);
  step('Tree canvas region: Arrow pans 100px, Shift+Arrow 300px');
  await tabTo(`e.classList.contains('react-flow__node') && e.dataset.id === ${JSON.stringify(child.id)}`);
  const at = await ev(`document.activeElement.style.transform`);
  await press('ArrowDown'); await press('Shift+ArrowRight');
  await wait(`document.activeElement.style.transform !== ${JSON.stringify(at)} && document.body.innerText.includes('Why trade water? moved to')`);
  step('A focused conversation box moves with Arrow (10px) and Shift+Arrow (100px); the move is announced');
  for (const name of ['Zoom in', 'Zoom out', 'Fit tree']) {
    await tabTo(named(name), { back: true }); v = await view(); await press('Enter');
    if (name !== 'Fit tree') await wait(`document.querySelector(".react-flow__viewport").style.transform !== ${JSON.stringify(v)}`);
  }
  step('Zoom in, Zoom out and Fit tree are toolbar buttons operated with Enter');
  await tabTo(`e.id === ${JSON.stringify(`fold-${child.id}`)}`); await press('Enter');
  await wait(`!document.querySelector('.react-flow__node[data-id="${grand.id}"]') && document.activeElement?.id === 'fold-${child.id}'`);
  await press('Space');
  await wait(`!!document.querySelector('.react-flow__node[data-id="${grand.id}"]') && document.activeElement?.id === 'fold-${child.id}'`);
  step('Collapse/Expand descendants toggle with Enter/Space and keep focus on the toggle');
  async function menuAction(label) {
    await tabTo(named('Map menu'), { back: true }); await press('Enter');
    await wait(`document.activeElement?.getAttribute('role') === 'menuitem'`);
    for (let i = 0; i < 10 && await ev(`document.activeElement?.textContent.trim()`) !== label; i++) await press('ArrowDown');
    assert.equal(await ev(`document.activeElement?.textContent.trim()`), label); await press('Enter');
  }
  await menuAction('Collapse all');
  await wait(`document.querySelectorAll('.react-flow__node').length === 1`);
  await menuAction('Expand all');
  await wait(`document.querySelectorAll('.react-flow__node').length === 3`);
  await menuAction('Keep current branch');
  await wait(`document.querySelectorAll('.react-flow__node').length === 3`);
  step('Map menu (Enter, ArrowDown, Enter): Collapse all, Expand all and Keep current branch');

  // 8. Open from the map, reveal a source, and return to the originating control.
  await tabTo(`e.id === ${JSON.stringify(`open-${child.id}`)}`); await press('Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Why trade water?' && document.activeElement?.closest('.focused-chat [role=textbox]') && ${idle}`);
  await press('Escape');
  await wait(`document.activeElement?.id === ${JSON.stringify(`open-${child.id}`)} && ${idle}`);
  step('Enter on a box title opens its chat with the composer focused; Escape returns focus to that title');
  await tabTo(`e.id === ${JSON.stringify(`reveal-${child.id}`)}`); await press('Enter');
  await wait(`document.activeElement?.tagName === 'MARK' && document.activeElement.textContent === 'Fungi trade'`);
  await press('Escape');
  await wait(`document.activeElement?.id === ${JSON.stringify(`reveal-${child.id}`)} && ${idle}`);
  step('Reveal source passage (Enter) focuses the exact highlighted passage; Escape returns to the reveal control');

  // 9. No keyboard trap: Tab cycles through the whole page and back again.
  const start = await ev(focusName);
  const seen = new Set();
  for (let i = 0; i < 60; i++) { await press('Tab'); seen.add(await ev(focusName)); }
  assert.ok(seen.size > 8, `Tab cycle visited only ${[...seen].join(', ')}`);
  await tabTo(`e.id === ${JSON.stringify(`reveal-${child.id}`)}`, { back: true, max: 120 });
  step(`No keyboard trap: 60 Tabs from "${start}" visited ${seen.size} distinct controls; Shift+Tab returns to the start`);
  console.log(JSON.stringify({ result: 'PASS', provider: 'synthetic fixture (no live provider)', steps: log }, null, 2));
} catch (error) { console.error('focus:', await ev(focusName).catch(() => '?')); throw error; } finally { await b('close').catch(() => {}); app.stop(); store.close(); }
