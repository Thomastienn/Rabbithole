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
  await click('New chat');

  // New chat: one root box titled New chat, its chat open beside the map, composer focused.
  const opened = `document.querySelector('.focused-chat h2')?.textContent === 'New chat' && document.activeElement?.closest('.focused-chat [role=textbox]') !== null && ${idle}`;
  await wait(opened);
  const fresh = store.list().find(t => t.title === 'New chat');
  await wait(`!!document.querySelector('[data-id="${fresh.id}"]')`);
  assert.deepEqual(await nodes(), [fresh.id]);
  assert.equal(await ev(`document.querySelector('[data-id="${fresh.id}"] h3').textContent`), 'New chat');
  assert.notEqual(await ev(`getComputedStyle(document.querySelector('.focused-chat')).display`), 'none');

  // Closing and reopening the unstarted chat keeps the same box and saves no message.
  await click('Return to tree');
  await wait(`document.activeElement?.id === 'open-${fresh.id}' && ${idle}`);
  assert.deepEqual(await nodes(), [fresh.id]);
  await b('press', 'Enter');
  await wait(opened);

  // New chat while an unstarted chat exists reopens it instead of creating another.
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await click('New chat');
  await wait(opened);
  assert.equal(store.list().filter(t => !t.parent).length, 2);

  // A root with no messages restores after reload as the same box.
  await b('reload');
  await wait(`!!document.querySelector('[data-id="${fresh.id}"]')`);
  assert.deepEqual(await nodes(), [fresh.id]);
  assert.equal(store.tree(fresh.id).messages.length, 0);
  if (await ev(`getComputedStyle(document.querySelector('.focused-chat')).display`) === 'none') await click('Open New chat');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'New chat' && ${idle}`);
  await b('find', 'role', 'textbox', 'click', '--name', 'Your question');

  // A failed submission keeps the draft and saves nothing.
  await ev(`window.nativeFetch = window.fetch; window.fetch = (url, options) => { if (String(url).endsWith('/messages') && !window.failed) { window.failed = true; return Promise.reject(new Error('Synthetic network failure')); } return window.nativeFetch(url, options); }; true`);
  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Why are leaves green?');
  await b('press', 'Enter');
  await b('wait', '--text', 'Synthetic network failure');
  await wait(`!document.querySelector('.focused-chat [aria-label=Stop]')`);
  assert.equal(await ev(`document.querySelector('.focused-chat [aria-label="Your question"]').textContent`), 'Why are leaves green?');
  assert.deepEqual(await nodes(), [fresh.id]);
  assert.equal(store.tree(fresh.id).messages.length, 0);
  assert.equal(store.tree(fresh.id).title, 'New chat');

  // Retry: the saved question titles the root in the header, map box and sidebar without a reload.
  await b('find', 'role', 'textbox', 'click', '--name', 'Your question');
  await b('press', 'Enter');
  await b('wait', '--text', 'Fixture response 21');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Why are leaves green?' && document.querySelector('[data-id="${fresh.id}"] h3')?.textContent === 'Why are leaves green?' && [...document.querySelectorAll('#tree-navigation nav button')].some(e => e.textContent === 'Why are leaves green?')`);
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
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Why are leaves green?' && ${idle}`);
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
  console.log('PASS: New chat shows one root box with chat open and composer focused, close/reopen and repeat New chat reuse it, reload restores it, failed send keeps draft and saves nothing, retry saves once and titles header, box and sidebar, child visible and opens, saved tree unchanged.');
} finally { await b('close').catch(() => {}); app.stop(); store.close(); }
