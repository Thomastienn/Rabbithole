import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const exec = promisify(execFile), session = `fold-${process.pid}`;
const b = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const ev = async s => JSON.parse(await b('eval', s, '--json')).data.result;
const wait = s => b('wait', '--fn', s);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
// Folding re-lays the canvas a frame later; click map boxes only once the viewport and nodes are still.
const settled = () => wait("new Promise(r => { const v = () => document.querySelector('.react-flow__viewport')?.innerHTML.length + document.querySelector('.react-flow__viewport')?.style.transform, a = v(); requestAnimationFrame(() => requestAnimationFrame(() => r(a === v()))); })");
const store = new Store(join(mkdtempSync(join(tmpdir(), 'fold-')), 'trees.sqlite'));
const root = store.create('Fold root');
const source = store.message(root.id, 'assistant', 'Root passage.', 'completed');
const child = store.branch(root, { messageId: source, start: 0, end: 4, text: 'Root', question: 'Fold child' }, 'Fixed context');
const childSource = store.message(child.id, 'assistant', 'Child passage.', 'completed');
const grand = store.branch(child, { messageId: childSource, start: 0, end: 5, text: 'Child', question: 'Fold grandchild' }, 'Fixed child context');
store.position(grand.id, 850, 350);
let turn;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {
  async generate(tree, text, emit) {
    if (text.startsWith('Compact only')) { emit({ type: 'item', item: 'summary', text: 'Fixture context' }); emit({ type: 'status', status: 'completed' }); return; }
    if (tree.id !== grand.id) { emit({ type: 'item', item: 'reply', text: 'Fixture response' }); emit({ type: 'status', status: 'completed' }); return; }
    await new Promise(resolve => { turn = { emit, resolve }; emit({ type: 'item', item: 'reply', text: 'Streaming fixture' }); });
  },
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const node = id => `.react-flow__node[data-id="${id}"]`;
try {
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await wait(`!!document.querySelector(${JSON.stringify(node(grand.id))})`);
  await click('Collapse descendants of Fold child');
  await wait(`!document.querySelector(${JSON.stringify(node(grand.id))}) && !!document.querySelector(${JSON.stringify(node(child.id))} + ' [aria-label="Show hidden branch Fold grandchild"]')`);
  await b('focus', `#fold-${root.id}`); await b('press', 'Enter');
  await wait(`!document.querySelector(${JSON.stringify(node(child.id))}) && !!document.querySelector(${JSON.stringify(node(root.id))} + ' [aria-label="Show hidden branch Fold child, 1 more conversation hidden beneath"]')`);
  assert.equal(await ev(`document.activeElement.id`), `fold-${root.id}`);
  assert.equal(await ev(`/\\d+ hidden branch/.test(document.querySelector('.react-flow__node').textContent)`), false, 'no hidden-branch text line');
  // The stub leaves from its child's passage row.
  assert.equal(await ev(`!!document.querySelector('.node-message [data-source="${child.id}"] .fold-stub')`), true);
  assert.equal(await ev(`document.querySelectorAll('.react-flow__edge').length`), 0);
  await click('Fit tree'); await settled();
  if (process.env.SCREENSHOT) await b('screenshot', process.env.SCREENSHOT);
  await click('Show hidden branch Fold child, 1 more conversation hidden beneath');
  await wait(`!!document.querySelector(${JSON.stringify(node(child.id))}) && !document.querySelector(${JSON.stringify(node(grand.id))})`);
  assert.equal(await ev(`document.activeElement.id`), `fold-${root.id}`, 'focus moves to the fold toggle');
  await b('focus', '[aria-label="Show hidden branch Fold grandchild"]'); await b('press', 'Space');
  await wait(`!!document.querySelector(${JSON.stringify(node(grand.id))}) && document.querySelectorAll('.react-flow__edge').length === 2`);
  assert.deepEqual([store.tree(grand.id).x, store.tree(grand.id).y], [850, 350]);
  assert.equal(await ev(`getComputedStyle(document.querySelector('.focused-chat')).display`), 'none');
  await click('Fit tree');
  await settled(); await click('Open Fold grandchild');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Fold grandchild' && !!document.querySelector('.focused-chat [role=textbox]')`);
  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Keep generating'); await click('Send');
  await b('wait', '--text', 'Streaming fixture'); await click('Return to tree'); await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`); await click('Fit tree');
  await b('focus', `#fold-${root.id}`); await b('press', 'Enter');
  assert.equal(app.active.has(grand.id), true);
  turn.emit({ type: 'item', item: 'reply', text: 'Finished while hidden' }); turn.emit({ type: 'status', status: 'completed' }); turn.resolve();
  await wait(`!!document.querySelector('[aria-label="Show hidden branch Fold child, 1 more conversation hidden beneath"]')`);
  await b('focus', `#fold-${root.id}`); await b('press', 'Enter');
  await wait(`document.querySelector(${JSON.stringify(node(grand.id))})?.textContent.includes('Finished while hidden')`);
  // Create a child from a folded parent through the normal keyboard selection flow.
  await click('Collapse descendants of Fold child');
  await settled(); await click('Open Fold child'); await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Fold child' && !document.documentElement.matches(':active-view-transition')`); await b('eval', '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true'); await b('press', 'Enter');
  await b('press', 'Home'); for (let i = 0; i < 5; i++) await b('press', 'Shift+ArrowRight');
  await b('press', 'Tab'); await b('press', 'Enter');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'New branch');
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create focused chat').focus()`); await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'New branch'`);
  const added = store.list().find(t => t.title === 'New branch');
  await wait(`!!document.querySelector(${JSON.stringify(node(grand.id))}) && !!document.querySelector(${JSON.stringify(node(added.id))})`);
  assert.deepEqual(store.tree(child.id).branch, child.branch);
  console.log('PASS: nested folds, hidden-branch stubs (click and Space), keyboard and focus, visible edges/fit, saved position, ongoing fixture turn, and new child path reveal.');
} catch (error) { console.error(await b('snapshot')); throw error; } finally { if (turn) turn.resolve(); await b('close').catch(() => {}); app.stop(); store.close(); }
