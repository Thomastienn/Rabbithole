// Built-app browser fixture (in-process fake provider, not a live model) for the inherited context section.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `inherited-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'inherited-')), 'data.sqlite'));
const root = store.create('Mutex basics');
store.message(root.id, 'user', 'What is a mutex?', 'completed');
const reply = store.message(root.id, 'assistant', 'A mutex guards shared state so one thread runs at a time.', 'completed');
const snapshot = 'The learner asked what a mutex is.\nThe tutor said a mutex lets one thread at a time touch shared state.';
const child = store.branch(root, { messageId: reply, start: 30, end: 42, text: 'shared state', question: 'Why must shared state be guarded?' }, snapshot);
store.message(child.id, 'user', 'Why must shared state be guarded?', 'completed');
store.message(child.id, 'assistant', 'Two threads writing at once can corrupt it.', 'completed');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async () => {} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
const section = `document.querySelector('.focused-chat [role=log] .inherited-context')`;
try {
  await b('set', 'viewport', '1600', '1000');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Mutex basics"]');
  await click('Open Mutex basics');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Mutex basics'`);
  assert.equal(await ev(`!!${section}`), false, 'root conversation shows no inherited section');
  steps.push('root conversation: no inherited section');

  await click('Return to tree');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  await click('Open Why must shared state be guarded?');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Why must shared state be guarded?' && ${section}`);
  const closed = await ev(`(() => { const s = ${section}, t = s.querySelector('[aria-expanded]');
    return { label: t.textContent, expanded: t.getAttribute('aria-expanded'), first: s.getBoundingClientRect().bottom <= document.querySelector('.focused-chat [role=log] article').getBoundingClientRect().top, visible: !!s.querySelector('.inherited-body')?.checkVisibility() }; })()`);
  assert.equal(closed.label, 'Inherited from Mutex basics');
  assert.equal(closed.expanded, 'false', 'collapsed by default');
  assert.equal(closed.visible, false, 'body hidden while collapsed');
  assert.ok(closed.first, 'section sits at the top of the message list');
  steps.push(`child conversation: "${closed.label}" collapsed at top of message list`);

  await click('Inherited from Mutex basics');
  await wait(`${section}.querySelector('.inherited-body')?.checkVisibility()`);
  const open = await ev(`(() => { const s = ${section};
    return { dd: [...s.querySelectorAll('dd')].map(d => d.textContent), editable: s.querySelectorAll('input, textarea, [contenteditable=true]').length }; })()`);
  assert.deepEqual(open.dd, ['shared state', 'Why must shared state be guarded?', snapshot]);
  assert.equal(open.editable, 0, 'read-only');
  steps.push('expanded: passage, branching question and snapshot as plain text; no editable fields');

  const shot = join(mkdtempSync(join(tmpdir(), 'inherited-shots-')), 'inherited-context.png');
  await b('screenshot', shot);
  console.log(JSON.stringify({ pass: true, steps, screenshot: shot }, null, 2));
} catch (e) { console.error(steps); throw e; } finally { await b('close').catch(() => {}); app.stop(); store.close(); }
