// Seeded store, app server and agent-browser helpers shared by verify-knowledge.mjs and verify-knowledge-map.mjs.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../../server/store.mjs';
import { createApp } from '../../../server/app.mjs';

const run = promisify(execFile),
  session = `knowledge-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const key = (name) => b('press', name);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-knowledge-')), 'data.sqlite'));
const root = store.create('Concurrency fixture');
const message = store.message(root.id, 'assistant', 'A mutex guards shared state.', 'completed');
const other = store.create('Other learning tree');
const second = store.message(
  other.id,
  'assistant',
  'Mutual exclusion protects shared state.',
  'completed',
);
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }] },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const knowledge = '.view-tabs button[aria-current=page]';
const openKnowledge = async () => {
  await reach('.view-tabs button:nth-child(3)');
  await key('Enter');
  await wait(`!document.querySelector('main[aria-label=Knowledge]').hidden`);
};
const returnToLearning = async () => {
  await reach('#return-to-learning');
  await key('Enter');
  await wait(`!document.querySelector('[aria-label="Learning workspace"]').hidden`);
};
async function reach(selector) {
  for (let i = 0; i < 60; i++) {
    if (await ev(`document.activeElement?.matches(${JSON.stringify(selector)})`)) return;
    await key('Tab');
  }
  throw new Error(`Tab did not reach ${selector}`);
}
const group = (name) => `[role=group][aria-label="Corrections for ${name}"]`;
const know = `${group('Mutex')} button:nth-of-type(1)`;
const unknown = `${group('Mutex')} button:nth-of-type(2)`;
const merge = `${group('Mutex')} button:nth-of-type(3)`;
const steps = [],
  shots = resolve('.impeccable/review');
mkdirSync(shots, { recursive: true });
const visibleTopicLabels = async () =>
  ev(`(() => {
  const points = [...document.querySelectorAll('.concept-point')].map(p => p.getBoundingClientRect());
  return [...document.querySelectorAll('[data-topic-label]')].map(e => {
    const r = e.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(e);
    const text = range.getBoundingClientRect(), region = [...document.querySelectorAll('[data-topic]')].find(t => t.dataset.topic === e.dataset.topicLabel).getBoundingClientRect();
    const node = e.firstChild, words = [...e.textContent.matchAll(/\\S+/g)].map(m => { const word = document.createRange(); word.setStart(node, m.index); word.setEnd(node, m.index + m[0].length); return word.getClientRects().length === 1; });
    return { name: e.textContent, visible: e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight && text.left >= r.left && text.right <= r.right && text.top >= r.top && text.bottom <= r.bottom, wordsIntact: words.every(Boolean), centred: Math.hypot(r.x + r.width / 2 - region.x - region.width / 2, r.y + r.height / 2 - region.y - region.height / 2) < 1, textScale: r.height / e.offsetHeight, clear: points.every(p => p.right <= r.left || p.left >= r.right || p.bottom <= r.top || p.top >= r.bottom) };
  });
})()`);
async function checkTopicLabels() {
  const labels = await visibleTopicLabels();
  for (const l of labels)
    assert.ok(
      l.visible && l.wordsIntact && l.centred && l.clear && Math.abs(l.textScale - 1) < 0.05,
      'full readable topic name centred and clear: ' + JSON.stringify(l),
    );
  return labels;
}

export {
  b,
  ev,
  wait,
  key,
  store,
  message,
  other,
  second,
  app,
  origin,
  knowledge,
  openKnowledge,
  returnToLearning,
  reach,
  group,
  know,
  unknown,
  merge,
  steps,
  shots,
  visibleTopicLabels,
  checkTopicLabels,
};
