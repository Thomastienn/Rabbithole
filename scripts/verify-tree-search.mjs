// Built-app browser fixture (in-process fake provider, not a live model) for search across learning trees.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `tree-search-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'tree-search-')), 'data.sqlite'));
const photo = store.create('Photosynthesis basics');
store.message(photo.id, 'user', 'How do leaves make sugar?', 'completed');
const reply = store.message(photo.id, 'assistant', 'Leaves use **chlorophyll** to capture light.', 'completed');
const child = store.branch(store.tree(photo.id), { messageId: reply, start: 0, end: 6, text: 'Leaves', question: 'Why green?' }, 'ctx');
store.message(child.id, 'user', 'Why green?', 'completed');
store.message(child.id, 'assistant', 'Green light is reflected by the thylakoid membranes.', 'completed');
store.message(store.create('Roman roads').id, 'user', 'Who built the roads?', 'completed');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async () => {} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
const field = '.tree-search input';
const results = () => ev(`[...document.querySelectorAll('.tree-search-result')].map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
const active = () => ev(`document.activeElement.matches('${field}') ? 'field' : document.activeElement.innerText?.split('\\n')[0]`);
try {
  await b('set', 'viewport', '1400', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await b('wait', '[aria-label="Open Roman roads"]');

  await b('fill', field, 'THYLAKOID');
  await wait(`document.querySelectorAll('.tree-search-result').length === 1`);
  assert.deepEqual(await results(), ['Photosynthesis basics …een light is reflected by the thylakoid membranes.'], 'case-insensitive message match shows its tree and a snippet');
  assert.equal(await ev(`!!document.querySelector('.tree-date-heading')`), false, 'results replace the dated list');
  steps.push('Typed "THYLAKOID": one result, Photosynthesis basics with the branch reply snippet');

  await b('focus', field);
  await b('press', 'ArrowDown');
  assert.equal(await active(), 'Photosynthesis basics', 'ArrowDown moves from the field to the first result');
  await b('press', 'ArrowUp');
  assert.equal(await active(), 'field', 'ArrowUp returns to the field');
  await b('press', 'ArrowDown');
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat')?.innerText.includes('thylakoid membranes')`);
  assert.equal(await ev(`document.querySelector('.saved-tree-row[data-current=true]')?.innerText.split('\\n')[0]`), 'Photosynthesis basics', 'tree is current');
  steps.push('ArrowDown, ArrowUp, ArrowDown, Enter: tree opens with the matching branch conversation focused in chat');

  await b('fill', field, 'roman');
  await wait(`document.querySelectorAll('.tree-search-result').length === 1 && document.querySelector('.tree-search-result').innerText.startsWith('Roman')`);
  await b('focus', field);
  await b('press', 'Enter');
  await wait(`document.querySelector('.saved-tree-row[data-current=true]')?.innerText.startsWith('Roman roads')`);
  steps.push('Typed "roman", Enter in the field: title match opens Roman roads');

  await b('fill', field, 'quasar');
  await wait(`document.querySelector('.tree-list [role=status]')?.innerText.includes('No learning trees match')`);
  assert.equal(await ev(`document.querySelectorAll('.tree-search-result').length`), 0);
  steps.push('Typed "quasar": plain "No learning trees match “quasar”." message');

  await b('click', '.tree-search button');
  await wait(`document.querySelectorAll('.tree-date-heading').length > 0 && document.querySelector('${field}').value === ''`);
  steps.push('Clear button empties the field: dated tree list returns');

  for (const mode of ['dark', 'light']) {
    if (mode === 'light') { await ev(`localStorage.setItem('treetutor.appearance', 'light'); location.reload(); true`); await b('wait', '[aria-label="Open Roman roads"]'); }
    await b('fill', field, 'leaves');
    await wait(`document.querySelectorAll('.tree-search-result').length === 1`);
    const file = join('docs', 'verification', `tree-search-${mode}.png`);
    await b('screenshot', file);
    steps.push(`${mode}: results for "leaves"; ${file}`);
  }
  await ev(`localStorage.removeItem('treetutor.appearance'); true`);
  console.log(JSON.stringify({ pass: true, steps }, null, 2));
} catch (e) { console.error(steps); throw e; } finally { await b('close').catch(() => {}); app.stop(); store.close(); }
