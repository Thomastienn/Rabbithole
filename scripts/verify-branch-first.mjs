import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Branch-first: built app, isolated store, fake provider whose compaction and reply are held until released.
const run = promisify(execFile), session = `branch-first-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', expression);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'branch-first-')), 'data.sqlite'));
const root = store.create('Roots tree');
store.message(root.id, 'user', 'How do roots work?', 'completed');
store.message(root.id, 'assistant', 'Roots exchange nutrients with fungi.', 'completed');
let releaseCompaction, reply;
const compacting = new Promise(resolve => { releaseCompaction = resolve; });
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { generate: async (tree, _text, emit) => {
  if (!tree.id) { await compacting; emit({ type: 'item', item: 's', text: 'Held compacted context.' }); emit({ type: 'status', status: 'completed' }); return; }
  await new Promise(resolve => { reply = { emit, resolve }; });
} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Roots tree"]');
  await b('find', 'role', 'button', 'click', '--name', 'Open Roots tree', '--exact');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Roots tree'`);
  await b('eval', '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true'); await b('press', 'Enter');
  await wait(`document.activeElement?.tagName === 'TEXTAREA'`);
  await b('press', 'Home');
  for (let i = 0; i < 5; i++) await b('press', 'Shift+ArrowRight');
  await b('press', 'Tab'); await b('press', 'Enter');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Why fungi?');
  // Record when the child header appears and each status line the chat shows, timed from the submit event.
  await ev(`window.seen = []; addEventListener('submit', () => { window.submitted = performance.now(); }, true);
    new MutationObserver(() => {
      const chat = document.querySelector('.focused-chat'), text = chat?.innerText ?? '';
      if (!window.opened && chat?.querySelector('h2')?.textContent === 'Why fungi?') window.opened = performance.now();
      for (const line of ['Compacting parent context…', 'Thinking…', 'Focused answer.']) if (text.includes(line) && window.seen.at(-1)?.line !== line) window.seen.push({ line, locked: !!chat.querySelector('[aria-label="Your question"][aria-disabled=true], [aria-label="Your question"][contenteditable=false]') || !!chat.querySelector('[aria-label=Stop]') });
    }).observe(document.body, { subtree: true, childList: true, characterData: true }); true`);
  await b('find', 'role', 'button', 'click', '--name', 'Create focused chat', '--exact');
  await wait(`window.seen.some(s => s.line === 'Compacting parent context…')`);
  const child = store.list().find(t => t.parent === root.id);
  assert.equal(store.tree(child.id).branch.snapshot, '', 'saved before compaction finishes');
  const opened = await ev('window.opened - window.submitted');
  const post = await ev(`performance.getEntriesByType('resource').find(e => e.name.endsWith('/branches'))?.duration ?? -1`);
  assert.ok(await ev(`document.querySelector('.focused-chat').innerText.includes('Why fungi?') && document.querySelector('.focused-chat').innerText.includes('Roots')`), 'question bubble and passage shown');
  releaseCompaction();
  await wait(`window.seen.some(s => s.line === 'Thinking…')`);
  reply.emit({ type: 'item', item: 'a', text: 'Focused answer.' });
  await wait(`window.seen.some(s => s.line === 'Focused answer.')`);
  reply.emit({ type: 'status', status: 'completed' }); reply.resolve();
  await wait(`!document.querySelector('.focused-chat [aria-label=Stop]')`);
  const seen = await ev('window.seen');
  assert.deepEqual(seen.map(s => s.line), ['Compacting parent context…', 'Thinking…', 'Focused answer.']);
  assert.ok(seen.slice(0, 2).every(s => s.locked), 'composer locked before the reply starts');
  assert.equal(store.tree(child.id).branch.snapshot, 'Held compacted context.');
  console.log(`PASS: child opened ${opened.toFixed(1)} ms after submit (branch POST ${post.toFixed(1)} ms) with passage and question; status lines ${seen.map(s => s.line).join(' → ')}; composer locked while waiting; snapshot filled after compaction.`);
  assert.ok(opened <= 50, `child should open within about one frame of submit, took ${opened} ms`);
} finally { releaseCompaction(); reply?.resolve(); await b('close').catch(() => {}); app.stop(); store.close(); }
