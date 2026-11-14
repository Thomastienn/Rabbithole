// Built-app keyboard/responsive fixture over local SQLite and an in-process provider; no live model calls.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
  session = `passage-corrections-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const key = (name) => b('press', name);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
async function reach(selector) {
  for (let i = 0; i < 40; i++) {
    if (await ev(`document.activeElement?.matches(${JSON.stringify(selector)})`)) return;
    await key('Tab');
  }
  throw new Error(`Tab did not reach ${selector}`);
}
const store = new Store(
  join(mkdtempSync(join(tmpdir(), 'tt-passage-corrections-')), 'data.sqlite'),
);
const text = 'A mutex guards shared state.';
const root = store.create('Passage corrections fixture');
const reply = store.message(root.id, 'assistant', text, 'completed');
const graph = {
  concepts: [
    { name: 'Mutual exclusion', topics: ['Concurrency'] },
    { name: 'Shared state', topics: ['Concurrency'] },
  ],
  links: [],
};
const passages = [
  { start: 2, end: 7, text: 'mutex', concept: 'Mutual exclusion' },
  { start: 15, end: 27, text: 'shared state' },
];
store.addGraph(graph, reply);
store.pendingSuggestions(root.id, reply);
store.finishSuggestions(root.id, reply, passages, null);
const inputs = [];
const provider = {
  models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
  generate: async (tree, input, emit) => {
    const suggesting = tree.instructions?.startsWith('You mark');
    if (suggesting) inputs.push(JSON.parse(input.slice(input.indexOf('\n') + 1)));
    emit({
      type: 'item',
      item: 'one',
      text: suggesting
        ? JSON.stringify({ ...graph, suggestions: passages })
        : input.startsWith('Compact only facts')
          ? 'Fixture inherited context'
          : text,
    });
    emit({ type: 'status', status: 'completed' });
  },
};
const app = createApp({
  store,
  provider,
  suggestions: true,
  auth: { status: () => ({ connected: true }) },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const get = async (path) => (await fetch(origin + path)).json();
const { csrf } = await get('/api/state');
const post = (path, body) =>
  fetch(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
    body: JSON.stringify(body),
  });
const concept = async () =>
  (await get('/api/graph')).concepts.find((c) => c.name === 'Mutual exclusion');
const stop = (word) =>
  `[...document.querySelectorAll('.focused-chat u.suggestion[tabindex]')].find(u => u.textContent === ${JSON.stringify(word)})`;
// Corrections live in the popup's familiarity overflow menu.
const trigger = '.branch-form [aria-label="Familiarity options for Mutual exclusion"]';
const menuOpen = `[...document.querySelectorAll('[role=menu]')].some(m => m.checkVisibility())`;
const item = (label) =>
  `[...document.querySelectorAll('[role=menu] [role=menuitemradio]')].find(m => m.checkVisibility() && m.textContent.includes(${JSON.stringify(label)}))`;
async function openMenu() {
  await ev(`document.querySelector(${JSON.stringify(trigger)}).focus(); true`);
  await key('Enter');
  await wait(item('I know this'));
}
async function closeMenu() {
  if (await ev(menuOpen)) {
    await key('Escape');
    await wait(`!(${menuOpen})`);
  }
}
async function checked(label) {
  await openMenu();
  const on = await ev(`${item(label)}.getAttribute('aria-checked') === 'true'`);
  await closeMenu();
  return on;
}
async function choose(label) {
  await openMenu();
  await b('find', 'role', 'menuitemradio', 'click', '--name', label, '--exact');
  await closeMenu();
}
const know = 'I know this',
  unknown = "I don't get this";
const steps = [],
  shots = resolve('.impeccable/review');
mkdirSync(shots, { recursive: true });
try {
  await b('set', 'viewport', '1440', '1000');
  await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Passage corrections fixture"]');
  await click('Open Passage corrections fixture');
  await wait(stop('mutex'));
  await ev(`${stop('mutex')}.focus(); true`);
  await key('Enter');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  await b('keyboard', 'type', 'explain');
  await reach(trigger);
  assert.equal(
    await ev(
      `document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none'`,
    ),
    true,
  );
  await key('Enter');
  await wait(item(know));
  assert.ok(await ev(`!!${item(unknown)}`), 'the overflow offers both concept corrections');
  await key('Enter');
  await wait(
    `document.querySelector('.branch-form .correction-status')?.textContent.includes('marked as known')`,
  );
  await closeMenu();
  assert.deepEqual([(await concept()).correction, (await concept()).familiarity], ['known', 1]);
  assert.equal(await ev(`document.querySelector('.branch-form input').value`), 'explain');
  assert.equal(
    await ev(`document.activeElement.matches(${JSON.stringify(trigger)})`),
    true,
    'closing the menu returns focus to its trigger',
  );
  assert.equal(store.list().length, 1, 'correcting never submits the branch form');
  assert.equal(inputs.length, 0, 'correcting never runs a model or regenerates saved underlines');
  steps.push(
    'Tagged underline targets Mutual exclusion rather than the passage wording mutex; Enter on the overflow item saves known, retains prompt/focus and creates no branch or model call',
  );

  await key('Escape');
  await wait(
    `!document.querySelector('.branch-form') && document.activeElement === ${stop('mutex')}`,
  );
  await key('Enter');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  assert.equal(await checked(know), true);
  assert.equal(await ev(`document.querySelector('.branch-form input').value`), '');
  store.db.exec(
    "CREATE TRIGGER reject_correction BEFORE INSERT ON evidence WHEN NEW.kind IN ('known','unknown') BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;",
  );
  await choose(unknown);
  await wait(`document.querySelector('.branch-form [role=alert]')`);
  assert.equal((await concept()).correction, 'known');
  assert.equal(await checked(unknown), false);
  store.db.exec('DROP TRIGGER reject_correction');
  await openMenu();
  await ev(`${item(unknown)}.focus(); true`);
  await key('Space');
  await closeMenu();
  await wait(
    `document.querySelector('.branch-form .correction-status')?.textContent.includes('not understood')`,
  );
  assert.deepEqual([(await concept()).correction, (await concept()).familiarity], ['unknown', 0]);
  await ev(`document.querySelector('.branch-form input').focus(); true`);
  await key('Escape');
  await wait(`document.activeElement === ${stop('mutex')}`);
  steps.push(
    'Reopening loads the saved correction; failed storage write leaves a visible error and retry; Space saves unknown; Escape returns focus to the underline',
  );

  await click('Knowledge');
  await b('wait', '--text', 'You marked this as not understood');
  assert.equal(
    await ev(
      `document.querySelector('.knowledge-panel [aria-label="Corrections for Mutual exclusion"] button:nth-of-type(2)').getAttribute('aria-pressed')`,
    ),
    'true',
  );
  await click('Return to learning tree');
  await wait(stop('mutex'));
  await ev(`${stop('mutex')}.focus(); true`);
  await key('Enter');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  await choose(know);
  await wait(
    `document.querySelector('.branch-form .correction-status')?.textContent.includes('marked as known')`,
  );
  await ev(`document.querySelector('.branch-form input').focus(); true`);
  await key('Escape');
  await click('Knowledge');
  await b('wait', '--text', 'You marked this as known');
  steps.push(
    'Both passage corrections appear in Knowledge with the same pressed state and familiarity',
  );

  // Exercise the next suggestion request through the HTTP seam, including extra inferred evidence.
  for (const [kind, value] of [
    ['known', 1],
    ['unknown', 0],
  ]) {
    if (kind === 'unknown') {
      await click('Return to learning tree');
      await ev(`${stop('mutex')}.focus(); true`);
      await key('Enter');
      await wait(`document.activeElement?.matches('.branch-form input')`);
      await choose(unknown);
      await wait(
        `document.querySelector('.branch-form .correction-status')?.textContent.includes('not understood')`,
      );
      await ev(`document.querySelector('.branch-form input').focus(); true`);
      await key('Escape');
    }
    await (await post(`/api/trees/${root.id}/messages`, { text: 'Mutual exclusion again' })).text();
    assert.equal(inputs.at(-1).familiarity['Mutual exclusion'], value);
    assert.equal(
      (await concept()).familiarity,
      value,
      'new use/met/ignored evidence never overrides a correction',
    );
  }
  steps.push(
    'The next suggestion calls receive known=1 and unknown=0 despite further inferred evidence',
  );

  // A manual passage, or an underline without a concept tag, must not guess which concept to correct.
  await ev(`${stop('shared state')}.focus(); true`);
  await key('Enter');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  assert.equal(await ev(`document.querySelectorAll(${JSON.stringify(trigger)}).length`), 0);
  await key('Escape');
  await reach('button.focus-reveal');
  await key('Enter');
  await b('wait', 'textarea[readonly]');
  await ev(
    `(() => { const input = document.querySelector('textarea[readonly]'); input.focus(); input.setSelectionRange(2, 7); input.dispatchEvent(new Event('select', { bubbles: true })); return true; })()`,
  );
  await reach('.passage button');
  await click('Ask about selection');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  assert.equal(await ev(`document.querySelectorAll(${JSON.stringify(trigger)}).length`), 0);
  await key('Escape');
  await click('Close passage selection');
  steps.push(
    'Untagged underlines and manual passages keep branching controls without guessed corrections',
  );

  await b('reload');
  await b('wait', '[aria-label="Open Passage corrections fixture"]');
  await click('Open Passage corrections fixture');
  await wait(stop('mutex'));
  await ev(`${stop('mutex')}.focus(); true`);
  await key('Enter');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  assert.equal(await checked(unknown), true);
  await ev(`document.querySelector('.branch-form input').focus(); true`);
  for (const [width, height, name] of [
    [1440, 1000, 'desktop'],
    [390, 844, 'mobile'],
  ]) {
    await b('set', 'viewport', String(width), String(height));
    await b('screenshot', join(shots, `passage-corrections-${name}.png`));
    const sizes = await ev(
      `(() => { const box = document.querySelector('.passage-box').getBoundingClientRect(); return { width: innerWidth, height: innerHeight, document: document.documentElement.scrollWidth, box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom } }; })()`,
    );
    assert.ok(
      sizes.document <= sizes.width &&
        sizes.box.left >= 0 &&
        sizes.box.right <= sizes.width &&
        sizes.box.top >= 0 &&
        sizes.box.bottom <= sizes.height,
      'passage controls fit the viewport: ' + JSON.stringify(sizes),
    );
  }
  steps.push(
    'Saved correction survives reload; desktop and mobile passage controls fit the viewport',
  );

  // The corrected passage can still branch, and the same controls work in its child conversation.
  await b('keyboard', 'type', 'explain');
  await key('Enter');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === 'explain' && ${stop('mutex')}`,
  );
  const child = store.list().find((t) => t.parent === root.id);
  const saved = await get(`/api/trees/${child.id}`);
  assert.deepEqual([saved.branch.text, saved.branch.question], ['mutex', 'explain']);
  await ev(`${stop('mutex')}.focus(); true`);
  await key('Enter');
  await wait(`document.activeElement?.matches('.branch-form input')`);
  assert.equal(await checked(unknown), true);
  await choose(know);
  await wait(
    `document.querySelector('.branch-form .correction-status')?.textContent.includes('marked as known')`,
  );
  assert.equal((await concept()).correction, 'known');
  await ev(`document.querySelector('.branch-form input').focus(); true`);
  await key('Escape');
  await wait(
    `!document.querySelector('.branch-form') && document.activeElement === ${stop('mutex')}`,
  );
  steps.push(
    'Enter still branches from the corrected textbox with the exact passage; child corrections reuse the global concept; Escape returns focus to its underline',
  );
  console.log(JSON.stringify({ pass: true, steps }, null, 2));
} catch (error) {
  console.error({ steps, snapshot: await b('snapshot', '-i').catch(() => '') });
  throw error;
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
