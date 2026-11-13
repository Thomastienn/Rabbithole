import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Turn rail: built app, isolated store, no provider calls. One named tick per question; click jumps; current follows scroll; hidden for one question or narrow.
const run = promisify(execFile), session = `turn-rail-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', expression);
const settle = () => wait(`new Promise(r => setTimeout(() => r(true), 400))`);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'turn-rail-')), 'data.sqlite'));
const tree = store.create('Roots tree');
const long = topic => Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1} about ${topic}: roots trade sugars for minerals with fungi across the soil.`).join('\n\n');
const questions = ['How do roots work?', 'What about fungi?', 'And water?'];
const ids = questions.map(q => { const id = store.message(tree.id, 'user', q, 'completed'); store.message(tree.id, 'assistant', long(q), 'completed'); return id; });
const single = store.create('Single tree');
store.message(single.id, 'user', 'Only question?', 'completed'); store.message(single.id, 'assistant', long('one'), 'completed');
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { generate: async () => { throw new Error('no provider calls expected'); } } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const scroller = `(() => { let s = document.querySelector('.focused-chat [data-chat-message]').parentElement; while (s && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement; return s; })()`;
const offset = id => ev(`(() => { const s = ${scroller}, m = document.querySelector('.focused-chat [data-chat-message="${id}"]'); return m.getBoundingClientRect().top - s.getBoundingClientRect().top; })()`);
const current = () => ev(`document.querySelector('.turn-rail [aria-current=true]')?.getAttribute('aria-label') ?? null`);
const ticks = () => ev(`[...document.querySelectorAll('.turn-rail .turn-tick')].map(e => e.tagName + ':' + e.getAttribute('aria-label'))`);
const openTree = async title => { await b('click', `[aria-label="Open ${title}"]`); await wait(`!!document.querySelector('.focused-chat [data-chat-message]')`); await settle(); };
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  // Newest tree opens first: one question, no rail.
  await b('wait', '[aria-label="Open Single tree"]');
  await openTree('Single tree');
  assert.equal(await ev(`document.querySelectorAll('.turn-rail').length`), 0, 'no rail for a single question');
  await b('click', '[aria-label="Return to tree"]');
  await b('click', '[aria-label="Map menu"]');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await wait(`document.querySelector("[aria-label='Roots tree']")?.getBoundingClientRect().x >= 0`);
  await b('click', '[aria-label="Roots tree"]');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Roots tree'`); await settle();
  assert.deepEqual(await ticks(), questions.map(q => `BUTTON:${q}`), 'one named button per question, in order');
  assert.equal(await current(), questions[2], 'chat opens at the bottom, so the last question is current');
  const results = [];
  for (const i of [0, 1, 2]) {
    await b('click', `.turn-rail .turn-tick[aria-label="${questions[i]}"]`);
    await settle();
    const top = await offset(ids[i]);
    results.push(`q${i + 1} ${top.toFixed(1)} px`);
    // The last question cannot reach the top when its reply is shorter than the reading area.
    if (i < 2) assert.ok(Math.abs(top) <= 4, `question ${i + 1} top should sit at the reading area top, offset ${top}`);
    assert.equal(await current(), questions[i], `tick ${i + 1} is current after its click`);
  }
  // Scrolling by hand moves the current tick.
  await ev(`(() => { const s = ${scroller}; s.scrollTop = 0; return true; })()`); await settle();
  assert.equal(await current(), questions[0], 'scrolled to the top, the first question is current');
  await ev(`(() => { const s = ${scroller}, m = document.querySelector('.focused-chat [data-chat-message="${ids[1]}"]'); s.scrollTop += m.getBoundingClientRect().top - s.getBoundingClientRect().top + 20; return true; })()`); await settle();
  assert.equal(await current(), questions[1], 'scrolled past question 2, it is current');
  // Focus shows the tooltip with the question text.
  await ev(`document.querySelector('.turn-rail .turn-tick').focus(); true`);
  await wait(`[...document.querySelectorAll('[role=tooltip]')].some(t => t.textContent.includes(${JSON.stringify(questions[0])}))`);
  await b('press', 'Enter'); await settle();
  assert.ok(Math.abs(await offset(ids[0])) <= 4, 'Enter on a focused tick jumps too');
  // Narrow layout hides the rail.
  await b('set', 'viewport', '700', '900'); await settle();
  assert.equal(await ev(`document.querySelectorAll('.turn-rail').length`), 0, 'no rail when narrow');
  await b('set', 'viewport', '1440', '900'); await settle();
  assert.equal((await ticks()).length, 3, 'rail returns when wide');
  console.log(`PASS: 3 named ticks in order; clicks put ${results.join(', ')} from the reading area top; current tick follows scroll; tooltip on focus; hidden when narrow or one question.`);
} finally { await b('close').catch(() => {}); app.stop(); store.close(); }
