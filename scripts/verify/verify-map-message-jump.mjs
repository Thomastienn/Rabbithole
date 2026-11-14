import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// Map bubble jump: built app, isolated store, no provider calls. Each bubble opens its message at the reading area top.
const run = promisify(execFile),
  session = `map-message-jump-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'map-message-jump-')), 'data.sqlite'));
const tree = store.create('Roots tree');
const long = (topic) =>
  Array.from(
    { length: 14 },
    (_, i) =>
      `Paragraph ${i + 1} about ${topic}: roots trade sugars for minerals with fungi across the soil.`,
  ).join('\n\n');
const texts = [
  'How do roots work?',
  long('uptake'),
  'What about fungi?',
  long('fungi'),
  'And water?',
  long('water'),
];
const ids = texts.map((text, i) =>
  store.message(tree.id, i % 2 ? 'assistant' : 'user', text, 'completed'),
);
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    generate: async () => {
      throw new Error('no provider calls expected');
    },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
// Offset of the message top from its scroll container's top; also checks it stays put a few frames later.
const offset = (id) =>
  ev(`(() => { const m = document.querySelector('.focused-chat [data-chat-message="${id}"]'); if (!m) return null;
  let s = m.parentElement; while (s && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement;
  return m.getBoundingClientRect().top - s.getBoundingClientRect().top; })()`);
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Roots tree"]');
  // Under parallel load the bubbles can render after the open control.
  await wait(
    `document.querySelectorAll('.conversation-box .node-bubble').length === ${texts.length}`,
  );
  const names = await ev(
    `[...document.querySelectorAll('.conversation-box .node-bubble')].map(e => e.tagName + ':' + e.getAttribute('aria-label'))`,
  );
  assert.equal(names.length, texts.length, 'one control per bubble');
  assert.ok(
    names.every((n) => n.startsWith('BUTTON:Jump to ')),
    names.join('\n'),
  );
  assert.equal(names[0], 'BUTTON:Jump to question: How do roots work?');
  assert.ok(
    names[1].startsWith('BUTTON:Jump to reply: Paragraph 1 about uptake') && names[1].endsWith('…'),
  );
  const results = [];
  // First by keyboard from the full map, then middle and last by pointer from the map beside the chat.
  for (const [index, how] of [
    [0, 'keyboard'],
    [3, 'click'],
    [5, 'click'],
    [2, 'keyboard'],
  ]) {
    const selector = `.conversation-box [data-message="${ids[index]}"] .node-bubble`;
    if (how === 'keyboard') {
      await ev(`document.querySelector('${selector}').focus(); true`);
      await b('press', 'Enter');
    } else await b('click', selector);
    await wait(`document.activeElement?.dataset?.chatMessage === '${ids[index]}'`);
    await wait(`new Promise(r => setTimeout(() => r(true), 400))`);
    const top = await offset(ids[index]);
    results.push(`message ${index + 1} (${how}) ${top.toFixed(1)} px`);
    assert.ok(
      Math.abs(top) <= 4,
      `message ${index + 1} top should sit at the reading area top, offset ${top}`,
    );
  }
  console.log(
    `PASS: ${names.length} bubbles are named buttons; ${results.join('; ')} from the reading area top.`,
  );
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
