import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Built app, isolated browser/database, synthetic provider only.
const exec = promisify(execFile);
const session = `treetutor-navigation-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') } })).stdout;
const evaluate = async expression => JSON.parse(await browser('eval', expression, '--json')).data.result;
const wait = expression => browser('wait', '--fn', expression);
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const view = () => evaluate('document.querySelector(".react-flow__viewport").style.transform');
// Fire the controlled one-minute layout clock, then read the batched viewport from the database.
const flush = async () => { await evaluate('__layoutMinute()'); await wait('window.__layoutInFlight === 0'); };
async function savedView(accept) {
  for (let i = 0; i < 50; i++) { await flush(); const v = store.list().find(t => t.id === root.id).layout?.viewport; if (v && accept(v)) return v; await new Promise(r => setTimeout(r, 100)); }
  assert.fail('Viewport not saved: ' + JSON.stringify(store.list().find(t => t.id === root.id).layout) + ' shown ' + await view());
}
const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-navigation-')), 'trees.sqlite'));
store.message(store.create('Other saved tree').id, 'user', 'Earlier question', 'completed');
const root = store.create('Canvas navigation');
const source = store.message(root.id, 'assistant', 'Roots and fungi exchange nutrients.', 'completed');
const anchor = { messageId: source, start: 0, end: 5, text: 'Roots' };
const first = store.branch(root, { ...anchor, question: 'First branch' }, 'Fixture context');
const second = store.branch(root, { ...anchor, question: 'Second branch' }, 'Fixture context');
const releases = new Map();
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {
  async generate(tree, prompt, emit) {
    emit({ type: 'item', item: 'reply', text: `Partial ${tree.title}` });
    await new Promise(resolve => releases.set(tree.id, resolve));
    emit({ type: 'item', item: 'reply', text: `Complete ${tree.title}` });
    emit({ type: 'status', status: 'completed' });
  },
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
try {
  await browser('set', 'viewport', '1440', '900');
  await browser('open', origin);
  await wait('document.querySelectorAll(".react-flow__node").length === 3');
  // Observe actual shared-element animations, including their changing bounds.
  await evaluate(`window.transitions = []; window.nativeTransition = document.startViewTransition.bind(document); document.startViewTransition = callback => { const t = window.nativeTransition(callback); t.ready.then(() => window.transitions.push(document.getAnimations().filter(a => a.effect?.pseudoElement === '::view-transition-group(conversation)').map(a => a.effect.getKeyframes()))); return t; }; true`);
  const initial = await view();
  await browser('focus', '.tree-canvas');
  await browser('press', 'ArrowRight');
  assert.notEqual(await view(), initial);
  await browser('focus', '.tree-canvas');
  const beforeKeys = await view();
  await browser('press', 'ArrowDown');
  assert.notEqual(await view(), beforeKeys);
  const afterKeys = await view();
  await browser('press', 'Control+ArrowLeft');
  assert.equal(await view(), afterKeys);
  const beforeZoom = await savedView(() => true);
  await click('Zoom in');
  const zoomed = await savedView(v => v.zoom > beforeZoom.zoom);
  await click('Zoom out');
  const unzoomed = await savedView(v => v.zoom < zoomed.zoom);
  assert.ok(zoomed.zoom > unzoomed.zoom);
  await click('Fit tree');
  await browser('focus', '.tree-canvas');
  await browser('press', 'ArrowLeft');
  const saved = await view();
  const p = saved.match(/-?\d*\.?\d+/g).map(Number);
  const savedLayout = await savedView(v => Math.abs(v.x - p[0]) < 0.001 && Math.abs(v.y - p[1]) < 0.001 && Math.abs(v.zoom - p[2]) < 0.00001); // transform string rounds scale to 5 decimals
  // Browser-zoom wheel events must remain uncancelled and leave the canvas view alone.
  assert.equal(await evaluate(`document.querySelector('.react-flow__pane').dispatchEvent(new WheelEvent('wheel', {deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true}))`), true);
  assert.equal(await view(), saved);
  await click('Reveal source passage for First branch');
  await wait('document.activeElement?.tagName === "MARK"');
  assert.equal(await evaluate(`(() => {
    const chat = document.querySelector('.focused-chat').getBoundingClientRect();
    const workspace = document.querySelector('.tree-workspace').getBoundingClientRect();
    const overview = document.querySelector('.overview');
    const map = overview.getBoundingClientRect();
    return chat.width > 0 && chat.width < workspace.width && map.width > 0 && Math.abs(map.right - chat.left) < 1;
  })()`), true, 'Revealed source opens the chat side panel beside the map');
  await click('Return to tree');
  await wait(`document.activeElement?.id === 'reveal-${first.id}'`);
  assert.equal(await view(), saved);
  await wait('window.transitions.length === 2');
  assert.equal(await evaluate('window.transitions.every(groups => groups.some(frames => frames.length >= 2 && frames[0].width !== frames.at(-1).width))'), true);
  await click('Reveal source passage for First branch');
  await wait('document.activeElement?.tagName === "MARK"');
  await browser('press', 'Escape');
  await wait(`document.activeElement?.id === 'reveal-${first.id}'`);
  assert.equal(await view(), saved);
  await click('Map menu');
  await browser('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await click('Other saved tree');
  await browser('wait', '[aria-label="Open Other saved tree"]');
  await click('Map menu');
  await browser('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await click('Canvas navigation');
  await browser('wait', '[aria-label="Open First branch"]');
  assert.equal(await view(), saved);
  await browser('reload');
  await browser('wait', '[aria-label="Open First branch"]');
  assert.equal(await view(), saved);
  assert.deepEqual(store.list().find(t => t.id === root.id).layout.viewport, savedLayout, 'viewport restored from the batched layout');
  // Reduced motion bypasses View Transitions entirely.
  await browser('set', 'media', 'light', 'reduced-motion');
  assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
  await evaluate('window.transitionCalls = 0; const original=document.startViewTransition.bind(document); document.startViewTransition=callback=>{window.transitionCalls++;return original(callback)}; true');
  for (const branch of [first, second]) {
    await click(`Open ${branch.title}`);
    await wait(`document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(branch.title)} && !!document.querySelector('.focused-chat [role=textbox]')`);
    await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', `Explain ${branch.title}`);
    await click('Send');
    await browser('wait', '--text', `Partial ${branch.title}`);
    await click('Return to tree');
    await wait(`document.activeElement?.id === 'open-${branch.id}'`);
    assert.equal(await view(), saved);
  }
  assert.equal(app.active.size, 2);
  await click('Open Canvas navigation');
  await wait('document.querySelector(".focused-chat h2")?.textContent === "Canvas navigation" && !!document.querySelector(".focused-chat [role=textbox]")');
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Unsent draft');
  await browser('press', 'ArrowLeft');
  assert.equal(await view(), saved);
  // Wait for a background checkpoint refresh; it must not take focus or the draft.
  await evaluate('window.checkpointReads=0; window.checkpointFetch=window.fetch; window.fetch=(url,options)=>{if(url==="/api/state")window.checkpointReads++;return window.checkpointFetch(url,options)}; true');
  await wait('window.checkpointReads > 0');
  await wait(`(async()=>{ const s=await(await fetch('/api/state')).json(); return s.active.length===2 })()`);
  releases.get(first.id)(); releases.get(second.id)();
  await wait('!document.querySelector(".focused-chat [role=textbox]").hasAttribute("disabled")');
  await wait(`(async()=>!(await(await fetch('/api/state')).json()).active.length)()`);
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'), 'Your question');
  assert.equal(await evaluate('document.querySelector(".focused-chat [role=textbox]").textContent'), 'Unsent draft');
  for (const branch of [first, second]) {
    await click('Return to tree');
    await click(`Open ${branch.title}`);
    await browser('wait', '--text', `Complete ${branch.title}`);
    assert.equal(store.tree(branch.id).messages.filter(m => m.role === 'user').length, 1);
  }
  assert.equal(await evaluate('window.transitionCalls'), 0);
  await click('Return to tree');
  mkdirSync('.impeccable/review', { recursive: true });
  await browser('screenshot', resolve('.impeccable/review/navigation-desktop.png'));
  await browser('set', 'viewport', '390', '844');
  await click('Fit tree');
  assert.equal(await evaluate('document.documentElement.scrollWidth === innerWidth && document.querySelector(".tree-canvas").getBoundingClientRect().height > 0'), true);
  await browser('screenshot', resolve('.impeccable/review/navigation-mobile.png'));
  await click('Open Canvas navigation');
  await wait('document.querySelector(".focused-chat h2")?.textContent === "Canvas navigation" && !!document.querySelector(".focused-chat [role=textbox]")');
  assert.equal(await evaluate('document.querySelector(".focused-chat [role=textbox]").getBoundingClientRect().bottom <= innerHeight'), true);
  console.log('PASS: pan/zoom/fit; keyboard and browser zoom isolation; exact viewport and originating focus return; tree switch/reload; shared-element animation; reduced motion; two simultaneous replies without lost output/focus/draft; mobile controls/composer; viewport saved in the batched layout.');
} catch (error) {
  console.error(await browser('eval', 'JSON.stringify({active:document.activeElement?.id,hidden:document.querySelector(".overview").getAttribute("aria-hidden"), transitions:window.transitions})'));
  throw error;
} finally {
  for (const release of releases.values()) release();
  await browser('close').catch(() => {});
  while (app.active.size) await new Promise(resolve => setTimeout(resolve, 20));
  app.stop(); store.close();
}
