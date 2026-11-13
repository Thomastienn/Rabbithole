import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Compaction starts when the branch form opens: Escape cancels it; reopening and submitting reuses the new run.
const run = promisify(execFile), session = `branch-prepare-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const wait = expression => b('wait', '--fn', expression);
const until = async check => { while (!check()) await new Promise(resolve => setTimeout(resolve, 20)); };
const store = new Store(join(mkdtempSync(join(tmpdir(), 'branch-prepare-')), 'data.sqlite'));
const root = store.create('Roots tree');
store.message(root.id, 'user', 'How do roots work?', 'completed');
store.message(root.id, 'assistant', 'Roots exchange nutrients with fungi.', 'completed');
const calls = [];
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { generate: async (tree, _text, emit, _save, signal) => {
  if (!tree.id) {
    const call = { aborted: false };
    calls.push(call);
    await new Promise((resolve, reject) => { call.release = resolve; signal.addEventListener('abort', () => { call.aborted = true; reject(new Error('Stopped.')); }, { once: true }); });
    emit({ type: 'item', item: 's', text: 'Prepared context.' });
  } else emit({ type: 'item', item: 'a', text: 'Focused answer.' });
  emit({ type: 'status', status: 'completed' });
} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const openForm = async (reopen = false) => {
  if (reopen) await b('eval', 'document.querySelector(".focused-chat textarea").focus(); true');
  else { await b('eval', '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true'); await b('press', 'Enter'); }
  await wait(`document.activeElement?.tagName === 'TEXTAREA'`);
  await b('press', 'Home');
  for (let i = 0; i < 5; i++) await b('press', 'Shift+ArrowRight');
  await b('press', 'Tab'); await b('press', 'Enter');
  await wait(`!!document.querySelector('.branch-form')`);
};
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Roots tree"]');
  await b('find', 'role', 'button', 'click', '--name', 'Open Roots tree', '--exact');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Roots tree'`);
  await openForm();
  await until(() => calls.length === 1);
  await b('press', 'Escape');
  await until(() => calls[0].aborted);
  assert.equal(store.list().length, 1, 'closing the form creates no child');
  await openForm(true);
  await until(() => calls.length === 2);
  calls[1].release(); // finishes before submit, so the child skips straight to Thinking
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Why fungi?');
  await b('find', 'role', 'button', 'click', '--name', 'Create focused chat', '--exact');
  await wait(`document.querySelector('.focused-chat')?.innerText.includes('Focused answer.')`);
  const child = store.list().find(t => t.parent === root.id);
  assert.equal(store.tree(child.id).branch.snapshot, 'Prepared context.');
  assert.equal(calls.length, 2, 'submit reused the prepared compaction');
  assert.equal(store.usageEvents().events.filter(e => e.task === 'compaction').length, 2, 'cancelled and reused runs both in Usage history');
  console.log('PASS: form open started compaction; Escape aborted it with no child; reopen + submit reused the run (2 calls total, both in Usage history).');
} finally { for (const c of calls) c.release?.(); await b('close').catch(() => {}); app.stop(); store.close(); }
