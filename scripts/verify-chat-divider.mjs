// Built-app browser fixture (in-process fake provider, not a live model) for the map/chat divider.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `chat-divider-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'chat-divider-')), 'data.sqlite'));
const root = store.create('Divider fixture');
store.message(root.id, 'user', 'What is a mutex?', 'completed');
store.message(root.id, 'assistant', 'A lock that guards shared state.', 'completed');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async () => {} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
const sep = `document.querySelector('.chat-divider')`;
const state = () => ev(`(() => { const d = ${sep}, c = document.querySelector('.focused-chat').getBoundingClientRect(), w = document.querySelector('.tree-workspace').getBoundingClientRect();
  return d && { now: +d.getAttribute('aria-valuenow'), min: +d.getAttribute('aria-valuemin'), max: +d.getAttribute('aria-valuemax'), text: d.getAttribute('aria-valuetext'), role: d.getAttribute('role'), tab: d.tabIndex, chatRem: c.width / 16, workRem: w.width / 16, stored: localStorage.getItem('treetutor.chat-width'), left: d.getBoundingClientRect().left + d.getBoundingClientRect().width / 2, mid: c.top + c.height / 2 }; })()`);
try {
  await b('set', 'viewport', '1600', '1000');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await ev(`localStorage.removeItem('treetutor.chat-width'); true`);
  await b('reload');
  await b('wait', '[aria-label="Open Divider fixture"]');
  await click('Open Divider fixture');
  await wait(sep);
  let s = await state();
  assert.equal(s.role, 'separator'); assert.equal(s.tab, 0);
  assert.equal(s.now, 35); assert.equal(s.min, 22); assert.equal(s.max, Math.round(s.workRem * 0.7));
  assert.ok(Math.abs(s.chatRem - 35) < 0.2, `default chat ${s.chatRem}rem`);
  steps.push(`default 35rem; separator tabindex 0, aria-valuemin 22, max ${s.max} (70% of ${s.workRem.toFixed(1)}rem), valuetext "${s.text}"`);

  await b('mouse', 'move', String(Math.round(s.left)), String(Math.round(s.mid)));
  await b('mouse', 'down');
  await b('mouse', 'move', String(Math.round(s.left) - 160), String(Math.round(s.mid)));
  await b('mouse', 'up');
  s = await state();
  assert.ok(Math.abs(s.now - 45) <= 1 && Math.abs(s.chatRem - s.now) < 1, `drag 160px left widens to ~45rem (${s.now}, ${s.chatRem})`);
  steps.push(`drag 160px left: chat ${s.chatRem.toFixed(1)}rem, valuenow ${s.now}`);
  await b('mouse', 'down'); await b('mouse', 'move', '10', String(Math.round(s.mid))); await b('mouse', 'up');
  s = await state();
  assert.equal(s.now, s.max, 'drag clamps at 70%');
  await b('mouse', 'move', String(Math.round(s.left)), String(Math.round(s.mid)));
  await b('mouse', 'down'); await b('mouse', 'move', '1590', String(Math.round(s.mid))); await b('mouse', 'up');
  s = await state();
  assert.equal(s.now, 22, 'drag clamps at 22rem');
  steps.push(`drag clamps at ${s.max}rem max and 22rem min`);

  await b('dblclick', '.chat-divider');
  s = await state();
  assert.equal(s.now, 35); steps.push('double-click resets to 35rem');

  await b('focus', '.chat-divider');
  await b('press', 'ArrowLeft'); await b('press', 'ArrowLeft'); await b('press', 'Shift+ArrowLeft');
  s = await state(); assert.equal(s.now, 41);
  await b('press', 'ArrowRight'); s = await state(); assert.equal(s.now, 40);
  await b('press', 'Home'); s = await state(); assert.equal(s.now, 22);
  await b('press', 'End'); s = await state(); assert.equal(s.now, s.max);
  await b('press', 'Home'); await b('press', 'Shift+ArrowLeft'); await b('press', 'Shift+ArrowLeft');
  s = await state(); assert.equal(s.now, 30); assert.equal(s.stored, '30');
  steps.push('keyboard: ArrowLeft +1, Shift+ArrowLeft +4, ArrowRight -1, Home 22, End max; stored "30"');

  await b('reload');
  await b('wait', '[aria-label="Open Divider fixture"]');
  if (!(await ev(`!!${sep}`))) await click('Open Divider fixture');
  await wait(sep);
  s = await state(); assert.equal(s.now, 30); assert.ok(Math.abs(s.chatRem - 30) < 0.2);
  steps.push('reload keeps 30rem');
  const shots = mkdtempSync(join(tmpdir(), 'chat-divider-shots-')), shot = join(shots, 'chat-divider.png');
  await b('focus', '.chat-divider');
  await b('screenshot', shot);

  await click('Expand chat');
  await wait(`!${sep} && document.querySelector('.focused-chat').getBoundingClientRect().width > document.querySelector('.tree-workspace').getBoundingClientRect().width - 2`);
  await click('Show map beside chat');
  await wait(sep);
  s = await state(); assert.equal(s.now, 30);
  steps.push('expanded mode: chat fills workspace, divider hidden; back beside keeps 30rem');
  await click('Return to tree');
  await wait(`!${sep} && getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  steps.push('map-only mode: chat and divider hidden');

  await b('set', 'viewport', '400', '800');
  await b('reload');
  await b('wait', '[aria-label="Open Divider fixture"]');
  if (!(await ev(`getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`))) await click('Open Divider fixture');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`);
  const mobile = await ev(`({ divider: !!${sep}, chat: document.querySelector('.focused-chat').getBoundingClientRect().width, view: innerWidth })`);
  assert.equal(mobile.divider, false); assert.ok(mobile.chat >= mobile.view - 1, `mobile chat full width ${mobile.chat}/${mobile.view}`);
  const mshot = join(shots, 'chat-divider-mobile.png');
  await b('screenshot', mshot);
  steps.push(`mobile: no divider, chat ${mobile.chat}px of ${mobile.view}px`);
  console.log(JSON.stringify({ pass: true, steps, screenshots: [shot, mshot] }, null, 2));
} catch (e) { console.error(steps); throw e; } finally { await b('close').catch(() => {}); app.stop(); store.close(); }
