import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
// Fixture provider only: checks expand/collapse/back interaction, not live Codex behavior.
const exec = promisify(execFile),
  session = `expand-${process.pid}`;
const browser = async (...args) =>
  (await exec('agent-browser', ['--session', session, ...args])).stdout;
const evalBrowser = async (code) => JSON.parse(await browser('eval', code, '--json')).data.result;
const wait = (code) => browser('wait', '--fn', code);
const click = (name) => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'expand-')), 'trees.sqlite'));
const root = store.create('Root');
const source = store.message(root.id, 'assistant', 'Roots exchange nutrients.', 'completed');
const a = store.branch(
  root,
  { messageId: source, start: 0, end: 5, text: 'Roots', question: 'Branch A' },
  'Fixed context',
);
let turn;
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    generate: (tree, text, emit) =>
      new Promise((resolve) => {
        turn = { emit, resolve };
        emit({ type: 'item', item: 'reply', text: 'Partial reply' });
      }),
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const settled = () =>
  wait(
    "new Promise(r => { const v = () => document.querySelector('.react-flow__viewport')?.style.transform, a = v(); requestAnimationFrame(() => requestAnimationFrame(() => r(a === v()))); })",
  );
const view = () => evalBrowser('document.querySelector(".react-flow__viewport").style.transform');
const display = (sel) =>
  evalBrowser(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).display`);
const focused = () =>
  evalBrowser(
    'document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim() || document.activeElement?.id',
  );
const draft = () =>
  evalBrowser('document.querySelector(".focused-chat [role=textbox]")?.textContent');
const transitions = () => evalBrowser('window.transitions');
try {
  await browser('set', 'viewport', '1440', '900');
  await browser('open', `http://127.0.0.1:${app.server.address().port}`);
  await browser('set', 'media', 'light', 'reduced-motion');
  await browser('wait', '[aria-label="Open Branch A"]');
  await evalBrowser(
    'window.transitions=0; const s=document.startViewTransition?.bind(document); if (s) document.startViewTransition = cb => { window.transitions++; return s(cb); }; true',
  );
  await settled();
  await click('Open Branch A');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Branch A'`);
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Live question');
  await click('Send');
  await browser('wait', '--text', 'Partial reply');
  await settled();
  await browser('focus', '.tree-canvas');
  await browser('press', 'ArrowRight');
  await browser('press', 'ArrowDown');
  await click('Zoom in');
  await settled();
  const mapView = await view();
  // Expand to the full workspace: map hidden, chat fills it, focus stays on the toggle.
  await browser('focus', '.expand-chat');
  await browser('press', 'Enter');
  assert.equal(await display('.overview'), 'none');
  assert.equal(
    await evalBrowser(
      'Math.abs(document.querySelector(".focused-chat").getBoundingClientRect().width - document.querySelector(".reading-workspace").getBoundingClientRect().width) < 2',
    ),
    true,
  );
  assert.equal(await focused(), 'Show map beside chat');
  assert.equal(await transitions(), 0, 'reduced motion: no view transition');
  // Resize narrow and back while expanded with a live reply and a draft.
  await browser('set', 'viewport', '390', '844');
  assert.equal(await display('.focused-chat'), 'flex');
  assert.equal(await display('.expand-chat'), 'none', 'narrow: chat already fills workspace');
  turn.emit({ type: 'item', item: 'reply', text: 'Partial reply grows' });
  await browser('wait', '--text', 'Partial reply grows');
  await browser('set', 'viewport', '1440', '900');
  assert.equal(await display('.overview'), 'none', 'still expanded after resize');
  assert.equal(
    await evalBrowser(
      'document.querySelector(".focused-chat").innerText.includes("Partial reply grows")',
    ),
    true,
  );
  // Collapse back beside: map returns at the exact prior pan/zoom.
  await click('Show map beside chat');
  assert.equal(await display('.overview'), 'flex');
  await settled();
  assert.equal(await view(), mapView);
  assert.equal(await focused(), 'Expand chat');
  // Expand then back to map: chat hides, map view intact, focus returns to the conversation box.
  await click('Expand chat');
  await click('Return to tree');
  assert.equal(await display('.focused-chat'), 'none');
  await settled();
  assert.equal(await view(), mapView);
  await wait(`document.activeElement?.id === 'open-${a.id}'`);
  turn.emit({ type: 'item', item: 'reply', text: 'Complete reply' });
  turn.emit({ type: 'status', status: 'completed' });
  turn.resolve();
  await click('Reopen chat');
  await browser('wait', '--text', 'Complete reply');
  assert.equal(await display('.overview'), 'flex', 'reopen returns to side-by-side, not expanded');
  // Draft survives expand and resize too.
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Next draft');
  await click('Expand chat');
  await browser('set', 'viewport', '390', '844');
  assert.equal(await draft(), 'Next draft');
  await browser('set', 'viewport', '1440', '900');
  assert.equal(await draft(), 'Next draft');
  await click('Show map beside chat');
  await settled();
  assert.equal(await view(), mapView);
  // Narrow: chat covers workspace; back returns to map with focus on the box and same view.
  await browser('set', 'viewport', '390', '844');
  assert.equal(await display('.overview'), 'none');
  await click('Return to tree');
  assert.equal(await display('.overview'), 'flex');
  await wait(`document.activeElement?.id === 'open-${a.id}'`);
  await click('Reopen chat');
  assert.equal(await display('.overview'), 'none');
  await browser('set', 'viewport', '1440', '900');
  await settled();
  assert.equal(await view(), mapView);
  // Motion allowed: expand uses a view transition when the browser has one.
  await browser('set', 'media', 'light');
  const supported = await evalBrowser('!!document.startViewTransition');
  await click('Expand chat');
  await wait(
    "getComputedStyle(document.querySelector('.overview')).display === 'none' && !document.documentElement.matches(':active-view-transition')",
  );
  if (supported) assert.equal(await transitions(), 1);
  else console.log('NOTE: browser lacks View Transitions; state change is instant.');
  await click('Show map beside chat');
  await settled();
  assert.equal(await view(), mapView);
  console.log(
    `PASS: expand/collapse/back at 1440 and 390, resize with draft and live reply, exact map view restored, focus restored, reduced motion skips transitions (view transitions supported: ${supported}).`,
  );
} finally {
  turn?.resolve();
  await browser('close').catch(() => {});
  while (app.active.size) await new Promise((resolve) => setTimeout(resolve, 20));
  app.stop();
  store.close();
}
