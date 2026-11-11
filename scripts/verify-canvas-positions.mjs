import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Synthetic content only; no provider or account is contacted.
const exec = promisify(execFile);
const session = `treetutor-positions-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') } })).stdout;
const evaluate = async expression => {
  const result = JSON.parse(await browser('eval', expression, '--json'));
  if (!result.success) throw new Error(JSON.stringify(result));
  return result.data.result;
};
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const returnToMap = async () => {
  await click('Return to tree');
  await browser('wait', '--fn', 'getComputedStyle(document.querySelector(".focused-chat")).display === "none" && !document.documentElement.matches(":active-view-transition")');
};
const dragBox = async (id, dx, dy) => {
  const at = await evaluate(`(() => { const r=document.querySelector('.react-flow__node[data-id="${id}"] .conversation-box').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.bottom-4}; })()`);
  await browser('mouse', 'move', String(Math.round(at.x)), String(Math.round(at.y)));
  await browser('mouse', 'down', 'left');
  await browser('mouse', 'move', String(Math.round(at.x + dx)), String(Math.round(at.y + dy)), '--duration', '250', '--steps', '12');
  await browser('mouse', 'up', 'left');
};
const path = join(mkdtempSync(join(tmpdir(), 'treetutor-positions-')), 'trees.sqlite');
let store = new Store(path);
const root = store.create('Passage movement');
const text = ('🌲 repeated passage. ' + 'Long wrapped explanation about roots and fungi. '.repeat(3)).repeat(20);
const replies = [];
for (let turn = 1; turn <= 5; turn++) {
  store.message(root.id, 'user', `Question ${turn}: explain forest ecology.`, 'completed');
  replies.push(store.message(root.id, 'assistant', turn === 2 ? text : `Reply ${turn}: ${'Roots and fungi share nutrients. '.repeat(8)}`, 'completed'));
}
const messageId = replies[1];
const start = text.lastIndexOf('🌲');
const child = store.branch(root, { messageId, start, end: text.length, text: text.slice(start), question: 'Second emoji passage' }, 'Synthetic context');
const sibling = store.branch(root, { messageId, start: 0, end: 19, text: text.slice(0, 19), question: 'First emoji passage' }, 'Synthetic context');
const later = store.branch(root, { messageId: replies[4], start: 0, end: 7, text: 'Reply 5', question: 'Later reply branch' }, 'Synthetic context');
const nestedSource = store.message(child.id, 'assistant', 'Nested source reply.', 'completed');
const grandchild = store.branch(child, { messageId: nestedSource, start: 0, end: 6, text: 'Nested', question: 'Grandchild branch' }, 'Synthetic context');
// Seed a stale saved relation: this message exists, but is absent from the parent's transcript.
const missing = store.branch(root, { messageId: nestedSource, start: 0, end: 6, text: 'Nested', question: 'Missing message branch' }, 'Synthetic context');
let releaseReply;
const makeApp = () => createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture', isDefault: true }], async generate(tree, prompt, emit) {
  if (prompt.startsWith('Compact "inheritedContext"')) emit({type:'item',item:'summary',text:'Synthetic context'});
  else {
    emit({type:'item',item:'reply',text:'Short streaming reply.'});
    await new Promise(resolve => { releaseReply = resolve; });
    emit({type:'item',item:'reply',text:'Growing streaming reply. '.repeat(20)});
    await new Promise(resolve => { releaseReply = resolve; });
  }
  emit({type:'status',status:'completed'});
} } });
let app = makeApp();
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const selector = `.react-flow__node[data-id="${child.id}"]`;
const measurements = [];
const measure = async (branch, parent, source) => evaluate(`(() => {
  const handle = document.querySelector('.react-flow__handle[data-source="${branch.id}"]');
  const node = document.querySelector('.react-flow__node[data-id="${parent.id}"]');
  const row = ${source ? `node.querySelector('[data-message="${source}"]')` : 'null'};
  const h = handle.getBoundingClientRect(), n = node.getBoundingClientRect(), r = row?.getBoundingClientRect();
  const box = document.querySelector('.react-flow__node[data-id="${branch.id}"]').getBoundingClientRect();
  const path = document.querySelector('.react-flow__edge[data-id="${branch.id}"] path');
  const p = path.getPointAtLength(0), start = new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM());
  const q = path.getPointAtLength(path.getTotalLength()), end = new DOMPoint(q.x,q.y).matrixTransform(path.getScreenCTM());
  const target = document.querySelector('.react-flow__node[data-id="${branch.id}"] .react-flow__handle-left').getBoundingClientRect();
  return { gap: Math.hypot(start.x-h.right,start.y-h.top-h.height/2), targetGap: Math.hypot(end.x-target.left,end.y-target.top-target.height/2), x: h.x+h.width/2, y: h.y+h.height/2, nodeRight: n.right, nodeMiddle: n.y+n.height/2, rowTop: r?.top, rowBottom: r?.bottom, childTop: box.top, childLeft: box.left, offset: (h.y+h.height/2-n.y)/(n.width/node.offsetWidth), label: path.closest('.react-flow__edge').getAttribute('aria-label') };
})()`);
const attached = async (stage) => {
  for (const [branch, parent, source] of [[child, root, messageId], [sibling, root, messageId], [later, root, replies[4]], [grandchild, child, nestedSource], [missing, root, null]]) {
    const m = await measure(branch, parent, source);
    assert.ok(m.gap < 1 && m.targetGap < 1, `${stage}: detached edge ${branch.title}: ${JSON.stringify(m)}`);
    assert.ok(Math.abs(m.x - m.nodeRight) < 2, `${stage}: handle off right edge`);
    if (source) assert.ok(m.y > m.rowTop && m.y < m.rowBottom, `${stage}: handle outside source row`);
    else assert.ok(Math.abs(m.y - m.nodeMiddle) < 1, `${stage}: missing-message fallback off midpoint`);
    assert.equal(m.label, `Passage “${branch.branch.text}” to ${branch.title}`);
    measurements.push({ stage, branch: branch.title, ...m });
  }
};
const position = () => { const t = store.tree(child.id); return { x: t.x, y: t.y }; };
const flush = async () => { await evaluate('__layoutMinute()'); await browser('wait', '--fn', 'window.__layoutInFlight === 0'); };
const waitSaved = async (id, expected) => {
  for (let i = 0; i < 100; i++) {
    await flush();
    const t = store.tree(id);
    if (t.x === expected.x && t.y === expected.y) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail('Position was not saved: ' + JSON.stringify({ expected, actual: store.tree(id) }));
};
try {
  await browser('set', 'viewport', '1440', '900');
  await browser('open', origin);
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__edge").length === 5 && document.querySelectorAll(".node-message").length === 11');
  await browser('wait', '--fn', 'window.__layoutTimers() === 1');
  assert.ok(store.list().every(t => t.x === null), 'initial placements wait for the batch');
  await flush();
  assert.ok(store.list().every(t => t.x !== null));
  assert.equal(await evaluate('window.__layoutPosts'), 1, 'all placed boxes saved in one layout write');
  const boxes = await evaluate(`Array.from(document.querySelectorAll('.react-flow__node')).map(n => { const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height} })`);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'Initial boxes overlap');
  }
  await attached('initial five-turn tree');
  const first = await measure(child, root, messageId), second = await measure(sibling, root, messageId), fifth = await measure(later, root, replies[4]);
  assert.ok(Math.abs(first.y - second.y) >= 3, 'Same-message branches must fan out');
  assert.ok(fifth.y > first.rowBottom, 'Different-message branch must leave a different row');
  assert.ok(first.childLeft > first.nodeRight && Math.abs(first.childTop - first.y) < 1, 'First child must start level with its source handle: ' + JSON.stringify(first));
  assert.equal(await evaluate('document.querySelectorAll(".passage-anchor").length'), 0, 'No bottom passage list');
  mkdirSync('.impeccable/review', { recursive: true });
  console.log(await browser('screenshot', resolve('.impeccable/review/message-row-initial-desktop.png')));
  const initial = position();
  const unchanged = store.tree(sibling.id);
  await browser('focus', selector);
  await browser('press', 'ArrowRight');
  await browser('press', 'Shift+ArrowDown');
  assert.equal(await evaluate('window.__layoutPosts'), 1, 'moves wait for the minute batch');
  await waitSaved(child.id, { x: initial.x + 10, y: initial.y + 100 });
  assert.deepEqual([store.tree(sibling.id).x, store.tree(sibling.id).y], [unchanged.x, unchanged.y]);
  await browser('wait', '--text', 'Second emoji passage moved to');
  const beforeDrag = position();
  await dragBox(child.id, 65, 30);
  for (let i = 0; i < 100 && position().x === beforeDrag.x; i++) { await flush(); await new Promise(resolve => setTimeout(resolve, 20)); }
  const moved = position();
  assert.notEqual(moved.x, beforeDrag.x);
  await attached('child pointer drag and keyboard move');
  const parentSelector = `.react-flow__node[data-id="${root.id}"]`;
  const parentBefore = store.tree(root.id);
  await browser('focus', parentSelector);
  await browser('press', 'ArrowLeft');
  await waitSaved(root.id, { x: parentBefore.x - 10, y: parentBefore.y });
  await attached('parent keyboard move');
  const parentAt = store.tree(root.id);
  await dragBox(root.id, -25, 20);
  for (let i = 0; i < 100 && store.tree(root.id).x === parentAt.x; i++) { await flush(); await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.notEqual(store.tree(root.id).x, parentAt.x);
  await attached('parent pointer drag');
  // Folding hides outgoing edges, while the incoming edge to a folded child remains attached.
  await browser('focus', `#fold-${child.id}`);
  await browser('press', 'Enter');
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__edge").length === 4');
  assert.ok((await measure(child, root, messageId)).targetGap < 1);
  await browser('press', 'Enter');
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__edge").length === 5');
  await attached('child fold and unfold');
  await browser('focus', `#fold-${root.id}`);
  await browser('press', 'Enter');
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__edge").length === 0');
  await browser('press', 'Enter');
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__edge").length === 5');
  await attached('parent fold and unfold');
  await click('Reveal source passage for Second emoji passage');
  await browser('wait', '--fn', 'document.activeElement?.tagName === "MARK"');
  // Markdown rendering drops the paragraph's trailing space from the highlighted text.
  assert.deepEqual(await evaluate(`(() => { const m=document.querySelector('mark'); return {text:m.textContent, prefix:m.previousSibling?.textContent.length, visible:m.getBoundingClientRect().top >= 0 && m.getBoundingClientRect().bottom <= innerHeight}; })()`), { text: text.slice(start).trimEnd(), prefix: start, visible: true });
  await browser('find', 'role', 'textbox', 'click', '--name', 'Your question');
  await browser('press', 'ArrowLeft');
  assert.deepEqual(position(), moved);
  await returnToMap();
  // The collapsed panel is part of the saved layout; let it land before reloading.
  for (let i = 0; i < 100 && store.list().find(t => t.id === root.id).layout?.panel !== 'collapsed'; i++) { await flush(); await new Promise(resolve => setTimeout(resolve, 20)); }
  await browser('reload');
  await browser('wait', '[aria-label="Open Second emoji passage"]');
  const reloaded = await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); const p=n.style.transform.match(/translate\\(([-.\\d]+)px, ([-.\\d]+)px\\)/); return {x:Number(p[1]),y:Number(p[2])}; })()`);
  assert.ok(Math.abs(reloaded.x - moved.x) < 0.01 && Math.abs(reloaded.y - moved.y) < 0.01);
  assert.deepEqual(position(), moved);
  assert.deepEqual(store.tree(child.id).branch, child.branch);
  await attached('browser reload');
  // Exercise actual streamed updates through the app's HTTP/SSE path, with a gated synthetic provider.
  await click('Open Passage movement');
  await browser('wait', '.focused-chat [aria-label="Your question"]');
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Grow the transcript');
  await click('Send');
  await browser('wait', '--fn', 'document.querySelector(".node-message[data-role=assistant]:last-child")?.textContent.includes("Short streaming reply")');
  await attached('new message and short stream');
  // Refetch a changed preceding row while active: the source row must move with its handles.
  const preceding = store.tree(root.id).messages.find(m => m.id === replies[0]);
  const beforeShift = await measure(child, root, messageId);
  store.update(preceding.id, 'Short preceding reply.', 'completed');
  await browser('wait', '--fn', `document.querySelector('[data-message="${preceding.id}"]')?.textContent.includes('Short preceding reply.')`);
  await attached('preceding row shrinks during active polling');
  assert.ok((await measure(child, root, messageId)).offset < beforeShift.offset, 'Handle follows a shifted source row');
  store.update(preceding.id, preceding.text, preceding.status);
  await browser('wait', '--fn', `document.querySelector('[data-message="${preceding.id}"]')?.textContent.includes('Reply 1:')`);
  await attached('preceding row restored during active polling');
  const shortFallback = await measure(missing, root, null);
  releaseReply();
  await browser('wait', '--fn', 'document.querySelector(".node-message[data-role=assistant]:last-child")?.textContent.includes("Growing streaming reply")');
  await attached('growing stream');
  assert.ok((await measure(missing, root, null)).offset > shortFallback.offset, 'Fallback follows height growth during streaming');
  releaseReply();
  await browser('wait', '--fn', '!document.querySelector(".focused-chat [aria-label=Stop]")');
  await attached('completed stream');
  await returnToMap();
  await flush();
  const savedTrees = store.list();
  const savedMessages = store.tree(root.id).messages;
  // Reopen SQLite and the HTTP app, not just the browser, then check restored handles and positions.
  const port = app.server.address().port;
  app.stop(); store.close();
  store = new Store(path);
  app = makeApp();
  await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
  await browser('reload');
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__edge").length === 5 && document.querySelectorAll(".node-message").length === 13');
  await attached('SQLite and HTTP app restart');
  assert.deepEqual(store.list(), savedTrees);
  assert.deepEqual(store.tree(root.id).messages, savedMessages);
  assert.deepEqual(store.tree(child.id).branch, child.branch);
  await browser('set', 'viewport', '390', '844');
  await click('Fit tree');
  mkdirSync('.impeccable/review', { recursive: true });
  console.log(await browser('screenshot', resolve('.impeccable/review/canvas-mobile.png')));
  await click('Reveal source passage for Second emoji passage');
  await browser('wait', '--fn', 'document.activeElement?.tagName === "MARK"');
  assert.equal(await evaluate('document.querySelector("mark").previousSibling.textContent.length'), start);
  assert.equal(await evaluate('document.documentElement.scrollWidth === innerWidth'), true);
  await returnToMap();
  await browser('set', 'viewport', '1440', '900');
  await click('Fit tree');
  console.log(await browser('screenshot', resolve('.impeccable/review/canvas-desktop.png')));
  await attached('desktop after mobile resize');
  // Simulate a failed local write, then retry without losing the moved position or looping.
  await evaluate(`window.realFetch = window.fetch; window.fetch = (url, options) => String(url).endsWith('/layout') ? Promise.resolve(new Response(JSON.stringify({error:'Synthetic write failure'}), {status:500,headers:{'Content-Type':'application/json'}})) : window.realFetch(url, options); true`);
  await browser('focus', selector);
  await browser('press', 'ArrowRight');
  await evaluate('__layoutMinute()');
  await browser('wait', '--text', 'Map layout not saved');
  assert.deepEqual(position(), moved);
  const failedPosts = await evaluate('window.__layoutPosts');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await evaluate('window.__layoutPosts'), failedPosts, 'failure waits for the next minute, no tight retry loop');
  assert.equal(await evaluate('__layoutTimers()'), 1, 'failed batch rescheduled once');
  await evaluate('window.fetch = window.realFetch; true');
  await click('Retry saving layout');
  await browser('wait', '--fn', '!document.body.textContent.includes("Map layout not saved")');
  await waitSaved(child.id, { x: moved.x + 10, y: moved.y });
  const beforeNew = store.list().map(t => [t.id, t.x, t.y]);
  await evaluate(`(async () => { const {csrf}=await (await fetch('/api/state')).json(); const response=await fetch('/api/trees/${root.id}/branches', {method:'POST',headers:{'Content-Type':'application/json','X-TreeTutor-CSRF':csrf},body:JSON.stringify(${JSON.stringify({ messageId, start: 0, end: 19, text: text.slice(0, 19), question: 'New child after movement' })})}); if(!response.ok) throw new Error('Could not create new child'); return true; })()`);
  await browser('reload');
  await browser('wait', '[aria-label="Open New child after movement"]');
  for (let i = 0; i < 100 && store.list().some(t => t.x === null); i++) { await flush(); await new Promise(resolve => setTimeout(resolve, 20)); }
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
  mkdirSync('docs/verification', { recursive: true });
  writeFileSync('docs/verification/message-row-branches-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence: 'Synthetic provider and seeded SQLite data; real built app, browser layout, HTTP/SSE, store and HTTP app restart. No native inference.', measurements }, null, 2) + '\n');
  console.log('PASS: five-turn source rows; distinct same-row fan-out; level child placement; grandchild; missing-message midpoint; edge endpoints after keyboard/pointer movement, folding, streaming, reload, SQLite/app restart and resize; exact repeated/emoji passage reveal; collision avoidance; retry; stale anchors rejected.');
} finally {
  await browser('close').catch(() => {});
  app.stop(); store.close();
}
