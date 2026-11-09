import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Synthetic local fixture; no provider or account is contacted.
const exec = promisify(execFile);
const session = `treetutor-gestures-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') } })).stdout;
const evaluate = async expression => JSON.parse(await browser('eval', expression, '--json')).data.result;
const wait = expression => browser('wait', '--fn', expression);
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-gestures-')), 'trees.sqlite'));
const root = store.create('Gesture root');
const messageId = store.message(root.id, 'assistant', 'Roots share nutrients.', 'completed');
const child = store.branch(root, { messageId, start: 0, end: 5, text: 'Roots', question: 'Gesture branch' }, 'Synthetic context');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const childNode = `.react-flow__node[data-id="${child.id}"]`;
const viewport = () => evaluate(`(() => { const m = getComputedStyle(document.querySelector('.react-flow__viewport')).transform; const p = new DOMMatrix(m); return {x:p.e,y:p.f,z:p.a}; })()`);
const center = selector => evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
const move = p => browser('mouse', 'move', String(p.x), String(p.y));
try {
  await browser('set', 'viewport', '1440', '900');
  await browser('open', `http://127.0.0.1:${app.server.address().port}`);
  await wait(`document.querySelectorAll('.react-flow__edge').length === 1`);
  await wait(`document.querySelector(${JSON.stringify(childNode)}).getBoundingClientRect().width > 0`);
  const pane = await evaluate(`(() => { const r=document.querySelector('.react-flow__pane').getBoundingClientRect(); return {x:Math.round(r.left+80),y:Math.round(r.top+80),left:r.left,top:r.top}; })()`);
  await click('Map menu');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.focused-chat')).display`), 'none');
  await browser('press', 'Escape');
  const before = await viewport();
  await move(pane);
  await browser('mouse', 'wheel', '120');
  await wait(`new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a < ${before.z}`);
  const after = await viewport();
  assert.ok(Math.abs((pane.x-pane.left-before.x)/before.z - (pane.x-pane.left-after.x)/after.z) < 1);
  assert.ok(Math.abs((pane.y-pane.top-before.y)/before.z - (pane.y-pane.top-after.y)/after.z) < 1);
  assert.equal(await evaluate(`document.querySelector('.react-flow__pane').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true}))`), true);
  const beforePan = await viewport();
  await move(pane); await browser('mouse', 'down', 'left');
  await move({x:pane.x+60,y:pane.y+35}); await browser('mouse', 'up', 'left');
  const afterPan = await viewport();
  assert.ok(Math.abs(afterPan.x-beforePan.x) > 30 && Math.abs(afterPan.y-beforePan.y) > 15);
  await click('Fit tree');
  await wait(`document.querySelector(${JSON.stringify(childNode + ' h3')}).getBoundingClientRect().width > 0`);
  const beforePosition = store.tree(child.id);
  const p = await center(childNode + ' .conversation-box'); p.y = await evaluate(`document.querySelector(${JSON.stringify(childNode + ' .conversation-box')}).getBoundingClientRect().bottom - 5`).then(Math.round); // title is a click target (nodrag); drag from the box's bottom padding
  await move(p); await browser('mouse', 'down', 'left');
  await browser('mouse', 'move', String(p.x+60), String(p.y+30), '--duration', '200', '--steps', '10');
  await browser('mouse', 'up', 'left');
  await wait(`document.body.innerText.includes('Gesture branch moved to')`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.focused-chat')).display`), 'none');
  await evaluate('__layoutMinute()'); await wait('window.__layoutInFlight === 0'); // controlled one-minute layout batch
  assert.notEqual(store.tree(child.id).x, beforePosition.x);
  assert.deepEqual(store.tree(child.id).branch, child.branch);
  assert.equal(await evaluate(`document.querySelector('.react-flow__edge').dataset.id`), child.id);
  const gap = await evaluate(`(() => { const h=document.querySelector('[data-source="${child.id}"] .react-flow__handle').getBoundingClientRect(); const path=document.querySelector('.react-flow__edge path'); const p=path.getPointAtLength(0); const q=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM()); return Math.hypot(q.x-h.x-h.width/2,q.y-h.y-h.height/2); })()`);
  assert.ok(gap < 5, `Edge detached from source: ${gap}`);
  await browser('click', childNode + ' h3');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Gesture branch' && getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`);
  await click('Return to tree');
  await browser('focus', `#open-${root.id}`); await browser('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Gesture root' && getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`);
  await click('Return to tree');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  await click('Reveal source passage for Gesture branch');
  await wait(`document.activeElement?.tagName === 'MARK'`);
  assert.equal(await evaluate(`document.querySelector('mark').textContent`), 'Roots');
  console.log('PASS: cursor-anchored wheel zoom, Ctrl-wheel isolation, background pan, menu isolation, drag without opening, edge/source association, body click, keyboard open and exact source reveal (synthetic fixture).');
} finally {
  await browser('close').catch(() => {});
  app.stop(); store.close();
}
