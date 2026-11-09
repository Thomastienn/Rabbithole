import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `first-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', expression);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const idle = "!document.documentElement.matches(':active-view-transition')";
const nodes = () => ev(`[...document.querySelectorAll('.react-flow__node')].map(n => n.dataset.id)`);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'first-')), 'data.sqlite'));
const saved = store.create('Saved tree');
store.message(saved.id, 'user', 'Saved question', 'completed');
store.message(saved.id, 'assistant', 'Saved answer passage.', 'completed');
const savedMessages = store.tree(saved.id).messages;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { generate: async (_tree, text, emit) => { emit({ type: 'item', item: 'one', text: `Fixture response ${text.length}` }); emit({ type: 'status', status: 'completed' }); } } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Saved tree"]');
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await b('find', 'role', 'textbox', 'fill', '--name', 'New tree name', 'Leaves');
  await click('Create tree');

  // Empty start: no node, chat panel closed, Start conversation focused.
  await wait(`document.activeElement?.textContent.trim() === 'Start conversation'`);
  const fresh = store.list().find(t => t.title === 'Leaves');
  assert.deepEqual(await nodes(), []);
  assert.equal(await ev(`getComputedStyle(document.querySelector('.focused-chat')).display`), 'none');

  // Opening and closing the starter panel creates no node or message.
  await click('Start conversation');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Leaves' && document.activeElement?.closest('.focused-chat [role=textbox]') !== null && ${idle}`);
  assert.deepEqual(await nodes(), []);
  await click('Return to tree');
  await wait(`document.activeElement?.textContent.trim() === 'Start conversation'`);
  assert.deepEqual(await nodes(), []);
  await click('Start conversation');
  await wait(`document.activeElement?.closest('.focused-chat [role=textbox]') !== null && ${idle}`);

  // A failed submission keeps the draft and saves nothing.
  await ev(`window.nativeFetch = window.fetch; window.fetch = (url, options) => { if (String(url).endsWith('/messages') && !window.failed) { window.failed = true; return Promise.reject(new Error('Synthetic network failure')); } return window.nativeFetch(url, options); }; true`);
  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Why are leaves green?');
  await b('press', 'Enter');
  await b('wait', '--text', 'Synthetic network failure');
  await wait(`!document.querySelector('.focused-chat [aria-label=Stop]')`);
  assert.equal(await ev(`document.querySelector('.focused-chat [aria-label="Your question"]').textContent`), 'Why are leaves green?');
  assert.deepEqual(await nodes(), []);
  assert.equal(store.tree(fresh.id).messages.length, 0);

  // Retry: the persisted question creates exactly one root node.
  await b('find', 'role', 'textbox', 'click', '--name', 'Your question');
  await b('press', 'Enter');
  await b('wait', '--text', 'Fixture response 21');
  await wait(`!!document.querySelector('[data-id="${fresh.id}"]')`);
  assert.deepEqual(await nodes(), [fresh.id]);
  assert.equal(store.list().filter(t => !t.parent).length, 2);
  assert.deepEqual(store.tree(fresh.id).messages.map(m => [m.role, m.text, m.status]), [['user', 'Why are leaves green?', 'completed'], ['assistant', 'Fixture response 21', 'completed']]);

  // A child created from the first answer stays visible and opens in the panel.
  await b('eval', '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true'); await b('press', 'Enter');
  await wait(`document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value === 'Fixture response 21'`);
  await b('press', 'Home');
  for (let i = 0; i < 7; i++) await b('press', 'Shift+ArrowRight');
  await b('press', 'Tab'); await b('press', 'Enter');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Child question');
  await click('Create focused chat');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Child question'`);
  const child = store.list().find(t => t.parent === fresh.id);
  await wait(`!!document.querySelector('[data-id="${child.id}"]') && !!document.querySelector('[data-id="${fresh.id}"]')`);
  assert.deepEqual(store.tree(child.id).branch && [store.tree(child.id).branch.start, store.tree(child.id).branch.end, store.tree(child.id).branch.text], [0, 7, 'Fixture']);
  await click('Return to parent conversation');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Leaves' && ${idle}`);
  await click('Open Child question');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Child question'`);

  // The existing saved tree still opens with its messages.
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await click('Saved tree');
  await b('wait', '[aria-label="Open Saved tree"]');
  assert.deepEqual(await nodes(), [saved.id]);
  assert.deepEqual(store.tree(saved.id).messages, savedMessages);
  assert.equal(store.list().filter(t => !t.parent).length, 2);
  console.log('PASS: empty map start, starter panel close/reopen without node, failed send keeps draft and saves nothing, retry creates exactly one root, child visible and opens, saved tree unchanged.');
} finally { await b('close').catch(() => {}); app.stop(); store.close(); }
