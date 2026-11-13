// Focused built-app checks over a controlled in-process provider, not native inference.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `break-down-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async text => JSON.parse(await b('eval', text, '--json')).data.result;
const wait = text => b('wait', '--fn', `!!(${text})`);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const key = name => b('press', name);
const compose = async text => {
  await b('wait', '[role=textbox][aria-label="Your question"]');
  await wait(`!document.documentElement.matches(':active-view-transition')`);
  await b('focus', '[role=textbox][aria-label="Your question"]');
  await key('Control+a'); await b('keyboard', 'type', text);
};
async function reach(selector, text) {
  for (let i = 0; i < 90; i++) {
    if (await ev(`document.activeElement?.matches(${JSON.stringify(selector)}) && (${text ? `document.activeElement.textContent.trim() === ${JSON.stringify(text)}` : 'true'})`)) return;
    await key('Tab');
  }
  throw new Error(`Tab did not reach ${selector}`);
}
const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-break-down-ui-')), 'trees.sqlite'));
const root = store.create('Break down fixture', 'codex');
store.message(root.id, 'assistant', 'An earlier saved reply.\n\n'.repeat(30), 'completed');
let finish, fail = false;
const calls = [], answer = 'A mutex guards shared state.';
const provider = {
  models: async () => [{ model: 'fixture-luna', label: 'Fixture Luna', isDefault: true }, { model: 'fixture-alternate', label: 'Fixture alternate' }],
  generate: async (tree, text, emit, save) => {
    const suggestion = text.startsWith('Mark every term'); calls.push({ suggestion });
    if (suggestion) {
      if (fail) throw new Error('Controlled suggestion failure');
      await new Promise(resolve => { finish = resolve; });
      emit({ type: 'item', item: 'one', text: JSON.stringify({ suggestions: [{ text: 'mutex', start: 2, end: 7 }, { text: 'shared state', start: 15, end: 27 }], concepts: [{ name: 'Mutex', topics: ['Concurrency'] }] }) });
    } else {
      save('fixture-thread', 'fixture-luna');
      emit({ type: 'item', item: 'one', text: answer });
      emit({ type: 'usage', usage: { input: 3, output: 4, cacheRead: 0 } });
    }
    emit({ type: 'status', status: 'completed' });
  },
};
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider, suggestions: true });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`, steps = [];
const screenshots = [], shots = resolve('.impeccable/review');
mkdirSync(shots, { recursive: true });
const manual = async index => {
  await reach('button.focus-reveal', `Select passage in tutor reply ${index}`); await key('Enter');
  await b('wait', 'textarea[readonly]');
  await ev(`(() => { const e = document.querySelector('textarea[readonly]'); e.focus(); e.setSelectionRange(2, 7); e.dispatchEvent(new Event('select', { bubbles: true })); return true; })()`);
  await reach('.passage button'); await key('Enter');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  await key('Escape'); await reach('button', 'Close passage selection'); await key('Enter');
};
const settings = async () => {
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait(`document.activeElement?.id === 'settings-heading'`);
  await click('Models');
  await wait(`document.activeElement?.id === 'settings-section-models'`);
};
try {
  await b('set', 'viewport', '1440', '1000'); await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Break down fixture"]');
  await reach('button[aria-label="Open Break down fixture"]'); await key('Enter');
  await compose('Explain mutex'); await key('Enter');
  await wait(`document.querySelector('.focused-chat')?.innerText.includes(${JSON.stringify(answer)})`);
  assert.equal(store.tree(root.id).suggestions.at(-1).status, 'pending');
  assert.equal(await ev(`document.querySelectorAll('u.suggestion').length`), 0);
  await manual(2);
  assert.equal(calls.length, 2);
  steps.push('Pending suggestions draw no underlines; keyboard manual highlighting opens the same empty passage box without another model call');

  await compose('Keep this draft');
  await ev(`(() => {
    const scrolls = [...document.querySelectorAll('.focused-chat, .focused-chat *')].filter(e => e.scrollHeight > e.clientHeight && /auto|scroll/.test(getComputedStyle(e).overflowY));
    for (const e of scrolls) e.scrollTop = 40;
    window.readingCheck = { focus: document.activeElement, scrolls: scrolls.map(e => [e, e.scrollTop]), notices: [] };
    const status = [...document.querySelectorAll('.passage .sr-only[role=status]')].at(-1);
    new MutationObserver(() => { if (status.textContent) window.readingCheck.notices.push(status.textContent); }).observe(status, { childList: true, characterData: true, subtree: true });
    return true;
  })()`);
  finish();
  await wait(`document.querySelectorAll('.focused-chat u.suggestion[tabindex]').length === 2`);
  const reading = await ev(`({ focus: document.activeElement === window.readingCheck.focus, draft: document.activeElement.textContent, scroll: window.readingCheck.scrolls.every(([e, top]) => Math.abs(e.scrollTop - top) < 1), scrollContainers: window.readingCheck.scrolls.length, notices: window.readingCheck.notices, box: !!document.querySelector('.branch-form') })`);
  assert.equal(reading.focus, true); assert.equal(reading.draft, 'Keep this draft'); assert.equal(reading.scroll, true); assert.ok(reading.scrollContainers > 0); assert.equal(reading.box, false);
  assert.deepEqual(reading.notices, ['2 suggested passages in tutor reply 2']);
  await reach('u.suggestion[tabindex]');
  assert.ok((await ev(`document.activeElement.getAttribute('aria-label')`)).startsWith('Suggested passage:'));
  await key('Enter'); await wait(`document.activeElement?.matches('.branch-form input')`); await key('Escape');
  steps.push('Suggestion arrival preserves composer focus, draft and scrolled transcript; opens nothing; one status announcement; Tab reaches descriptively named underline and Enter opens its box');
  await b('wait', '--text', 'suggestion usage unavailable');
  steps.push('Reported tutor usage stays visible and missing suggestion usage is explicitly unavailable');
  for (const [width, height, label] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) {
    await b('set', 'viewport', String(width), String(height));
    const path = join(shots, `break-down-usage-${label}.png`);
    await b('screenshot', path); screenshots.push(path);
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
  }
  await b('set', 'viewport', '1440', '1000');

  fail = true;
  await compose('Fail suggestions'); await key('Enter');
  await b('wait', '--text', 'Suggestions unavailable'); await manual(3);
  steps.push('Suggestion failure displays nonblocking unavailable note; keyboard manual highlighting still works');
  store.db.prepare('UPDATE suggestions SET nameTokens=2501').run();
  await b('reload'); await b('wait', '[aria-label="Map menu"]'); await settings();
  await b('wait', '--text', 'Warning: concept matching is getting expensive');
  await click('Usage');
  await b('wait', '--text', '6 input, ');
  await click('Models');
  await reach('[role=switch]'); await key('Space');
  await wait(`document.querySelector('[role=switch]')?.checked === false && !document.querySelector('[role=switch]').disabled`);
  assert.equal(store.suggestionSettings().enabled, false);
  await reach('[role=switch]'); await key('Space');
  await wait(`document.querySelector('[role=switch]')?.checked === true && !document.querySelector('[role=switch]').disabled`);
  // Bring the model selector into the page viewport before opening its list.
  await ev(`[...document.querySelectorAll('.settings-page:not([hidden]) label')].find(l => l.textContent.startsWith('Quick thinking model')).scrollIntoView({ block: 'center' }); true`);
  await b('find', 'label', 'Quick thinking model', 'click');
  await wait(`document.activeElement?.matches('[role=combobox]')`);
  await b('keyboard', 'type', 'Fixture alternate');
  await wait(`[...document.querySelectorAll('[role=option]')].filter(e => e.checkVisibility()).length === 1 && [...document.querySelectorAll('[role=option]')].some(e => e.textContent === 'Fixture alternate')`);
  await key('ArrowDown'); await key('Enter');
  await wait(`[...document.querySelectorAll('button[aria-expanded=false]')].some(e => e.textContent.includes('Fixture alternate') && !e.disabled) && [...document.querySelectorAll('[role=status]')].some(e => e.textContent === 'Quick thinking settings saved.')`);
  assert.deepEqual(store.suggestionSettings().model, { provider: 'codex', model: 'fixture-alternate' });
  steps.push('Settings shows daily total and >2k concept warning; keyboard toggles automatic suggestions and selects a pinned model');
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await b('set', 'viewport', String(width), String(height));
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
  }
  steps.push('Settings copy fits desktop and phone widths');
  console.log(JSON.stringify({ pass: true, steps, reading, screenshots }, null, 2));
} catch (error) { console.error({ steps, snapshot: await b('snapshot', '-i').catch(() => '') }); throw error; }
finally { finish?.(); await b('close').catch(() => {}); await app.stop(); store.close(); }
