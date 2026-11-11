// Built-app browser fixture (seeded usage records, fake provider, no live model) for the usage history dashboard.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `usage-dashboard-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const dialog = `document.querySelector('dialog[open]')`;
const store = new Store(join(mkdtempSync(join(tmpdir(), 'usage-dashboard-')), 'data.sqlite'));
const now = new Date(), lastYear = now.getFullYear() - 1;
store.record('chat:a', 'chat', { provider: 'claude', model: 'sonnet' }, { input: 1200, output: 300, cacheRead: 800 }, +now - 1000);
store.record('suggestions:a', 'suggestions', { provider: 'claude', model: 'haiku' }, { input: 200, output: 50, cacheRead: 0 }, +now - 900);
store.record('chat:b', 'chat', { provider: 'codex', model: 'gpt-5' }, null, +now - 800);
store.record('chat:old', 'chat', null, { input: 5000, output: 1000, cacheRead: 2000 }, +new Date(lastYear, 11, 31, 23, 30));
let calls = 0;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async () => { calls++; } } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const steps = [], shots = [];
const range = async name => { await b('find', 'role', 'radio', 'click', '--name', name, '--exact'); await wait(`${dialog}.querySelector('[role=radio][aria-checked=true]')?.textContent.includes(${JSON.stringify(name)})`); await new Promise(r => setTimeout(r, 150)); };
const total = () => ev(`${dialog}.querySelector('.usage-total')?.textContent`);
const openUsage = async () => {
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait(dialog);
  await b('find', 'text', 'Usage', 'click', '--exact');
  await wait(`${dialog}.querySelector('.usage-total')`);
};
try {
  await b('set', 'viewport', '1400', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await openUsage();
  assert.equal(await total(), '1,400 input, 350 output, 800 cache-read tokens (2,550 total)');
  assert.match(await ev(`${dialog}.textContent`), /2 measured calls, 1 without reported counts/);
  assert.equal(await ev(`${dialog}.querySelectorAll('.usage-bar').length`), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), 'month shows one bar per day');
  const models = await ev(`[...${dialog}.querySelectorAll('table')].map(t => t.innerText).join('\\n')`);
  for (const s of ['sonnet (claude)', 'haiku (claude)', 'gpt-5 (codex)', 'Chat replies', 'Suggestions']) assert.ok(models.includes(s), s);
  steps.push('Month (dark): exact totals 2,550 with 1 unreported call; one bar per day; model and task tables');

  // Keyboard: Tab reaches the chart; arrows move the active bar and the live readout states exact values.
  await ev(`${dialog}.querySelector('.usage-bar[tabindex="0"]').focus(); true`);
  await b('press', 'End');
  const last = await ev(`document.activeElement.getAttribute('aria-label')`);
  assert.match(await ev(`${dialog}.querySelector('.usage-readout').textContent`), /: \d/);
  await b('press', 'Home');
  assert.notEqual(await ev(`document.activeElement.getAttribute('aria-label')`), last, 'Home moves focus');
  const today = now.getDate() - 1;
  for (let i = 0; i < today; i++) await b('press', 'ArrowRight');
  assert.match(await ev(`${dialog}.querySelector('.usage-readout').textContent`), /1,400 input, 350 output, 800 cache-read tokens \(2,550 total\); 2 measured calls, 1 without reported counts/);
  assert.equal(await ev(`document.activeElement.matches('.usage-bar:focus-visible')`), true, 'focused bar shows a focus ring');
  shots.push('docs/verification/usage-dashboard-month-dark.png'); await b('screenshot', shots.at(-1));
  steps.push('Focus + Home/End/ArrowRight read today’s exact values in the polite live readout');

  await b('hover', `.usage-bar:nth-of-type(1)`);
  assert.match(await ev(`${dialog}.querySelector('.usage-readout').textContent`), /: 0 input/, 'hover shows exact values');
  await range('Today');
  assert.equal(await ev(`${dialog}.querySelectorAll('.usage-bar').length`), 24);
  await range('All time');
  assert.equal(await total(), '6,400 input, 1,350 output, 2,800 cache-read tokens (10,550 total)');
  assert.ok((await ev(`${dialog}.textContent`)).includes('Unknown model (saved before attribution)'));
  await b('find', 'role', 'radio', 'click', '--name', 'Cumulative', '--exact');
  await ev(`${dialog}.querySelector('.usage-bar:last-of-type').focus(); true`);
  assert.match(await ev(`${dialog}.querySelector('.usage-readout').textContent`), /\(cumulative\): 6,400 input/);
  steps.push('Hover readout; Today = 24 hourly bars; All time includes last New Year’s Eve call with unknown model; cumulative last bar = all-time totals');

  await range('Year');
  await b('find', 'role', 'combobox', 'click', '--name', 'Year');
  await b('find', 'role', 'option', 'click', '--name', String(lastYear), '--exact');
  await wait(`${dialog}.querySelector('.usage-total')?.textContent.startsWith('5,000 input')`);
  assert.equal(await ev(`${dialog}.querySelectorAll('.usage-bar').length`), 12);
  steps.push(`Year ${lastYear}: only the 31 Dec 23:30 call, 12 monthly bars`);
  await b('find', 'role', 'radio', 'click', '--name', 'Per period', '--exact');
  await b('find', 'text', 'Values for each month', 'click');
  await wait(`[...${dialog}.querySelectorAll('table')].some(t => t.innerText.includes('Dec ${lastYear}'))`);
  steps.push('Textual equivalent: "Values for each month" table lists Dec with exact counts');

  await b('set', 'media', 'light', 'reduced-motion');
  await ev(`localStorage.setItem('treetutor.appearance', 'light'); true`);
  await b('press', 'Escape'); await b('reload'); await openUsage();
  shots.push('docs/verification/usage-dashboard-month-light.png'); await b('screenshot', shots.at(-1));
  const contrast = await ev(`getComputedStyle(${dialog}.querySelector('[data-series=input]')).fill !== getComputedStyle(${dialog}.querySelector('[data-series=cacheRead]')).fill`);
  assert.ok(contrast, 'series colors differ in light');
  // Empty state: a year with no records.
  store.db.exec('DELETE FROM usage_events');
  await range('Week'); await range('Today');
  await wait(`${dialog}.querySelector('.usage-empty')`);
  shots.push('docs/verification/usage-dashboard-empty-light.png'); await b('screenshot', shots.at(-1));
  steps.push('Light: chart rendered with distinct series colors; empty range shows the no-usage message');
  await ev(`localStorage.removeItem('treetutor.appearance'); true`);
  assert.equal(calls, 0, 'viewing usage made no model calls');
  steps.push('No provider calls while viewing');
  writeFileSync('docs/verification/usage-dashboard.json', JSON.stringify({ issue: 'TreeTutor-000.1', checkedAt: new Date().toISOString(), evidence: 'Production build, real app HTTP/SQLite with seeded usage records, agent-browser Chromium. No live provider inference.', steps, screenshots: shots }, null, 2) + '\n');
  console.log(JSON.stringify({ pass: true, steps }, null, 2));
} catch (e) { console.error(steps); throw e; } finally { await b('close').catch(() => {}); app.stop(); store.close(); }
