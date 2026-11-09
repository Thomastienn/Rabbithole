import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Built app, isolated browser/database, deterministic provider only.
const exec = promisify(execFile);
const session = `treetutor-streaming-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const evaluate = async expression => JSON.parse(await browser('eval', expression, '--json')).data.result;
const wait = expression => browser('wait', '--fn', expression);
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-streaming-')), 'trees.sqlite'));
const other = store.create('Other tree'); store.message(other.id, 'user', 'Earlier question', 'completed');
const root = store.create('Concurrent branches');
const source = store.message(root.id, 'assistant', 'Roots exchange nutrients.', 'completed');
const anchor = { messageId: source, start: 0, end: 5, text: 'Roots' };
const a = store.branch(root, { ...anchor, question: 'Branch A' }, 'Fixed A context');
const b = store.branch(root, { ...anchor, question: 'Branch B' }, 'Fixed B context');
const turns = new Map();
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {
  generate: (tree, text, emit) => new Promise(resolve => {
    turns.set(tree.id, { emit, resolve });
    emit({ type: 'item', item: 'same-item', text: `Partial ${tree.title}` });
  }),
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const chatText = () => evaluate('document.querySelector(".focused-chat").innerText');
async function open(title) {
  await browser('wait', '--text', `Open ${title}`);
  await click(`Open ${title}`);
  await wait(`document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(title)} && !!document.querySelector('.focused-chat [role=textbox]')`);
}
async function send(title) {
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', `Question ${title}`);
  await click('Send');
  await browser('wait', '--text', `Partial ${title}`);
}
try {
  await browser('open', origin);
  await browser('set', 'media', 'light', 'reduced-motion');
  await browser('wait', '--text', 'Open Branch A');
  for (const tree of [a, b]) {
    await open(tree.title);
    await send(tree.title);
    await click('Return to tree');
  }
  assert.equal(app.active.size, 2);
  // Hold a navigation checkpoint, then advance both streams before delivering it.
  await evaluate(`window.nativeFetch=window.fetch; window.fetch=async(url,options)=>{const response=await window.nativeFetch(url,options); if(url==='/api/trees/${a.id}'&&!options&&!window.held){window.held=true;const snapshot=await response.text();await new Promise(resolve=>window.releaseRead=resolve);return new Response(snapshot,{status:200,headers:{'Content-Type':'application/json'}})}return response}; true`);
  await click('Open Branch A');
  await wait('!!window.releaseRead');
  for (const tree of [b, a]) turns.get(tree.id).emit({ type: 'item', item: 'same-item', text: `New checkpoint ${tree.title}` });
  // A later marker on the same stream proves the new checkpoint has reached the client.
  turns.get(a.id).emit({ type: 'delta', item: 'same-item', text: ' latest' });
  await evaluate('window.releaseRead(); true');
  await browser('wait', '--text', 'New checkpoint Branch A latest');
  assert.ok(!(await chatText()).includes('Branch B'));
  assert.equal((await chatText()).split('Question Branch A').length - 1, 1);
  await click('Other tree');
  await open(other.title);
  await send(other.title);
  assert.equal(app.active.size, 3);
  for (const tree of [a, other, b]) turns.get(tree.id).emit({ type: 'item', item: 'same-item', text: `Interleaved ${tree.title}` });
  await browser('wait', '--text', 'Interleaved Other tree');
  assert.ok(!(await chatText()).includes('Interleaved Branch'));
  await click(root.title);
  await open(b.title);
  await browser('wait', '--text', 'Interleaved Branch B');
  assert.ok(!(await chatText()).includes('Interleaved Branch A'));
  // Complete a turn while its earlier navigation read is still held.
  await click('Return to tree');
  await evaluate('window.held=false; window.releaseRead=undefined; true');
  await click('Open Branch A');
  await wait('!!window.releaseRead');
  for (const tree of [b, other, a]) {
    turns.get(tree.id).emit({ type: 'item', item: 'same-item', text: `Complete ${tree.title}` });
    turns.get(tree.id).emit({ type: 'status', status: 'completed' });
    turns.get(tree.id).resolve();
  }
  await wait("document.querySelector('.focused-chat')?.textContent.includes('Complete Branch A')");
  await evaluate('window.releaseRead(); true');
  await wait("document.querySelector('.focused-chat h2')?.textContent === 'Branch A' && !!document.querySelector('.focused-chat [role=textbox]')");
  await browser('wait', '--text', 'Complete Branch A');
  for (const tree of [a, b]) {
    await click('Return to tree');
    await open(tree.title);
    await browser('wait', '--text', `Complete ${tree.title}`);
    assert.equal((await chatText()).split(`Question ${tree.title}`).length - 1, 1);
    assert.equal(store.tree(tree.id).messages.length, 2);
  }
  await browser('reload');
  await browser('wait', '--text', 'Open Branch A');
  await open(a.title);
  await browser('wait', '--text', 'Complete Branch A');
  assert.equal((await chatText()).split('Question Branch A').length - 1, 1);
  assert.equal(app.active.size, 0);
  console.log('PASS: sibling streams, held stale navigation read, three concurrent conversations across trees, partial/final isolation, no duplicate users, reload.');
} finally {
  for (const turn of turns.values()) turn.resolve();
  await browser('close').catch(() => {});
  while (app.active.size) await new Promise(resolve => setTimeout(resolve, 20));
  app.stop(); store.close();
}
