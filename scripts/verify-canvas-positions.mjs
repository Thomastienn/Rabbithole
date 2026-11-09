import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Synthetic content only; no provider or account is contacted.
const exec = promisify(execFile);
const session = `treetutor-positions-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const evaluate = async expression => {
  const result = JSON.parse(await browser('eval', expression, '--json'));
  if (!result.success) throw new Error(JSON.stringify(result));
  return result.data.result;
};
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-positions-')), 'trees.sqlite'));
const root = store.create('Passage movement');
const text = ('🌲 repeated passage. ' + 'Long wrapped explanation about roots and fungi. '.repeat(3)).repeat(20);
const messageId = store.message(root.id, 'assistant', text, 'completed');
const start = text.lastIndexOf('🌲');
const child = store.branch(root, { messageId, start, end: text.length, text: text.slice(start), question: 'Second emoji passage' }, 'Synthetic context');
const sibling = store.branch(root, { messageId, start: 0, end: 19, text: text.slice(0, 19), question: 'First emoji passage' }, 'Synthetic context');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { async generate(tree, prompt, emit) { emit({type:'item',item:'summary',text:'Synthetic context'}); emit({type:'status',status:'completed'}); } } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const selector = `.react-flow__node[data-id="${child.id}"]`;
const position = () => { const t = store.tree(child.id); return { x: t.x, y: t.y }; };
const waitSaved = async (id, expected) => {
  for (let i = 0; i < 100; i++) {
    const t = store.tree(id);
    if (t.x === expected.x && t.y === expected.y) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Position was not saved: ' + JSON.stringify({ expected, actual: store.tree(id) }));
};
try {
  await browser('set', 'viewport', '1440', '900');
  await browser('open', origin);
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__edge").length === 2');
  await browser('wait', '--fn', `(async () => (await (await fetch('/api/state')).json()).trees.every(t => t.x !== null))()`);
  const boxes = await evaluate(`Array.from(document.querySelectorAll('.react-flow__node')).map(n => { const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'Initial boxes overlap');
  }
  const edgeGap = await evaluate(`(() => { const handle=document.querySelector('[data-source="${child.id}"] .react-flow__handle').getBoundingClientRect(); const path=document.querySelector('.react-flow__edge[data-id="${child.id}"] path'); const point=path.getPointAtLength(0); const p=new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM()); return Math.hypot(p.x-handle.x-handle.width/2,p.y-handle.y-handle.height/2); })()`);
  assert.ok(edgeGap < 5, 'Edge is detached from its passage handle: ' + edgeGap);
  const initial = position();
  const unchanged = store.tree(sibling.id);
  await browser('focus', selector);
  await browser('press', 'ArrowRight');
  await browser('press', 'Shift+ArrowDown');
  await waitSaved(child.id, { x: initial.x + 10, y: initial.y + 100 });
  assert.deepEqual([store.tree(sibling.id).x, store.tree(sibling.id).y], [unchanged.x, unchanged.y]);
  await browser('wait', '--text', 'Second emoji passage moved to');
  const beforeDrag = position();
  const center = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector + ' h3')}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await browser('mouse', 'move', String(Math.round(center.x)), String(Math.round(center.y)));
  await browser('mouse', 'down', 'left');
  await browser('mouse', 'move', String(Math.round(center.x + 65)), String(Math.round(center.y + 30)), '--duration', '250', '--steps', '12');
  await browser('mouse', 'up', 'left');
  await browser('wait', '--fn', `(async () => { const t=(await (await fetch('/api/state')).json()).trees.find(t=>t.id===${JSON.stringify(child.id)}); return t.x !== ${beforeDrag.x}; })()`);
  for (let i = 0; i < 100 && position().x === beforeDrag.x; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const moved = position();
  assert.notEqual(moved.x, beforeDrag.x);
  await click('Reveal source passage for Second emoji passage');
  await browser('wait', '--fn', 'document.activeElement?.tagName === "MARK"');
  assert.deepEqual(await evaluate(`(() => { const m=document.querySelector('mark'); return {text:m.textContent, prefix:m.previousSibling?.textContent.length, visible:m.getBoundingClientRect().top >= 0 && m.getBoundingClientRect().bottom <= innerHeight}; })()`), { text: text.slice(start), prefix: start, visible: true });
  await browser('find', 'role', 'textbox', 'click', '--name', 'Your question');
  await browser('press', 'ArrowLeft');
  assert.deepEqual(position(), moved);
  await click('Return to tree');
  // The collapsed panel is part of the saved layout; let it land before reloading.
  await browser('wait', '--fn', `(async () => (await (await fetch('/api/state')).json()).trees.find(t=>t.id===${JSON.stringify(root.id)}).layout?.panel === 'collapsed')()`);
  await browser('reload');
  await browser('wait', '--text', 'Open Second emoji passage');
  const reloaded = await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); const p=n.style.transform.match(/translate\\(([-.\\d]+)px, ([-.\\d]+)px\\)/); return {x:Number(p[1]),y:Number(p[2])}; })()`);
  assert.ok(Math.abs(reloaded.x - moved.x) < 0.01 && Math.abs(reloaded.y - moved.y) < 0.01);
  assert.deepEqual(position(), moved);
  assert.deepEqual(store.tree(child.id).branch, child.branch);
  await browser('set', 'viewport', '390', '844');
  await click('Fit tree');
  mkdirSync('.impeccable/review', { recursive: true });
  console.log(await browser('screenshot', resolve('.impeccable/review/canvas-mobile.png')));
  await click('Reveal source passage for Second emoji passage');
  await browser('wait', '--fn', 'document.activeElement?.tagName === "MARK"');
  assert.equal(await evaluate('document.querySelector("mark").previousSibling.textContent.length'), start);
  assert.equal(await evaluate('document.documentElement.scrollWidth === innerWidth'), true);
  await click('Return to tree');
  await browser('set', 'viewport', '1440', '900');
  await click('Fit tree');
  console.log(await browser('screenshot', resolve('.impeccable/review/canvas-desktop.png')));
  // Simulate a failed local write, then retry without losing the moved position.
  await evaluate(`window.realFetch = window.fetch; window.fetch = (url, options) => String(url).endsWith('/position') ? Promise.resolve(new Response(JSON.stringify({error:'Synthetic write failure'}), {status:500,headers:{'Content-Type':'application/json'}})) : window.realFetch(url, options); true`);
  await browser('focus', selector);
  await browser('press', 'ArrowRight');
  await browser('wait', '--text', 'Box position not saved');
  assert.deepEqual(position(), moved);
  await evaluate('window.fetch = window.realFetch; true');
  await click('Retry saving positions');
  await waitSaved(child.id, { x: moved.x + 10, y: moved.y });
  const beforeNew = store.list().map(t => [t.id, t.x, t.y]);
  await evaluate(`(async () => { const {csrf}=await (await fetch('/api/state')).json(); const response=await fetch('/api/trees/${root.id}/branches', {method:'POST',headers:{'Content-Type':'application/json','X-TreeTutor-CSRF':csrf},body:JSON.stringify(${JSON.stringify({ messageId, start: 0, end: 19, text: text.slice(0, 19), question: 'New child after movement' })})}); if(!response.ok) throw new Error('Could not create new child'); return true; })()`);
  await browser('reload');
  await browser('wait', '--text', 'Open New child after movement');
  for (let i = 0; i < 100 && store.list().some(t => t.x === null); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(store.list().every(t => t.x !== null));
  for (const [id, x, y] of beforeNew) assert.deepEqual([store.tree(id).x, store.tree(id).y], [x, y]);
  const rects = await evaluate(`Array.from(document.querySelectorAll('.react-flow__node')).map(n => { const r=n.getBoundingClientRect(); return {id:n.dataset.id,x:r.x,y:r.y,width:r.width,height:r.height}; })`);
  const added = rects.find(r => !beforeNew.some(([id]) => id === r.id));
  for (const other of rects.filter(r => r !== added && r.id !== added.id)) assert.ok(added.x + added.width <= other.x || other.x + other.width <= added.x || added.y + added.height <= other.y || other.y + other.height <= added.y, 'New child overlaps existing box');
  // Deliberately stale canonical offsets must report failure, never select another occurrence.
  store.update(messageId, 'Replacement content', 'completed');
  await click('Reveal source passage for Second emoji passage');
  await browser('wait', '--text', 'Saved source passage is unavailable');
  assert.equal(await evaluate('document.querySelectorAll("mark").length'), 0);
  console.log('PASS: collision avoidance; pointer + Arrow/Shift+Arrow saves; sibling stability; movement announcement; reload; repeated/emoji/wrapped passage reveal after scroll/resize; chat arrows isolated; failed saves retry; new child avoids moved boxes; stale anchors rejected.');
} finally {
  await browser('close').catch(() => {});
  app.stop(); store.close();
}
