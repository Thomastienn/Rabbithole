import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
// Fixture provider only: checks Contents collapse/reopen, persistence and the narrow drawer. Needs `npm run build`.
const exec = promisify(execFile),
  session = `contents-collapse-${process.pid}`;
const browser = async (...args) =>
  (await exec('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (code) => JSON.parse(await browser('eval', code, '--json')).data.result;
const wait = (code) => browser('wait', '--fn', code);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'contents-collapse-')), 'trees.sqlite'));
const root = store.create('Root');
const source = store.message(root.id, 'assistant', 'Roots exchange nutrients.', 'completed');
store.branch(
  root,
  { messageId: source, start: 0, end: 5, text: 'Roots', question: 'Branch A' },
  'Fixed context',
);
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: { generate: () => new Promise(() => {}) },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const width = (sel) =>
  ev(`document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect().width ?? 0`);
const focusedName = () => ev('document.activeElement?.getAttribute("aria-label")');
const expandedAttr = (sel) =>
  ev(`document.querySelector(${JSON.stringify(sel)})?.getAttribute('aria-expanded')`);
const openChat = async () => {
  await browser('wait', '[aria-label="Open Branch A"]');
  await browser('find', 'role', 'button', 'click', '--name', 'Open Branch A', '--exact');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Branch A'`);
};
try {
  await browser('set', 'viewport', '1440', '900');
  await browser('open', `http://127.0.0.1:${app.server.address().port}`);
  await browser('set', 'media', 'light', 'reduced-motion');
  await ev('localStorage.removeItem("treetutor.contents"); true');
  await browser('reload');
  await openChat();
  // Open by default: chevron at the panel's top-left with a name and aria-expanded.
  await wait(`!!document.querySelector('main .contents .contents-collapse')`);
  assert.equal(await expandedAttr('.contents-collapse'), 'true');
  assert.equal(
    await ev(
      `(() => { const b = document.querySelector('.contents-collapse').getBoundingClientRect(), p = document.querySelector('main .contents').getBoundingClientRect(); return b.left - p.left < 24 && b.top - p.top < 24; })()`,
    ),
    true,
    'chevron sits top-left',
  );
  const chatOpen = await width('.focused-chat');
  // Keyboard collapse: rail stays, focus moves to the reopen button, chat widens.
  await browser('focus', '.contents-collapse');
  await browser('press', 'Enter');
  assert.equal(await ev(`!!document.querySelector('main .contents')`), false);
  assert.equal(await expandedAttr('.contents-reopen'), 'false');
  assert.equal(await focusedName(), 'Show contents');
  const rail = await width('.contents-rail');
  assert.ok(rail > 0 && rail < 64, `thin rail (${rail}px)`);
  const chatCollapsed = await width('.focused-chat');
  assert.ok(chatCollapsed > chatOpen + 100, `chat widens (${chatOpen} -> ${chatCollapsed})`);
  // Survives reload.
  assert.equal(await ev('localStorage.getItem("treetutor.contents")'), 'collapsed');
  await browser('reload');
  await openChat();
  await wait(`!!document.querySelector('.contents-reopen')`);
  assert.equal(
    await ev(`!!document.querySelector('main .contents')`),
    false,
    'collapsed after reload',
  );
  // With Expand chat the chat fills everything but the rail.
  await browser('find', 'role', 'button', 'click', '--name', 'Expand chat', '--exact');
  await wait(`getComputedStyle(document.querySelector('.overview')).display === 'none'`);
  assert.ok(
    Math.abs(
      (await width('.focused-chat')) + rail - (await ev('document.documentElement.clientWidth')),
    ) < 3,
    'chat takes full width beside the rail',
  );
  await browser('find', 'role', 'button', 'click', '--name', 'Show map beside chat', '--exact');
  await wait(`getComputedStyle(document.querySelector('.overview')).display === 'flex'`);
  // Narrow drawer unchanged while collapsed: full contents, no collapse button.
  await browser('set', 'viewport', '390', '844');
  await wait(`!document.querySelector('.contents-rail')`);
  await browser('focus', '.band-contents');
  await browser('press', 'Enter');
  await wait(`!!document.querySelector('dialog[open] .contents-panel')?.checkVisibility()`);
  assert.equal(await ev(`!!document.querySelector('dialog[open] .contents-collapse')`), false);
  await browser('press', 'Escape');
  await browser('set', 'viewport', '1440', '900');
  // Keyboard reopen restores the panel, focus returns to the chevron, state persists.
  await wait(`!!document.querySelector('.contents-reopen')`);
  await browser('focus', '.contents-reopen');
  await browser('press', 'Space');
  await wait(`!!document.querySelector('main .contents')`);
  assert.equal(await focusedName(), 'Hide contents');
  const chatBack = await width('.focused-chat');
  assert.ok(
    Math.abs(chatBack - chatOpen) < 3,
    `chat returns to its width (${chatOpen} vs ${chatBack})`,
  );
  await browser('reload');
  await openChat();
  await wait(`!!document.querySelector('main .contents .contents-collapse')`);
  console.log(
    'PASS: Contents collapses to a rail and reopens by keyboard with aria-expanded and focus handoff, chat widens (full width with Expand chat), state survives reload, narrow drawer unchanged.',
  );
} finally {
  await browser('close').catch(() => {});
  app.stop();
  store.close();
}
