import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile),
  session = `first-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const openNavigation = () => b('click', '.tree-switcher');
const idle = "!document.documentElement.matches(':active-view-transition')";
const nodes = () =>
  ev(`[...document.querySelectorAll('.react-flow__node')].map(n => n.dataset.id)`);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'first-')), 'data.sqlite'));
const saved = store.create('Saved tree');
store.message(saved.id, 'user', 'Saved question', 'completed');
store.message(saved.id, 'assistant', 'Saved answer passage.', 'completed');
const savedMessages = store.tree(saved.id).messages;
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    models: async () => [
      { model: 'fixture', label: 'Fixture', isDefault: true, efforts: [] },
      { model: 'other', label: 'Other model', efforts: [] },
    ],
    model: async () => 'fixture',
    generate: async (_tree, text, emit) => {
      emit({ type: 'item', item: 'one', text: `Fixture response ${text.length}` });
      emit({ type: 'status', status: 'completed' });
    },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Saved tree"]');
  await openNavigation();
  await click('New chat');

  // New chat: a blank composer, focused; nothing is saved and no map box appears.
  const blank = `document.activeElement?.closest('.first-question [role=textbox]') !== null && ${idle}`;
  await wait(blank);
  assert.equal(store.list().length, 1, 'New chat saves nothing');
  assert.deepEqual(await nodes(), []);

  // Repeating New chat or reloading still saves nothing.
  await openNavigation();
  await click('New chat');
  await wait(blank);
  await b('reload');
  await b('wait', '[aria-label="Open Saved tree"]');
  assert.equal(store.list().length, 1);
  await openNavigation();
  await click('New chat');
  await wait(blank);

  // A failed first send keeps the draft and leaves no tree behind.
  await ev(
    `window.nativeFetch = window.fetch; window.fetch = (url, options) => { if (String(url).endsWith('/messages') && !window.failed) { window.failed = true; return Promise.reject(new Error('Synthetic network failure')); } return window.nativeFetch(url, options); }; true`,
  );
  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Why are leaves green?');
  await b('press', 'Enter');
  await b('wait', '--text', 'Synthetic network failure');
  await wait(
    `document.querySelector('.first-question [aria-label="Your question"]')?.textContent === 'Why are leaves green?' && !document.querySelector('.chat-header')`,
  );
  assert.equal(store.list().length, 1, 'the unsaved first send removed its tree');

  // The model picked before the first send is the new tree's model.
  await b('click', '.first-question .model-picker');
  await wait(
    `[...document.querySelectorAll('[role=menuitemradio]')].some(e => e.textContent.includes('Other model'))`,
  );
  await b('find', 'role', 'menuitemradio', 'click', '--name', 'Other model');
  if (await ev(`!!document.querySelector('[role=menu]')`)) await b('press', 'Escape');
  await wait(
    `document.querySelector('.first-question .model-picker')?.textContent.includes('Other model')`,
  );

  // Retry: the first send creates exactly one tree with that message, titled in the header, map box and band switcher.
  await ev(`document.querySelector('.first-question [role=textbox]').focus(); true`);
  await b('press', 'Enter');
  await b('wait', '--text', 'Fixture response 21');
  const fresh = store.list().find((t) => t.title === 'Why are leaves green?');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === 'Why are leaves green?' && document.querySelector('[data-id="${fresh.id}"] h2')?.textContent === 'Why are leaves green?' && document.querySelector('.tree-switcher-title')?.textContent === 'Why are leaves green?'`,
  );
  assert.deepEqual(await nodes(), [fresh.id]);
  assert.equal(store.list().filter((t) => !t.parent).length, 2);
  assert.equal(store.tree(fresh.id).model, 'other');
  assert.deepEqual(
    store.tree(fresh.id).messages.map((m) => [m.role, m.text, m.status]),
    [
      ['user', 'Why are leaves green?', 'completed'],
      ['assistant', 'Fixture response 21', 'completed'],
    ],
  );

  // A child created from the first answer stays visible and opens in the panel.
  await b(
    'eval',
    '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true',
  );
  await b('press', 'Enter');
  await wait(
    `document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value === 'Fixture response 21'`,
  );
  await b('press', 'Home');
  for (let i = 0; i < 7; i++) await b('press', 'Shift+ArrowRight');
  await b('press', 'Tab');
  await b('press', 'Enter');
  await b(
    'find',
    'role',
    'textbox',
    'fill',
    '--name',
    'Question about this passage',
    'Child question',
  );
  await click('Create focused chat');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Child question'`);
  const child = store.list().find((t) => t.parent === fresh.id);
  await wait(
    `!!document.querySelector('[data-id="${child.id}"]') && !!document.querySelector('[data-id="${fresh.id}"]')`,
  );
  assert.deepEqual(
    store.tree(child.id).branch && [
      store.tree(child.id).branch.start,
      store.tree(child.id).branch.end,
      store.tree(child.id).branch.text,
    ],
    [0, 7, 'Fixture'],
  );
  await click('Return to parent conversation');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === 'Why are leaves green?' && ${idle}`,
  );
  await click('Open Child question');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Child question'`);

  // The existing saved tree still opens with its messages.
  await openNavigation();
  await click('Saved tree');
  await b('wait', '[aria-label="Open Saved tree"]');
  assert.deepEqual(await nodes(), [saved.id]);
  assert.deepEqual(store.tree(saved.id).messages, savedMessages);
  assert.equal(store.list().filter((t) => !t.parent).length, 2);
  console.log(
    'PASS: New chat shows a focused blank composer and saves nothing (repeat and reload too), failed first send keeps draft and leaves no tree, retry with the picked model creates exactly one tree with the message and titles header, box and band, child visible and opens, saved tree unchanged.',
  );
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
