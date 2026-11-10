import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Optional Vim canvas aliases (docs/vim-bindings-proposal.md). Built app, isolated browser/database,
// synthetic provider only. Key presses drive the UI; eval reads state or dispatches the noted synthetic events.
const run = promisify(execFile), session = `vim-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const press = key => b('press', key);
const pause = () => new Promise(r => setTimeout(r, 300));
const view = () => ev('document.querySelector(".react-flow__viewport").style.transform');
const box = id => ev(`document.querySelector('.react-flow__node[data-id="${id}"]').style.transform`);
const zoom = async () => Number((await view()).match(/scale\(([\d.]+)\)/)[1]);
const checkbox = `document.querySelector('input[type=checkbox]')`;
const openTree = title => wait(`(() => { const e = [...document.querySelectorAll('nav button')].find(e => e.textContent === ${JSON.stringify(title)}); e?.click(); return e; })()`);
const log = [];
const step = text => { log.push(text); console.log(`ok - ${text}`); };
async function tabTo(test, max = 80) {
  for (let i = 0; i < max; i++) { if (await ev(`(() => { const e = document.activeElement; return !!e && !!(${test}); })()`)) return; await press('Tab'); }
  assert.fail(`Not reachable by Tab: ${test}`);
}
// Press a key and report whether the viewport or the box changed.
async function effect(key, id) {
  const before = [await view(), id && await box(id)];
  await press(key); await pause();
  const after = [await view(), id && await box(id)];
  return before[0] !== after[0] || before[1] !== after[1];
}
// Synthetic keydown on the focused element: returns whether the app consumed it.
const synthetic = init => ev(`(() => { const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...${JSON.stringify(init)} }); if (${JSON.stringify(init)}.legacyIme) Object.defineProperty(e, 'keyCode', { value: 229 }); document.activeElement.dispatchEvent(e); return e.defaultPrevented; })()`);

const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-vim-')), 'trees.sqlite'));
store.message(store.create('Other saved tree').id, 'user', 'Earlier question', 'completed');
const root = store.create('Vim canvas');
store.message(root.id, 'user', 'How do roots trade?', 'completed');
const source = store.message(root.id, 'assistant', 'Roots and fungi exchange nutrients.', 'completed');
const child = store.branch(root, { messageId: source, start: 0, end: 5, text: 'Roots', question: 'Why roots?' }, 'Fixture context');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { async generate(tree, prompt, emit) { emit({ type: 'item', item: 'reply', text: 'Fixture reply' }); emit({ type: 'status', status: 'completed' }); } } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const node = `.react-flow__node[data-id="${child.id}"]`;
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await b('eval', 'localStorage.clear(); true');
  await b('reload');
  await openTree('Vim canvas');
  await wait(`document.querySelectorAll('.react-flow__node').length === 2 && document.querySelector('${node}').style.transform`);
  await pause();

  // 1. Default off: letters do nothing on the map or a box; standard arrows still work.
  assert.equal(await ev(`${checkbox}.checked`), false);
  await b('focus', '.tree-canvas');
  for (const key of ['l', 'Shift+J', 'f', '=', '-']) assert.equal(await effect(key), false, `off: ${key} on map`);
  assert.equal(await effect('ArrowRight'), true);
  await b('focus', node);
  assert.equal(await effect('j', child.id), false);
  assert.equal(await effect('ArrowDown', child.id), true);
  step('Default off with no saved preference: h/j/k/l/=/-/f do nothing on map or box; arrows pan/move');

  // 2. Help describes the mapping and current state; the checkbox is reachable by Tab and toggles with Space.
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Help', '--exact');
  await wait(`document.querySelector('#tree-navigation').textContent.includes('Vim canvas bindings are off')`);
  await b('focus', '#tree-navigation button');
  await tabTo(`e.type === 'checkbox'`);
  assert.equal(await ev(`getComputedStyle(document.activeElement).outlineStyle !== 'none' || document.activeElement.matches(':focus-visible')`), true);
  await press('Space');
  await wait(`${checkbox}.checked && document.activeElement === ${checkbox} && localStorage.getItem('treetutor.vim') === 'on'`);
  await wait(`document.querySelector('#tree-navigation').textContent.includes('Vim canvas bindings are on')`);
  step('Tab reaches the labelled "Vim canvas bindings" checkbox with visible focus; Space checks it, focus stays on it, Help reports on');

  // 3. Map region: each alias equals its standard action.
  await b('focus', '.tree-canvas');
  for (const [alias, inverse] of [['l', 'ArrowLeft'], ['h', 'ArrowRight'], ['j', 'ArrowUp'], ['k', 'ArrowDown'], ['Shift+L', 'Shift+ArrowLeft'], ['Shift+K', 'Shift+ArrowDown']]) {
    const before = await view();
    await press(alias); await pause();
    assert.notEqual(await view(), before, alias);
    await press(inverse); await pause();
    assert.equal(await view(), before, `${alias} undone by ${inverse}`);
  }
  const small = await view(); await press('l'); await pause();
  const dx = Number((await view()).match(/-?[\d.]+/)[0]) - Number(small.match(/-?[\d.]+/)[0]);
  await press('Shift+L'); await pause();
  const dx3 = Number((await view()).match(/-?[\d.]+/)[0]) - Number(small.match(/-?[\d.]+/)[0]) - dx;
  assert.deepEqual([dx, dx3], [-100, -300]);
  const z = await zoom(); await press('='); await pause(); const z1 = await zoom(); await press('+'); await pause(); const z2 = await zoom();
  await press('-'); await pause(); const z3 = await zoom();
  assert.ok(z1 > z && z2 > z1 && z3 < z2, `zoom ${z} ${z1} ${z2} ${z3}`);
  await press('f'); await pause(); await pause(); const fitted = await view();
  await press('l'); await pause();
  await b('find', 'role', 'button', 'click', '--name', 'Fit tree', '--exact'); await pause(); await pause();
  assert.equal(await view(), fitted, 'f matches Fit tree');
  step('Map region: h/j/k/l and Shift pan exactly like arrows (100 / 300 px), =/+ zoom in, - zooms out, f equals Fit tree');

  // 4. Box wrapper: aliases move the box like arrows and announce it; = - f use the toolbar actions.
  await b('focus', node);
  const p0 = await box(child.id);
  await press('l'); await pause(); await press('Shift+J'); await pause();
  await wait(`[...document.querySelectorAll('[aria-live=polite]')].some(e => e.textContent.includes('Why roots? moved'))`);
  await press('ArrowLeft'); await pause(); await press('Shift+ArrowUp'); await pause();
  assert.equal(await box(child.id), p0, 'l / Shift+J undone by ArrowLeft / Shift+ArrowUp');
  const p1 = (await box(child.id)).match(/-?[\d.]+/g).map(Number);
  await press('k'); await pause();
  assert.deepEqual((await box(child.id)).match(/-?[\d.]+/g).map(Number), [p1[0], p1[1] - 10]);
  await press('j'); await pause();
  const zb = await zoom(); await press('-'); await pause(); assert.ok(await zoom() < zb); await press('f'); await pause();
  assert.equal(await ev(`document.activeElement === document.querySelector('${node}')`), true);
  step('Box wrapper: h/j/k/l move 10 units, Shift 100, with the existing announcement; -/f zoom/fit; focus stays on the box');

  // 5. Out-of-scope keys and contexts keep their normal behavior.
  await b('focus', '.tree-canvas');
  for (const key of ['Shift+F', 'Shift+Minus', 'g', 'a']) assert.equal(await effect(key), false, `no alias for ${key}`);
  for (const init of [{ key: 'f', ctrlKey: true }, { key: 'l', metaKey: true }, { key: 'l', altKey: true }, { key: 'l', isComposing: true }, { key: 'l', legacyIme: true }]) assert.equal(await synthetic(init), false, JSON.stringify(init));
  await pause(); assert.equal(await effect('Escape'), false);
  await b('focus', `#open-${child.id}`);
  assert.equal(await effect('l', child.id), false, 'title button keeps its keys');
  await b('focus', '.map-toolbar button');
  assert.equal(await effect('f'), false, 'toolbar control keeps its keys');
  // Menu open: aliases are suspended even when the map is the event target.
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await wait(`document.querySelector('[aria-label="Map menu"][aria-expanded=true]')`);
  const menuView = await view();
  assert.equal(await ev(`(() => { const e = new KeyboardEvent('keydown', { key: 'l', bubbles: true, cancelable: true }); document.querySelector('.tree-canvas').dispatchEvent(e); return e.defaultPrevented; })()`), false);
  assert.equal(await view(), menuView);
  await press('Escape');
  await wait(`!document.querySelector('[aria-haspopup][aria-expanded=true]')`);
  step('Shift+F, _, other letters, Ctrl/Meta/Alt combinations, IME composition (incl. keyCode 229) and Escape are not aliased; title/toolbar controls and an open menu suspend aliases');

  // 6. Composer and read-only passage text keep every letter; returning to the map restores focus.
  await b('focus', `#open-${root.id}`); await press('Enter');
  await wait(`document.activeElement?.closest('.focused-chat [role=textbox]')`);
  const chatView = await view();
  await b('keyboard', 'type', 'hjkl HJKL =+-f');
  assert.ok((await ev(`document.querySelector('.focused-chat [role=textbox]').textContent`)).includes('hjkl HJKL =+-f'));
  await press('Control+a'); await press('Backspace');
  await ev(`[...document.querySelectorAll('.focus-reveal')].find(e => e.textContent.includes('Select passage in tutor reply 1')).focus()`); await press('Enter');
  await wait(`document.activeElement?.tagName === 'TEXTAREA'`);
  for (const key of ['h', 'j', 'f', '=']) await press(key);
  assert.equal(await view(), chatView);
  await press('Escape'); await pause();
  await press('Escape');
  await wait(`document.activeElement?.id === 'open-${root.id}'`);
  step('Composer receives typed h/j/k/l/H/J/K/L/=/+/-/f; read-only passage text keeps letters; the map never moves; Escape returns focus to the opening box title');

  // 7. Preference survives reload and tree switches; turning it off restores standard controls alone.
  await b('reload');
  await wait(`document.querySelector('input[type=checkbox]')?.checked === true`);
  await openTree('Other saved tree');
  await wait(`document.querySelectorAll('.react-flow__node').length === 1`);
  assert.equal(await ev(`${checkbox}.checked`), true);
  await openTree('Vim canvas');
  await wait(`document.querySelectorAll('.react-flow__node').length === 2`); await pause();
  await b('focus', '.tree-canvas');
  assert.equal(await effect('l'), true);
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await b('focus', '#tree-navigation button'); await tabTo(`e.type === 'checkbox'`); await press('Space');
  await wait(`!${checkbox}.checked && localStorage.getItem('treetutor.vim') === 'off'`);
  await b('focus', '.tree-canvas');
  assert.equal(await effect('l'), false);
  assert.equal(await effect('ArrowRight'), true);
  await b('focus', node);
  assert.equal(await effect('j', child.id), false);
  assert.equal(await effect('Shift+ArrowDown', child.id), true);
  await press('Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Why roots?' && document.activeElement?.closest('.focused-chat [role=textbox]')`);
  await press('Escape');
  await wait(`document.activeElement?.closest('.overview')`);
  await b('eval', `localStorage.setItem('treetutor.vim', 'garbage'); true`); await b('reload');
  await wait(`document.querySelector('input[type=checkbox]')`);
  assert.equal(await ev(`${checkbox}.checked`), false);
  step('On persists across reload and tree switch; off immediately restores arrows/Enter/Escape alone; unreadable preference means off');
  console.log(JSON.stringify({ result: 'PASS', provider: 'synthetic fixture (no live provider)', steps: log }, null, 2));
} finally { await b('close').catch(() => {}); app.stop(); store.close(); }
