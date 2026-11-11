// Built-app browser fixture (in-process fake provider, not a live model) for branching from underlines and highlights.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `suggest-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'suggest-')), 'data.sqlite'));
const text = 'Use a mutex to guard shared state.';
const span = p => ({ start: text.indexOf(p), end: text.indexOf(p) + p.length, text: p });
const root = store.create('Suggestion fixture');
const replyId = store.message(root.id, 'assistant', text, 'completed');
const ready = (conversation, message) => { store.pendingSuggestions(conversation, message); store.finishSuggestions(conversation, message, [span('mutex'), span('shared state')], null); };
ready(root.id, replyId);
// Compaction never sees the new question, so the failing branch is armed for one compaction call.
let failCompact = false;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (tree, input, emit) => {
  if (failCompact && tree.instructions?.startsWith('You write the background')) { failCompact = false; return emit({ type: 'status', status: 'failed' }); }
  emit({ type: 'item', item: 'one', text: input.startsWith('Compact only facts') ? 'Fixture snapshot' : text }); emit({ type: 'status', status: 'completed' });
} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const children = id => store.list().filter(t => t.parent === id);
const passages = id => store.tree(id).suggestions[0].passages;
const boxOpen = `document.activeElement?.closest('.passage-box .branch-form') && document.activeElement.value === ''`;
const stop = word => `[...document.querySelectorAll('.focused-chat u.suggestion[tabindex]')].find(u => u.textContent === ${JSON.stringify(word)})`;
const steps = [];
try {
  await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Suggestion fixture"]');
  await click('Open Suggestion fixture');
  await wait(stop('mutex'));

  // Pointer click on an underline opens an empty box above that passage.
  await ev(`${stop('mutex')}.click(); true`);
  await wait(boxOpen);
  const geometry = await ev(`(() => { const box = document.querySelector('.passage-box').getBoundingClientRect(), u = ${stop('mutex')}.getBoundingClientRect(); return { clear: box.bottom <= u.top + 1 || box.top >= u.bottom - 1 }; })()`);
  // Spec rule 6: above the passage, or below it when above would overlap the chat header.
  assert.equal(geometry.clear, true, 'box sits beside the passage, not over it');
  await b('press', 'Enter');
  assert.equal(children(root.id).length, 0, 'empty box cannot be sent');
  await b('press', 'Escape');
  await wait(`!document.querySelector('.branch-form') && document.activeElement === ${stop('mutex')}`);
  steps.push('click opens empty box anchored beside the underline; empty Enter sends nothing; Escape closes and refocuses the underline');

  // Keyboard: Enter on the focused underline opens the same box; a failed branch keeps the prompt.
  await b('press', 'Enter');
  await wait(boxOpen);
  await b('keyboard', 'type', 'fail me');
  failCompact = true;
  await b('press', 'Enter');
  await wait(`document.querySelector('[role=alert]') && !document.querySelector('.branch-form input').disabled`);
  assert.equal(await ev(`document.querySelector('.branch-form input').value`), 'fail me');
  assert.equal(children(root.id).length, 0);
  steps.push('Enter on underline opens the box; failed branch keeps "fail me" and creates nothing');

  await b('press', 'Control+a');
  await b('keyboard', 'type', 'explain');
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'explain'`);
  const [child] = children(root.id);
  assert.deepEqual([store.tree(child.id).branch.text, store.tree(child.id).branch.question], ['mutex', 'explain']);
  assert.equal(passages(root.id)[0].child, child.id);
  steps.push('"explain" creates one child from the exact passage and opens it; suggestion saved as explored');

  // Explored underline is solid and opens the existing child without a duplicate.
  await wait(`document.querySelector('.focused-chat')?.innerText.includes(${JSON.stringify(text)})`);
  await click('Return to parent conversation');
  await wait(`${stop('mutex')}?.classList.contains('explored')`);
  assert.equal(await ev(`getComputedStyle(${stop('mutex')}).textDecorationStyle`), 'solid');
  assert.equal(await ev(`getComputedStyle(${stop('shared state')}).textDecorationStyle`), 'dotted');
  await ev(`${stop('mutex')}.focus(); true`);
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'explain'`);
  assert.equal(children(root.id).length, 1);
  steps.push('explored underline is solid; Enter opens the existing child; no duplicate');

  // Grandchild, entirely by keyboard.
  const childReply = store.tree(child.id).messages.find(m => m.role === 'assistant').id;
  ready(child.id, childReply);
  await click('Return to parent conversation');
  await wait(stop('mutex'));
  await ev(`${stop('mutex')}.focus(); true`);
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'explain' && ${stop('shared state')}`);
  await ev(`${stop('shared state')}.focus(); true`);
  await b('press', 'Enter');
  await wait(boxOpen);
  await b('keyboard', 'type', 'explain');
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'explain' && document.querySelector('.focused-chat [aria-label="Return to parent conversation"]')`);
  await new Promise(r => setTimeout(r, 300));
  const [grandchild] = children(child.id);
  assert.equal(store.tree(grandchild.id).branch.text, 'shared state');
  assert.equal(passages(child.id)[1].child, grandchild.id);
  steps.push('grandchild created from an underline in the child by keyboard; explored there');

  // A highlight inside an explored underline wins: it opens the box for a new branch instead of the child.
  await click('Return to parent conversation');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'explain' && ${stop('shared state')}?.classList.contains('explored')`);
  await click('Return to parent conversation');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Suggestion fixture' && ${stop('mutex')}?.classList.contains('explored')`);
  const points = await ev(`(() => { const n = ${stop('mutex')}.firstChild, a = document.createRange(), z = document.createRange(); a.setStart(n, 1); a.setEnd(n, 2); z.setStart(n, 3); z.setEnd(n, 4); const p = a.getBoundingClientRect(), q = z.getBoundingClientRect(); return [p.left + 1, p.top + p.height / 2, q.right - 1, q.top + q.height / 2]; })()`);
  await b('mouse', 'move', String(Math.round(points[0])), String(Math.round(points[1])));
  await b('mouse', 'down', 'left');
  await b('mouse', 'move', String(Math.round(points[2])), String(Math.round(points[3])), '--steps', '8');
  await b('mouse', 'up', 'left');
  await wait(boxOpen);
  assert.equal(await ev(`document.querySelector('.focused-chat h2').textContent`), 'Suggestion fixture');
  await b('keyboard', 'type', 'another angle');
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'another angle'`);
  const manual = children(root.id).find(t => t.id !== child.id);
  assert.equal(store.tree(manual.id).branch.text, 'ute');
  assert.equal(passages(root.id)[0].child, child.id, 'manual highlight leaves the explored reference unchanged');
  steps.push('highlight inside an explored underline wins and creates a second branch ("ute")');
  await click('Return to parent conversation');
  await wait(stop('mutex'));
  const shots = mkdtempSync(join(tmpdir(), 'suggest-shots-'));
  await ev(`${stop('shared state')}.click(); true`);
  await wait(boxOpen);
  await b('screenshot', join(shots, 'box.png'));
  console.log(JSON.stringify({ pass: true, steps, screenshot: join(shots, 'box.png') }, null, 2));
} catch (e) { console.error(steps); throw e; } finally { await b('close').catch(() => {}); app.stop(); store.close(); }
