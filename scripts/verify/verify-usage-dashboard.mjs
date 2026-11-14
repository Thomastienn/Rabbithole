// Built-app browser fixture: real HTTP/SQLite, seeded usage and fake providers; no live inference.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
  session = `usage-dashboard-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const page = `document.querySelector('.settings-page:not([hidden])')`;
const dashboard = `${page}.querySelector('.usage-dashboard')`;
const store = new Store(join(mkdtempSync(join(tmpdir(), 'usage-dashboard-')), 'data.sqlite'));
const now = new Date(),
  lastYear = now.getFullYear() - 1;
store.record(
  'chat:a',
  'chat',
  { provider: 'claude', model: 'sonnet' },
  { input: 1200, output: 300, cacheRead: 800 },
  +now - 1000,
);
store.record(
  'suggestions:a',
  'suggestions',
  { provider: 'claude', model: 'haiku' },
  { input: 200, output: 50, cacheRead: 0 },
  +now - 900,
);
store.record('chat:b', 'chat', { provider: 'codex', model: 'gpt-5' }, null, +now - 800);
store.record(
  'chat:local',
  'chat',
  { provider: 'openai:local', model: 'qwen3:32b' },
  null,
  +now - 700,
);
store.record(
  'chat:month',
  'chat',
  { provider: 'claude', model: 'sonnet' },
  { input: 400, output: 40, cacheRead: 80 },
  +new Date(now.getFullYear(), now.getMonth(), 1),
);
store.record(
  'chat:old',
  'chat',
  null,
  { input: 5000, output: 1000, cacheRead: 2000 },
  +new Date(lastYear, 11, 31, 23, 30),
);
store.record(
  'compaction:a',
  'compaction',
  { provider: 'claude', model: 'haiku' },
  { input: 100, output: 20, cacheRead: 0 },
  +new Date(lastYear, 5, 1),
);
store.record(
  'diagram:a',
  'diagram',
  { provider: 'claude', model: 'sonnet' },
  { input: 300, output: 80, cacheRead: 50 },
  +new Date(lastYear, 5, 1),
);
store.record(
  'video:a',
  'video',
  { provider: 'codex', model: 'gpt-5' },
  null,
  +new Date(lastYear, 5, 1),
);
let calls = 0;
const fixture = {
  models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
  generate: async () => {
    calls++;
  },
};
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  providers: {
    claude: fixture,
    codex: fixture,
    'openai:local': { ...fixture, label: 'Local llama' },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const saved = (await (await fetch(`${origin}/api/usage`)).json()).events;
const steps = [],
  shots = [],
  step = (text) => {
    steps.push(text);
    console.log(`ok - ${text}`);
  };
const number = (text) => (text === '—' ? 0 : Number(text.replaceAll(',', '')));
const sum = (events) =>
  events.reduce(
    (t, e) => t.map((v, i) => v + (e[['input', 'output', 'cacheRead'][i]] ?? 0)),
    [0, 0, 0],
  );
const total = (values) => values.reduce((a, b) => a + b, 0);
const monday = new Date(
  now.getFullYear(),
  now.getMonth(),
  now.getDate() - ((now.getDay() + 6) % 7),
);
const ranges = [
  [
    'Today',
    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    'hour',
  ],
  ['Week', monday, new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7), 'day'],
  [
    'Month',
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
    'day',
  ],
  ['Year', new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1), 'month'],
  ['All time', new Date(0), new Date(now.getFullYear() + 1, 0, 1), 'month'],
];
const select = async (name) => {
  await b('find', 'role', 'radio', 'click', '--name', name, '--exact');
};
const ready = () =>
  wait(
    `${dashboard}?.getAttribute('aria-busy') === 'false' && ${page}.querySelector('.usage-total')`,
  );
const range = async (name) => {
  await select(name);
  await ready();
};
const tableRows = () =>
  ev(
    `[...${page}.querySelectorAll('.usage-breakdown tbody tr')].map(r => ({ cells: [...r.cells].map(c => c.innerText), share: r.querySelector('.usage-share i').style.width, shareLabel: r.querySelector('.usage-share').getAttribute('aria-label') }))`,
  );
const chartCounts = async () =>
  (
    await ev(`[...${page}.querySelectorAll('.usage-bar')].map(r => r.getAttribute('aria-label'))`)
  ).map((text) => {
    const match = text.match(/: ([\d,]+) input, ([\d,]+) output, ([\d,]+) cache-read/);
    return match ? match.slice(1).map(number) : [0, 0, 0];
  });
const shot = async (name) => {
  const path = `${verifyOut}/usage-dashboard-${name}.png`;
  await wait('document.getAnimations().every(a => a.playState !== "running")');
  await b('screenshot', path);
  shots.push(path);
  await b('screenshot', `.impeccable/review/usage-dashboard-${name}.png`);
};
const openUsage = async () => {
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait(`document.activeElement?.id === 'settings-heading'`);
  await b('find', 'text', 'Usage', 'click', '--exact');
  await ready();
};
async function checkRange(name, from, to, unit) {
  await range(name);
  const events = saved.filter((e) => e.at >= +from && e.at < +to),
    expected = sum(events);
  const summary = await ev(`${page}.querySelector('.usage-total').textContent`);
  assert.ok(summary.startsWith(`${total(expected).toLocaleString()} tokens`), summary);
  assert.deepEqual(
    (await ev(`[...${page}.querySelectorAll('.usage-legend b')].map(b => b.textContent)`)).map(
      number,
    ),
    expected,
  );
  assert.match(
    await ev(`${page}.querySelector('.usage-legend').textContent`),
    new RegExp(`${events.length} calls`),
  );
  assert.equal(
    await ev(`${page}.querySelectorAll('[role=radiogroup][aria-label="Usage range"]').length`),
    1,
  );
  await select('Per period');
  const periods = await chartCounts();
  assert.deepEqual(
    periods.reduce((t, r) => t.map((v, i) => v + r[i]), [0, 0, 0]),
    expected,
    `${name}: period chart agrees`,
  );
  assert.equal(
    await ev(`${page}.querySelector('svg[role=group]').getAttribute('aria-label')`),
    `Per-period token usage by ${unit}. Use arrow keys to read each ${unit}.`,
  );
  await select('Cumulative');
  assert.deepEqual((await chartCounts()).at(-1), expected, `${name}: cumulative chart agrees`);
  for (const group of ['model', 'task']) {
    await select(group === 'model' ? 'By model' : 'By task');
    assert.equal(await ev(`${page}.querySelectorAll('.usage-breakdown table').length`), 1);
    assert.equal(
      await ev(`${page}.querySelector('.usage-breakdown th').textContent`),
      group === 'model' ? 'Model' : 'Task',
    );
    const rows = await tableRows();
    assert.deepEqual(
      rows.reduce((t, r) => t.map((v, i) => v + number(r.cells[i + 1])), [0, 0, 0]),
      expected,
      `${name}: ${group} breakdown agrees`,
    );
    assert.equal(
      rows.reduce((t, r) => t + number(r.cells[5].split('\n')[0]), 0),
      events.length,
      'Calls includes unreported attempts',
    );
    for (const row of rows) {
      const share = total(expected) ? (number(row.cells[4]) / total(expected)) * 100 : 0;
      assert.ok(
        Math.abs(parseFloat(row.share) - share) < 0.001,
        `${name}: share of reported tokens for ${row.cells[0]}`,
      );
      assert.match(row.shareLabel, /% of reported tokens$/);
      if (row.cells[4] === '—') {
        assert.deepEqual(row.cells.slice(1, 5), ['—', '—', '—', '—']);
        assert.match(row.cells[5], /unreported/);
        assert.equal(parseFloat(row.share), 0);
      }
    }
  }
  step(
    `${name}: total, split, per-${unit}/cumulative chart and both breakdowns agree; shares and unreported calls checked`,
  );
}
try {
  mkdirSync('.impeccable/review', { recursive: true });
  await b('set', 'viewport', '1400', '900');
  await b('open', origin);
  await openUsage();
  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`);
    await b('reload');
    await openUsage();
    await wait(`document.documentElement.getAttribute('data-theme') === '${mode}'`);
    for (const args of ranges) await checkRange(...args);
    await select('By model');
    const models = (await tableRows()).map((r) => r.cells[0]).join('\n');
    for (const text of [
      'sonnet (Claude)',
      'haiku (Claude)',
      'gpt-5 (Codex)',
      'qwen3:32b (Local llama)',
      'Unknown model (saved before attribution)',
    ])
      assert.ok(models.includes(text), text);
    await select('By task');
    const tasks = await tableRows();
    for (const text of [
      'Chat replies',
      'Suggestions',
      'Context preparation',
      'Visuals and diagrams',
      'Videos',
    ])
      assert.ok(
        tasks.some((r) => r.cells[0] === text),
        text,
      );
    assert.deepEqual(tasks.find((r) => r.cells[0] === 'Videos').cells.slice(1, 5), [
      '—',
      '—',
      '—',
      '—',
    ]);
    await range('Year');
    await b('find', 'role', 'combobox', 'click', '--name', 'Year');
    await b('find', 'role', 'option', 'click', '--name', String(lastYear), '--exact');
    await ready();
    assert.ok(
      (await ev(`${page}.querySelector('.usage-total').textContent`)).startsWith('8,550 tokens'),
    );
    assert.equal(await ev(`${page}.querySelectorAll('.usage-bar').length`), 12);
    await b('find', 'text', 'Values for each month', 'click');
    await wait(`${page}.querySelector('table[aria-label="Values for each month"]')`);
    assert.match(
      await ev(`${page}.querySelector('table[aria-label="Values for each month"]').innerText`),
      new RegExp(`Dec ${lastYear}`),
    );
    await b('find', 'text', 'Values for each month', 'click');
    step(
      `${mode}: named endpoint labels, all five tasks, selected previous year and exact-value table`,
    );
    await range('Month');
    await select('Per period');
    await select('By model');
    await ev(`${page}.querySelector('.usage-bar[tabindex="0"]').focus(); true`);
    await b('press', 'End');
    const last = await ev('document.activeElement.getAttribute("aria-label")');
    await b('press', 'Home');
    assert.notEqual(await ev('document.activeElement.getAttribute("aria-label")'), last);
    await b('press', 'ArrowRight');
    await b('press', 'ArrowLeft');
    assert.equal(await ev(`document.activeElement.matches('.usage-bar:focus-visible')`), true);
    await b('hover', `.usage-bar:nth-of-type(${now.getDate()})`);
    assert.match(
      await ev(`${page}.querySelector('.usage-readout').textContent`),
      /without reported counts/,
    );
    const colors = await ev(
      `[...${page}.querySelectorAll('.usage-swatch')].map(s => getComputedStyle(s).backgroundColor)`,
    );
    assert.equal(new Set(colors).size, 3);
    const fills = await ev(
      `[...${page}.querySelectorAll('.usage-bar rect[data-series]')].map(s => getComputedStyle(s).fill)`,
    );
    assert.equal(new Set(fills).size, 3);
    assert.ok(
      fills.every((c) => colors.includes(c)),
      'chart uses split/legend colours',
    );
    await ev(
      `document.getElementById('settings-heading').scrollIntoView(); document.activeElement.blur(); true`,
    );
    assert.equal(
      await ev(
        `${page}.querySelector('.usage-breakdown .astryx-table-scroll-wrapper').scrollWidth > ${page}.querySelector('.usage-breakdown .astryx-table-scroll-wrapper').clientWidth + 1`,
      ),
      false,
      'desktop table shows all columns',
    );
    await shot(`month-${mode}`);
    await ev(`${page}.querySelector('.usage-breakdown').scrollIntoView(); true`);
    await shot(`breakdown-${mode}`);
    await b('set', 'viewport', '390', '844');
    assert.equal(
      await ev(`${page}.scrollWidth > ${page}.clientWidth + 1`),
      false,
      'narrow page has no horizontal overflow',
    );
    await ev(`document.getElementById('settings-heading').scrollIntoView(); true`);
    await shot(`mobile-${mode}`);
    await ev(`${page}.querySelector('.usage-breakdown').scrollIntoView(); true`);
    await shot(`mobile-breakdown-${mode}`);
    assert.equal(
      await ev(`${page}.querySelector('.usage-breakdown .astryx-table-scroll-wrapper')?.tabIndex`),
      0,
      'overflowing table is keyboard scrollable',
    );
    step(
      `${mode}: keyboard and hover readouts, legend colours, desktop/narrow captures and keyboard table scrolling`,
    );
    await b('set', 'viewport', '1400', '900');
  }
  // Hold one range response; a newer selection must replace it without showing mixed-range numbers.
  await ev(
    `window.usageFetch = window.fetch; window.holdUsage = true; window.fetch = async (...args) => { const response = await window.usageFetch(...args); if (String(args[0]).includes('/api/usage') && window.holdUsage) { window.holdUsage = false; await new Promise(resolve => { window.releaseUsage = resolve; }); } return response; }; true`,
  );
  await select('Today');
  await wait('window.releaseUsage');
  assert.equal(
    await ev(
      `${page}.querySelector('.usage-total') === null && ${dashboard}.getAttribute('aria-busy') === 'true'`,
    ),
    true,
    'old totals hidden while loading',
  );
  await range('All time');
  await ev('window.releaseUsage(); window.fetch = window.usageFetch; true');
  await ready();
  assert.ok(
    (await ev(`${page}.querySelector('.usage-total').textContent`)).startsWith('11,620 tokens'),
  );
  step('Delayed range response: old totals hidden; newer selection wins');
  store.db.exec('DELETE FROM usage_events');
  store.record(
    'chat:unreported',
    'chat',
    { provider: 'openai:local', model: 'qwen3:32b' },
    null,
    +now,
  );
  await range('Today');
  assert.ok((await ev(`${page}.querySelector('.usage-total').textContent`)).startsWith('— tokens'));
  assert.deepEqual((await tableRows())[0].cells.slice(1, 5), ['—', '—', '—', '—']);
  assert.equal(
    await ev(`${page}.querySelectorAll('.usage-bar rect[data-series]').length`),
    0,
    'no estimated bars',
  );
  assert.match(
    (
      await ev(`[...${page}.querySelectorAll('.usage-bar')].map(r => r.getAttribute('aria-label'))`)
    ).join('\n'),
    /Token counts not reported; 1 call, 1 without reported counts/,
  );
  step('Unreported-only range: dash total/split/row, zero reported share, no estimated chart bars');
  store.db.exec('DELETE FROM usage_events');
  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`);
    await b('reload');
    await openUsage();
    await wait(`${page}.querySelector('.usage-empty')`);
    assert.ok(
      (await ev(`${page}.querySelector('.usage-total').textContent`)).startsWith('0 tokens'),
    );
    await shot(`empty-${mode}`);
  }
  assert.equal(calls, 0, 'viewing usage made no model calls');
  step('Empty ranges show zero and no-usage state in both appearances; no provider calls');
  writeFileSync(
    `${verifyOut}/usage-dashboard.json`,
    JSON.stringify(
      {
        issue: 'TreeTutor-2li.11',
        checkedAt: new Date().toISOString(),
        evidence:
          'Production build, real app HTTP/SQLite with seeded usage records and fake providers, agent-browser Chromium. No live provider authentication or inference.',
        steps,
        screenshots: shots,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ pass: true, checks: steps.length }));
} catch (e) {
  console.error(steps);
  throw e;
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
