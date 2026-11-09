import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutSaver, LAYOUT_SAVE_MS } from '../src/layoutSave.ts';

// Controlled clock: timers only fire when the test advances them.
function clock() {
  const timers = new Map(); let next = 0, now = 0;
  return {
    timers: { set: (fn, ms) => { timers.set(++next, { fn, at: now + ms }); return next; }, clear: id => timers.delete(id) },
    count: () => timers.size,
    async advance(ms) {
      now += ms;
      for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

test('many interactions within a minute coalesce into one batch per root; idle writes nothing', async () => {
  const c = clock(), writes = [], reports = [];
  const saver = layoutSaver(async (root, batch) => { writes.push([root, structuredClone(batch)]); }, f => reports.push(f), c.timers);
  await c.advance(5 * LAYOUT_SAVE_MS);
  assert.equal(writes.length, 0, 'no idle writes');
  assert.equal(c.count(), 0, 'no timer while clean');
  for (let i = 0; i < 40; i++) saver.mark('a', { folded: [], selected: 'a', panel: 'collapsed', viewport: { x: i, y: 0, zoom: 1 } }, { [`n${i % 4}`]: { x: i, y: i } });
  saver.mark('b', { folded: ['b'], selected: 'b', panel: 'beside' });
  saver.mark('a', { folded: ['a'], selected: 'a', panel: 'beside', viewport: { x: 39, y: 0, zoom: 1 } });
  assert.equal(c.count(), 1, 'one timer no matter how many interactions');
  await c.advance(LAYOUT_SAVE_MS - 1);
  assert.equal(writes.length, 0);
  await c.advance(1);
  assert.deepEqual(writes, [
    ['a', { layout: { folded: ['a'], selected: 'a', panel: 'beside', viewport: { x: 39, y: 0, zoom: 1 } }, positions: { n0: { x: 36, y: 36 }, n1: { x: 37, y: 37 }, n2: { x: 38, y: 38 }, n3: { x: 39, y: 39 } } }],
    ['b', { layout: { folded: ['b'], selected: 'b', panel: 'beside' }, positions: {} }],
  ], 'tree switching keeps each root\'s layout and positions with its owner');
  assert.deepEqual(reports, [false]);
  await c.advance(10 * LAYOUT_SAVE_MS);
  assert.equal(writes.length, 2, 'clean after the batch: no idle writes');
  assert.equal(c.count(), 0);
});

test('storage failure stays visible, keeps changes and retries next minute without a tight loop', async () => {
  const c = clock(), reports = []; let fail = true, calls = 0, last;
  const saver = layoutSaver(async (root, batch) => { calls++; if (fail) throw new Error('disk'); last = structuredClone(batch); }, f => reports.push(f), c.timers);
  saver.mark('a', { folded: [], selected: 'a', panel: 'beside' }, { a: { x: 1, y: 1 } });
  await c.advance(LAYOUT_SAVE_MS);
  assert.equal(calls, 1);
  assert.deepEqual(reports, [true], 'failure reported');
  await c.advance(LAYOUT_SAVE_MS - 1);
  assert.equal(calls, 1, 'no retry inside the minute');
  saver.mark('a', { folded: ['a'], selected: 'a', panel: 'beside' }, { b: { x: 2, y: 2 } });
  assert.equal(c.count(), 1, 'newer change joins the pending retry timer');
  fail = false;
  await saver.flush(); // manual retry
  assert.equal(calls, 2);
  assert.deepEqual(last, { layout: { folded: ['a'], selected: 'a', panel: 'beside' }, positions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } } }, 'failed batch merged under newer change');
  assert.deepEqual(reports, [true, false]);
  assert.equal(c.count(), 0);
});

test('remount disposes the old timer, so a new saver never doubles writes', async () => {
  const c = clock(), writes = [];
  const write = async root => { writes.push(root); };
  const first = layoutSaver(write, () => {}, c.timers);
  first.mark('a', { folded: [], selected: null, panel: 'collapsed' });
  first.dispose();
  const second = layoutSaver(write, () => {}, c.timers);
  second.mark('a', { folded: [], selected: null, panel: 'collapsed' });
  assert.equal(c.count(), 1);
  await c.advance(LAYOUT_SAVE_MS);
  assert.deepEqual(writes, ['a']);
  assert.equal(second.pending().size, 0);
});
