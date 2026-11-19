import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { default: UsageDashboard } = await import('../../src/usage/UsageDashboard.tsx');

const now = new Date(2026, 2, 15, 12);
const ev = (at, task, provider, model, counts) => ({
  at: +at,
  task,
  provider,
  model,
  input: counts?.[0] ?? null,
  output: counts?.[1] ?? null,
  cacheRead: counts?.[2] ?? null,
});
const events = [
  { ...ev(+now - 1000, 'chat', 'claude', 'sonnet', [1200, 300, 800]), reasoning: 120 },
  ev(+now - 900, 'suggestions', 'claude', 'haiku', [200, 50, 0]),
  ev(+now - 800, 'chat', 'codex', 'gpt-5', null),
  ev(+now - 700, 'chat', 'openai:local', 'qwen3:32b', null),
  ev(new Date(2026, 2, 1), 'chat', 'claude', 'sonnet', [400, 40, 80]),
  ev(new Date(2025, 11, 31, 23, 30), 'chat', null, null, [5000, 1000, 2000]),
  ev(new Date(2025, 5, 1), 'compaction', 'claude', 'haiku', [100, 20, 0]),
  ev(new Date(2025, 5, 1), 'diagram', 'claude', 'sonnet', [300, 80, 50]),
  ev(new Date(2025, 5, 1), 'video', 'codex', 'gpt-5', null),
];
const providers = {
  claude: { label: 'Claude' },
  codex: { label: 'Codex' },
  'openai:local': { label: 'Local llama' },
};
// Serves saved records like GET /api/usage (range filtering is tested in usage-history.test.mjs).
const serve = (list, hold) => async (path) => {
  const q = new URL(path, 'http://x').searchParams;
  const from = Number(q.get('from') ?? -Infinity),
    to = Number(q.get('to') ?? Infinity);
  await hold?.(path);
  return {
    first: list.length ? Math.min(...list.map((e) => e.at)) : null,
    events: list.filter((e) => e.at >= from && e.at < to),
  };
};

async function mount(t, api) {
  let dom;
  const view = await render(h(UsageDashboard, { api, providers }), (w) => {
    dom = ui(w);
  });
  t.after(view.cleanup);
  const { container, act } = view;
  const settle = () => act(async () => dom.frames());
  await settle();
  const radio = (name) =>
    act(async () =>
      [...container.querySelectorAll('[role=radio]')]
        .find((e) => e.textContent.trim() === name)
        .click(),
    );
  const text = (selector) => container.querySelector(selector)?.textContent;
  const rows = () =>
    [...container.querySelectorAll('.usage-breakdown tbody tr')].map((r) => ({
      cells: [...r.cells].map((c) => c.textContent),
      share: r.querySelector('.usage-share').getAttribute('aria-label'),
    }));
  const bars = () => [...container.querySelectorAll('.usage-bar')];
  return { container, act, settle, radio, text, rows, bars, dom };
}

test('usage dashboard totals, charts and breakdowns agree, never estimate unreported calls, and read bars by keyboard', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const u = await mount(t, serve(events));
  const { container, act, radio, text, rows, bars } = u;
  assert.equal(container.querySelector('.usage-dashboard').getAttribute('aria-busy'), 'false');
  assert.match(text('.usage-total'), /^3,070 tokens in March/);
  assert.deepEqual(
    [...container.querySelectorAll('.usage-legend b')].map((b) => b.textContent),
    ['1,800', '390', '880'],
  );
  assert.match(text('.usage-legend'), /390 output \(120 reasoning\)/);
  assert.match(text('.usage-legend'), /5 calls, 2 without reported counts/);
  assert.equal(
    container.querySelector('svg[role=group]').getAttribute('aria-label'),
    'Per-period token usage by day. Use arrow keys to read each day.',
  );
  assert.equal(bars().length, 31);
  assert.match(bars()[14].getAttribute('aria-label'), /2 without reported counts/);
  await radio('Cumulative');
  assert.match(
    bars().at(-1).getAttribute('aria-label'),
    /1,800 input, 390 output \(120 reasoning\), 880 cache-read tokens \(3,070 total\); 5 calls/,
  );

  const models = rows();
  assert.deepEqual(
    models.map((r) => r.cells[0]),
    ['sonnet (Claude)', 'haiku (Claude)', 'gpt-5 (Codex)', 'qwen3:32b (Local llama)'],
  );
  assert.equal(models[0].share, '91.9% of reported tokens', '2,820 of 3,070');
  const unreported = models.find((r) => r.cells[0].startsWith('gpt-5'));
  assert.deepEqual(unreported.cells.slice(1, 5), ['—', '—', '—', '—']);
  assert.match(unreported.cells[5], /1 unreported/);
  assert.equal(unreported.share, '0% of reported tokens');
  await radio('By task');
  assert.deepEqual(
    rows().map((r) => r.cells[0]),
    ['Chat replies', 'Suggestions'],
  );

  // A previous year: twelve months, all five tasks, unattributed records named.
  await radio('Year');
  const year = container.querySelector('[role=combobox]');
  await act(async () => year.click());
  await u.settle();
  await act(async () =>
    [...document.querySelectorAll('[role=option]')].find((o) => o.textContent === '2025').click(),
  );
  await u.settle();
  assert.match(text('.usage-total'), /^8,550 tokens in 2025/);
  assert.equal(bars().length, 12);
  assert.deepEqual(
    rows()
      .map((r) => r.cells[0])
      .sort(),
    ['Chat replies', 'Context preparation', 'Videos', 'Visuals and diagrams'],
  );
  assert.deepEqual(
    rows()
      .find((r) => r.cells[0].startsWith('Videos'))
      .cells.slice(1, 5),
    ['—', '—', '—', '—'],
  );
  assert.match(
    container.querySelector('table[aria-label="Values for each month"]').textContent,
    /Dec 2025/,
  );
  await radio('By model');
  assert.ok(rows().some((r) => r.cells[0].startsWith('Unknown model (saved before attribution)')));

  // Arrow keys, Home and End move focus between bars and announce their values.
  await radio('Per period');
  const key = (target, k) =>
    act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
  await act(async () => container.querySelector('.usage-bar[tabindex="0"]').focus());
  await key(document.activeElement, 'End');
  assert.equal(document.activeElement, bars().at(-1));
  assert.match(text('.usage-readout'), /^Dec 2025: 5,000 input, 1,000 output, 2,000 cache-read/);
  await key(document.activeElement, 'Home');
  assert.equal(document.activeElement, bars()[0]);
  await key(document.activeElement, 'ArrowRight');
  assert.equal(document.activeElement, bars()[1]);
  assert.equal(bars()[1].getAttribute('tabindex'), '0');
});

test('a newer range replaces a slow response without showing the old totals', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now });
  let release;
  const holds = [];
  const u = await mount(
    t,
    serve(events, async (path) => {
      if (holds.push(path) === 2) await new Promise((r) => (release = r));
    }),
  );
  await u.radio('Today');
  assert.equal(u.text('.usage-total'), undefined, 'old totals hidden while loading');
  assert.equal(u.container.querySelector('.usage-dashboard').getAttribute('aria-busy'), 'true');
  await u.radio('All time');
  await u.act(async () => release());
  assert.match(u.text('.usage-total'), /^11,620 tokens all time/);
});

test('unreported-only ranges show dashes and no estimated bars', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const unreported = await mount(t, serve([ev(+now, 'chat', 'openai:local', 'qwen3:32b', null)]));
  await unreported.radio('Today');
  assert.match(unreported.text('.usage-total'), /^— tokens today/);
  assert.deepEqual(unreported.rows()[0].cells.slice(1, 5), ['—', '—', '—', '—']);
  assert.equal(unreported.container.querySelectorAll('.usage-bar rect[data-series]').length, 0);
  assert.ok(
    unreported
      .bars()
      .some((b) =>
        b
          .getAttribute('aria-label')
          .includes('Token counts not reported; 1 call, 1 without reported counts'),
      ),
  );
});
