// Built-app fixture: real SQLite/HTTP and Chromium at 390px, synthetic provider. No native-provider claim.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), dir = mkdtempSync(join(tmpdir(), 'tt-narrow-')), session = `narrow-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20, env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') } })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`);
const store = new Store(join(dir, 'trees.sqlite'));
const root = store.create('How do fungi trade?');
store.model(root.id, 'fixture');
store.message(root.id, 'user', root.title, 'completed');
const text = 'Fungi trade sugar for phosphorus. A plant fixes carbon from air and light, but its roots touch only a thin sleeve of soil.\n\n```js\nconst exchange = { plant: "sugar", fungus: "phosphorus", note: "a deliberately long line of code that must scroll inside its own block" };\n```\n\n' + 'Roots and fungi exchange nutrients; both partners gain from the trade.\n\n'.repeat(6);
const reply = store.message(root.id, 'assistant', text, 'completed');
const branch = (parent, messageId, question) => store.branch(store.tree(parent.id), { messageId, start: 0, end: 5, text: 'Fungi', question }, 'Fixed context of the exchange.');
const first = branch(root, reply, 'Why trade at all?');
store.message(first.id, 'user', first.title, 'completed');
const firstReply = store.message(first.id, 'assistant', 'Neither partner can make what the other offers.', 'completed');
branch(first, firstReply, 'Could a plant go alone?');
branch(root, reply, 'What are hyphae?');
const diagram = store.pendingArtifact(root.id, reply, 'Trade loop', 'Sugar flows to the fungus; phosphorus flows to the root.');
store.finishArtifact(root.id, diagram.id, 'flowchart LR\n Root -->|sugar| Fungus');
const provider = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (_tree, _input, emit) => { emit({ type: 'item', item: 'answer', text: 'Fine.' }); emit({ type: 'status', status: 'completed' }); } };
const app = createApp({ store, dir, provider, auth: { status: () => ({ connected: true }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const steps = [], screenshots = [];
const check = (name, evidence) => { steps.push({ name, evidence }); console.log('PASS:', name); };
const shot = async name => { const path = `docs/verification/narrow-${name}.png`; await b('screenshot', path); screenshots.push(path); };
const drawerOpen = `document.querySelector('dialog.astryx-drawer[open]')`;
// Sideways scroll anywhere on screen; code blocks and the pannable map canvas scroll inside themselves by design.
const sideways = () => ev(`(() => {
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth) out.push('document ' + document.documentElement.scrollWidth);
  for (const e of document.querySelectorAll('body *')) {
    if (!e.checkVisibility() || e.closest('pre, .react-flow')) continue;
    const s = getComputedStyle(e).overflowX;
    if ((s === 'auto' || s === 'scroll') && e.scrollWidth > e.clientWidth + 1) out.push((e.className || e.tagName) + ' ' + e.scrollWidth + '>' + e.clientWidth);
    const r = e.getBoundingClientRect();
    if (r.width && r.right > innerWidth + 1 && !e.closest('[style*="overflow: hidden"], .astryx-drawer')) out.push('past edge: ' + (e.className || e.tagName));
  }
  return out;
})()`);
const contrast = selectors => ev(`(() => {
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = v => { c.clearRect(0,0,1,1); c.fillStyle=v; c.fillRect(0,0,1,1); return [...c.getImageData(0,0,1,1).data]; };
  const blend = (f,b) => f.slice(0,3).map((v,i) => v*f[3]/255+b[i]*(1-f[3]/255));
  const bg = e => { const chain=[]; for (;e;e=e.parentElement) chain.unshift(e); return chain.reduce((b,e) => blend(rgba(getComputedStyle(e).backgroundColor),b),[255,255,255]); };
  const L = rgb => rgb.map(v => { v/=255; return v<=.04045?v/12.92:((v+.055)/1.055)**2.4; }).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const ratio = (f,b) => (Math.max(L(f),L(b))+.05)/(Math.min(L(f),L(b))+.05);
  const text = ${JSON.stringify(selectors)}.map(sel => { const e = document.querySelector(sel), back = bg(e); return { sel, ratio: +ratio(blend(rgba(getComputedStyle(e).color), back), back).toFixed(2) }; });
  const f = document.activeElement, s = getComputedStyle(f);
  return { text, ring: { width: parseFloat(s.outlineWidth), style: s.outlineStyle, color: s.outlineColor, ratio: +ratio(rgba(s.outlineColor).slice(0,3), bg(f)).toFixed(2) }, paper: getComputedStyle(document.documentElement).getPropertyValue('--treetutor-paper').trim() };
})()`);
const label = () => ev(`document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent`);
// Accessible name is aria-label when present, else text: same rule the drawer list above uses.
const focusIn = name => ev(`(() => { const e = [...document.querySelectorAll('.astryx-drawer button')].find(e => (e.getAttribute('aria-label') || e.textContent) === ${JSON.stringify(name)}); e.focus(); return document.activeElement === e; })()`).then(ok => assert.ok(ok, name));
async function openDrawer() {
  await b('focus', '.band-contents'); await b('press', 'Enter');
  await wait(drawerOpen); await wait(`document.activeElement?.closest('.astryx-drawer')`);
}
async function choose(name) {
  await openDrawer();
  await focusIn(name); await b('press', 'Enter');
  await wait(`!${drawerOpen}`);
}
try {
  await b('set', 'viewport', '390', '844');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await b('wait', '.band-contents');
  const band = await ev(`[...document.querySelectorAll('.shell-band button, .shell-band .band-mark')].map(e => e.getAttribute('aria-label') || e.textContent)`);
  assert.deepEqual(band, ['Contents', 'TreeTutor', 'Search learning trees', 'New chat']);
  assert.deepEqual(await sideways(), []);
  check('Band condensed to Contents, wordmark, Search and New chat; nothing scrolls sideways', band);

  await openDrawer();
  const drawer = await ev(`[...document.querySelectorAll('.astryx-drawer button')].map(e => e.getAttribute('aria-label') || e.textContent)`);
  for (const name of ['Read', 'Map', 'Library', 'Knowledge', 'Videos', '1 How do fungi trade?', '1.1 Why trade at all?', '1.1.1 Could a plant go alone?', '1.2 What are hyphae?', 'Fig 1 Trade loop', 'Settings']) assert.ok(drawer.includes(name), name);
  await b('press', 'Escape'); await wait(`!${drawerOpen}`);
  await wait(`document.activeElement?.classList.contains('band-contents')`);
  await openDrawer(); await b('find', 'role', 'button', 'click', '--name', 'Close', '--exact');
  await wait(`!${drawerOpen} && document.activeElement?.classList.contains('band-contents')`);
  check('Contents drawer opens by keyboard with views, outline, figures and Settings; Escape and Close return focus to the menu button', drawer);

  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', ${JSON.stringify(mode)}); location.reload()`);
    await b('wait', '.band-contents');
    await choose('Read');
    await wait(`document.querySelector('.focused-chat h2')?.textContent === 'How do fungi trade?'`);
    const read = await ev(`({ chat: Math.round(document.querySelector('.focused-chat').getBoundingClientRect().width), inlineContents: !!document.querySelector('main .contents'), map: document.querySelector('#learning-tree-map').checkVisibility(), send: document.querySelector('.focused-chat [aria-label=Send]').getBoundingClientRect().bottom <= innerHeight })`);
    assert.deepEqual(read, { chat: 390, inlineContents: false, map: false, send: true });
    assert.deepEqual(await sideways(), []);
    await b('focus', '.band-contents');
    const bandColors = await contrast(['.shell-band .band-mark']);
    await b('focus', '.focused-chat .crumbs strong ~ *, .focused-chat .stats-toggle');
    await shot(`read-${mode}`);
    await openDrawer();
    await focusIn('1.1 Why trade at all?'); await b('press', 'Shift+Tab'); await b('press', 'Tab');
    const drawerColors = await contrast(['.astryx-drawer h2', '.drawer-views .view-tab[aria-current]', '.drawer-views .view-tab:not([aria-current])', '.contents-head h2', '.contents-head .astryx-text', '.contents-label', '.contents-address', '.contents-name', '.contents-context .astryx-text', '.drawer-settings']);
    for (const item of [...bandColors.text, ...drawerColors.text]) assert.ok(item.ratio >= 4.5, `${mode} ${item.sel}: ${item.ratio}`);
    assert.ok(bandColors.ring.width >= 2 && bandColors.ring.ratio >= 3, JSON.stringify(bandColors.ring));
    assert.ok(drawerColors.ring.width >= 2 && drawerColors.ring.style === 'solid' && drawerColors.ring.ratio >= 3, JSON.stringify(drawerColors.ring));
    assert.ok(await ev(`document.activeElement.getBoundingClientRect().right <= document.querySelector('.astryx-drawer').getBoundingClientRect().right`));
    await shot(`contents-${mode}`);
    await b('press', 'Enter'); await wait(`!${drawerOpen} && document.querySelector('.focused-chat h2')?.textContent === 'Why trade at all?'`);
    await choose('Map');
    await wait(`document.querySelector('#learning-tree-map').checkVisibility() && !document.querySelector('.focused-chat').checkVisibility()`);
    assert.equal(await ev(`Math.round(document.querySelector('#learning-tree-map').getBoundingClientRect().width)`), 390);
    assert.deepEqual(await sideways(), []);
    await b('find', 'role', 'button', 'click', '--name', 'Fit tree', '--exact').catch(() => {});
    await shot(`map-${mode}`);
    check(`${mode}: Read single column (390px, composer reachable), drawer outline, Map full width; AA text, paper focus ring, no sideways scroll`, { read, bandColors, drawerColors });
  }

  const views = {};
  for (const [name, ready] of [['Library', `document.querySelector('.library-content h1')`], ['Knowledge', `document.querySelector('#return-to-learning')`], ['Videos', `document.querySelector('#return-from-videos')`]]) {
    await choose(name); await wait(ready);
    views[name] = await sideways(); assert.deepEqual(views[name], [], name);
    assert.equal(await ev(`[...document.querySelectorAll('.drawer-views .view-tab')].length`), 5);
  }
  await openDrawer(); await focusIn('Settings'); await b('press', 'Enter');
  await wait(`document.querySelector('.settings-shell')`);
  views.Settings = await sideways(); assert.deepEqual(views.Settings, []);
  await b('press', 'Escape'); await wait(`!document.querySelector('dialog[open] .settings-shell')`);
  await wait(`document.activeElement?.classList.contains('band-contents')`);
  check('Library, Knowledge, Videos and Settings reachable from the drawer with no sideways scroll; Settings returns focus to the menu button', views);

  // Map-layout failure alert keeps its place in the narrow band and still fits.
  await choose('Map');
  await ev(`window.realFetch = window.fetch; window.fetch = (url, options) => String(url).endsWith('/layout') ? Promise.resolve(new Response('{"error":"Synthetic write failure"}', { status: 500, headers: { 'Content-Type': 'application/json' } })) : window.realFetch(url, options); true`);
  await b('find', 'role', 'button', 'click', '--name', 'Zoom in', '--exact');
  await ev('__layoutMinute()');
  await wait(`document.querySelector('.shell-band .band-save')`);
  const save = await ev(`({ text: document.querySelector('.band-save').textContent, retry: !!document.querySelector('.band-save button'), right: document.querySelector('.band-save').getBoundingClientRect().right })`);
  assert.match(save.text, /Map layout not saved/); assert.ok(save.retry && save.right <= 390);
  assert.deepEqual(await sideways(), []);
  await shot('save-failed-light');
  check('Map layout failure alert and Retry stay in the narrow band without sideways scroll', save);

  writeFileSync('docs/verification/narrow-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence: 'Built app, SQLite/HTTP and Chromium at 390x844; synthetic provider; no native model call.', pass: true, steps, screenshots }, null, 2) + '\n');
} catch (error) { await b('screenshot', '/tmp/narrow-failure.png').catch(() => {}); throw error; }
finally { await b('close').catch(() => {}); await app.stop(); store.close(); }
