import { test } from 'node:test';
import assert from 'node:assert/strict';
import { span, buckets, totals, breakdown } from '../src/usage/usage.ts';

const ev = (d, task = 'chat', counts = [10, 2, 5], model = 'm') => ({
  at: +d,
  provider: 'claude',
  model,
  task,
  input: counts?.[0] ?? null,
  output: counts?.[1] ?? null,
  cacheRead: counts?.[2] ?? null,
});

test('ranges follow the local calendar across year boundaries', () => {
  const now = new Date(2026, 0, 2, 9); // Friday 2 Jan 2026
  const week = span('week', now, 2026, null);
  assert.deepEqual(
    [week.from, week.to, week.unit],
    [new Date(2025, 11, 29), new Date(2026, 0, 5), 'day'],
  );
  assert.deepEqual(span('today', now, 2026, null), {
    from: new Date(2026, 0, 2),
    to: new Date(2026, 0, 3),
    unit: 'hour',
  });
  assert.deepEqual(span('month', now, 2026, null), {
    from: new Date(2026, 0, 1),
    to: new Date(2026, 1, 1),
    unit: 'day',
  });
  assert.deepEqual(span('year', now, 2025, null), {
    from: new Date(2025, 0, 1),
    to: new Date(2026, 0, 1),
    unit: 'month',
  });
  assert.deepEqual(span('all', now, 2026, +new Date(2025, 10, 15)), {
    from: new Date(2025, 10, 1),
    to: new Date(2026, 1, 1),
    unit: 'month',
  });
  assert.deepEqual(span('all', now, 2026, +new Date(2022, 5, 1)), {
    from: new Date(2022, 0, 1),
    to: new Date(2027, 0, 1),
    unit: 'year',
  });

  const events = [
    ev(new Date(2025, 11, 31, 23, 59)),
    ev(new Date(2026, 0, 1, 0, 0)),
    ev(new Date(2026, 0, 1, 12), 'suggestions', null),
  ];
  const rows = buckets(events, week);
  assert.equal(rows.length, 7);
  assert.deepEqual(
    rows.slice(2, 4).map((r) => [r.start.getDate(), r.input, r.calls, r.unavailable]),
    [
      [31, 10, 1, 0],
      [1, 10, 1, 1],
    ],
  );
  assert.deepEqual(buckets(events, week, true).at(-1), {
    ...rows.at(-1),
    input: 20,
    output: 4,
    cacheRead: 10,
    calls: 2,
    unavailable: 1,
  });
  assert.equal(
    buckets(events, span('year', now, 2025, null)).reduce((n, r) => n + r.calls, 0),
    1,
    'New Year’s Eve stays in 2025',
  );
});

test('unavailable counts are never estimated and breakdowns group exact totals', () => {
  const events = [
    ev(1, 'chat', [1, 2, 3], 'a'),
    ev(2, 'suggestions', [4, 5, 6], 'b'),
    ev(3, 'chat', null, 'a'),
  ];
  assert.deepEqual(totals(events), { input: 5, output: 7, cacheRead: 9, calls: 2, unavailable: 1 });
  assert.deepEqual(
    breakdown(events, (e) => e.task).map((r) => [r.name, r.total, r.unavailable]),
    [
      ['suggestions', 15, 0],
      ['chat', 6, 1],
    ],
  );
});
