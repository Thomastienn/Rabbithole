// Focused check for the slim chat header and floating composer: built UI, temporary SQLite, fixture providers; no paid inference.
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
  session = `compact-chat-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const focus = (selector) =>
  wait(
    `(() => { const n = document.querySelector(${JSON.stringify(selector)}); n?.focus(); return n && document.activeElement === n; })()`,
  );
const checks = [],
  check = (text) => {
    checks.push(text);
    console.log(`ok - ${text}`);
  };

const dir = mkdtempSync(join(tmpdir(), 'tt-compact-chat-')),
  store = new Store(join(dir, 'trees.sqlite'));
const title = 'How a mutex keeps shared counters correct when many threads write at once';
const root = store.create(title, 'claude', 'sonnet');
for (let i = 1; i <= 4; i++) {
  store.message(root.id, 'user', `Question ${i} about locks`, 'completed');
  const reply = store.message(
    root.id,
    'assistant',
    `Reply ${i}. ` +
      'A mutex lets one thread at a time read, change and write the shared value. '.repeat(8),
    'completed',
  );
  store.usage(reply, { input: 900 + i, output: 60, cacheRead: 0 });
}
const source = store.tree(root.id).messages[1];
const child = store.branch(
  store.tree(root.id),
  { messageId: source.id, start: 0, end: 8, text: 'Reply 1.', question: 'Why one at a time?' },
  'The tutor explained a mutex.',
);
store.message(child.id, 'user', 'Why one at a time?', 'completed');
store.message(child.id, 'assistant', 'Two writers interleave and lose an update.', 'completed');

const sent = [];
const providers = Object.fromEntries(
  ['claude', 'codex', 'openai'].map((provider) => [
    provider,
    {
      models: async () => [
        {
          model: provider === 'claude' ? 'sonnet' : 'chat',
          label: { claude: 'Sonnet', codex: 'Codex chat', openai: 'Custom chat' }[provider],
          isDefault: true,
          efforts: ['low', 'high'],
        },
      ],
      model: async () => (provider === 'claude' ? 'sonnet' : 'chat'),
      // Streams until the learner stops it.
      generate: async (tree, text, emit, save) => {
        sent.push(text);
        save(`${provider}-${tree.id}`, tree.model);
        emit({ type: 'item', item: 'reply', text: 'Thinking about your question…' });
        await new Promise(() => {});
      },
    },
  ]),
);
const app = createApp({
  store,
  providers,
  defaultProvider: 'claude',
  dir,
  auth: { status: () => ({ connected: true }) },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
mkdirSync('.impeccable/review', { recursive: true });
const shot = (name) =>
  b('screenshot', `${process.cwd()}/.impeccable/review/compact-chat-${name}.png`);

// Geometry of header and composer at the current viewport, scrolled to the latest reply.
const layout = async () => {
  await wait(`document.querySelector('.chat-header')?.getBoundingClientRect().height > 0`);
  return ev(`(async () => {
  const log = document.querySelector('.focused-chat .astryx-chat-layout');
  log.scrollTop = log.scrollHeight; log.dispatchEvent(new Event('scroll'));
  await new Promise(r => setTimeout(r, 300));
  const r = n => n.getBoundingClientRect(), header = document.querySelector('.chat-header'), row = header.querySelector('.chat-heading-row');
  const controls = ['.stats-toggle', '.expand-chat', '[aria-label="Return to tree"]', '[aria-label="More conversation options"]'].map(s => header.querySelector(s));
  const composer = document.querySelector('.focused-chat .astryx-chat-composer > :first-child'), send = document.querySelector('.focused-chat .astryx-chat-send-button');
  const input = document.querySelector('.focused-chat [aria-label="Your question"]'), last = [...document.querySelectorAll('.focused-chat [role=log] article')].at(-1);
  const css = getComputedStyle(send), probe = document.createElement('i'); document.body.append(probe); probe.style.color = 'var(--color-accent)';
  const accent = getComputedStyle(probe).color; probe.remove();
  return {
    headerHeight: r(header).height, rowHeight: r(row).height,
    visible: controls.map(n => !!n && n.checkVisibility() && r(n).width > 0 && r(n).right <= r(header).right + 1),
    sameRow: controls.filter(n => n?.checkVisibility()).every(n => Math.abs(r(n).top + r(n).height / 2 - (r(row).top + r(row).height / 2)) < 4),
    savedText: header.textContent.includes('saved automatically'),
    sendRadius: css.borderTopLeftRadius,
    sendBelow: r(send).top >= r(input).bottom && r(send).bottom <= r(composer).bottom,
    modelAtFoot: !!document.querySelector('.astryx-chat-composer .model-picker'),
    sendFill: css.backgroundColor, accent,
    composerRadius: getComputedStyle(composer).borderTopLeftRadius,
    lastClear: r(last).bottom <= r(composer).top,
    inputInView: r(input).bottom <= innerHeight && r(input).top >= r(header).bottom,
    noOverflow: document.documentElement.scrollWidth <= innerWidth,
  };
})()`);
};
const assertLayout = async (mode) => {
  const l = await layout();
  assert.ok(
    l.headerHeight <= 57 && l.headerHeight - l.rowHeight <= 17,
    `${mode}: one slim header row ${JSON.stringify(l)}`,
  );
  // At 48rem and below chat already fills the width, so the existing layout hides Expand.
  assert.deepEqual(
    l.visible,
    [true, !mode.includes('narrow'), true, true],
    `${mode}: stats, map toggle, close and overflow visible ${JSON.stringify(l)}`,
  );
  assert.ok(l.sameRow, `${mode}: controls share the row`);
  assert.equal(l.savedText, false, `${mode}: no permanent autosave text`);
  assert.ok(
    l.sendRadius === '3px' && l.sendBelow && l.modelAtFoot,
    `${mode}: Send and model button below the input ${JSON.stringify(l)}`,
  );
  if (!mode.includes('streaming'))
    assert.equal(l.sendFill, l.accent, `${mode}: send uses the accent token`);
  assert.notEqual(l.composerRadius, '0px', `${mode}: rounded composer`);
  assert.ok(
    l.lastClear && l.inputInView && l.noOverflow,
    `${mode}: composer clears the latest reply and stays in view ${JSON.stringify(l)}`,
  );
  check(
    `${mode}: ${Math.round(l.headerHeight)}px header holds breadcrumbs, stats, map toggle, close and overflow; Send/model at composer foot clears the latest reply`,
  );
};

try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await b('set', 'media', 'dark', 'reduced-motion');
  await ev(
    `localStorage.setItem('treetutor.vim', 'on'); localStorage.setItem('treetutor.appearance', 'dark'); true`,
  );
  await b('reload');
  await wait(`document.querySelector('[aria-label="Open ${title}"]')`);
  await b('focus', `[aria-label="Open ${title}"]`);
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(title)}`,
  );
  await assertLayout('dark side panel');
  await shot('dark-side-panel');

  // Full title wraps in the reading column; rename remains keyboard reachable.
  const tip = `[...document.querySelectorAll('[role=tooltip]')].some(n => n.checkVisibility() && n.textContent.includes(${JSON.stringify(title)}))`;
  await b('scrollintoview', '#rename-conversation');
  assert.ok(
    await ev(
      `(() => { const h = document.querySelector('.chat-title h2'); return h.scrollWidth <= h.clientWidth && h.textContent === ${JSON.stringify(title)}; })()`,
    ),
    'full title wraps within the reading measure',
  );
  await b('hover', '#rename-conversation');
  await wait(tip);
  await b('mouse', 'move', '5', '5');
  await wait(`!(${tip})`);
  await focus('#rename-conversation');
  assert.equal(await ev(`document.activeElement.id`), 'rename-conversation');
  await wait(tip);
  check(
    'full title wraps in the reading column; rename has the full-title tooltip on hover and keyboard focus',
  );

  // Overflow by keyboard: token stats and rename.
  await focus('[aria-label="More conversation options"]');
  await b('press', 'Enter');
  await wait(`[...document.querySelectorAll('[role=menu]')].some(m => m.checkVisibility())`);
  const moving = await ev(
    `document.getAnimations().filter(x => (x.effect?.getTiming().duration ?? 0) > 1 && !/color|shadow/.test(x.transitionProperty ?? '')).map(x => (x.animationName ?? x.transitionProperty) + ':' + x.effect.getTiming().duration + ':' + (x.effect.target?.className?.baseVal ?? x.effect.target?.className ?? '').slice(0, 60))`,
  );
  assert.deepEqual(
    moving,
    [],
    'reduced motion: overflow menu opens without movement (color fades allowed)',
  );
  await b('find', 'role', 'menuitem', 'click', '--name', 'Show token stats', '--exact');
  await wait(`document.querySelector('.chat-stats-body')?.checkVisibility()`);
  assert.match(
    await ev(`document.querySelector('.chat-stats-body').textContent`),
    /Reply 1: 901 input · 60 output · 0 cache-read tokens/,
  );
  await click('More conversation options');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Hide token stats', '--exact');
  await wait(`!document.querySelector('.chat-stats-body')`);
  await click('More conversation options');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Rename conversation', '--exact');
  await wait(`document.querySelector('.chat-title input')`);
  await b('press', 'Escape');
  await wait(`document.querySelector('#rename-conversation')`);
  check(
    'overflow menu opens by keyboard without animation under reduced motion; shows and hides per-reply token stats and offers rename',
  );

  // Model/effort picker.
  await focus('.model-picker');
  await b('press', 'Enter');
  await wait(
    `[...document.querySelectorAll('[role=menu] [role=menuitemradio]')].some(m => m.checkVisibility())`,
  );
  await b('find', 'role', 'menuitemradio', 'click', '--name', 'High', '--exact');
  await wait(`document.querySelector('.chat-model')?.textContent.includes('High')`);
  assert.equal(store.tree(root.id).effort, 'high');
  await b('find', 'role', 'button', 'click', '--name', 'Model for next reply', '--exact');
  await wait(
    `[...document.querySelectorAll('[role=menu] [role=menuitemradio]')].some(m => m.checkVisibility())`,
  );
  await b('find', 'role', 'menuitemradio', 'click', '--name', 'Codex chat', '--exact');
  await wait(`document.querySelector('.chat-model')?.textContent.includes('Codex chat')`);
  assert.equal(store.tree(root.id).provider, 'codex');
  check('compact picker opens by keyboard, changes effort and model, and shows the saved choice');

  // Typing, Shift+Enter, Vim letters stay in the input, Enter sends, Stop interrupts.
  const viewport = await ev(
    `document.querySelector('.react-flow__viewport')?.style.transform ?? ''`,
  );
  await focus('.focused-chat [aria-label="Your question"]');
  await b('keyboard', 'type', 'hjkl first line');
  await b('press', 'Shift+Enter');
  await b('keyboard', 'type', 'second line');
  assert.equal(
    await ev(
      `document.querySelector('.focused-chat [aria-label="Your question"]').innerText.replace(/\\n+/g, '\\n').trim()`,
    ),
    'hjkl first line\nsecond line',
  );
  assert.equal(
    await ev(`document.querySelector('.react-flow__viewport')?.style.transform ?? ''`),
    viewport,
    'Vim letters typed in the composer never move the map',
  );
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.focused-chat .astryx-chat-send-button')?.getAttribute('aria-label') === 'Stop'`,
  );
  assert.deepEqual(sent, ['hjkl first line\nsecond line']);
  await assertLayout('dark streaming');
  await click('Stop');
  await wait(
    `document.querySelector('.reply-status')?.textContent.match(/Reply (stopped|interrupted|cancel)/i)`,
  );
  await wait(
    `document.querySelector('.focused-chat .astryx-chat-send-button')?.getAttribute('aria-label') === 'Send'`,
  );
  check(
    'composer keeps typing, Shift+Enter new lines, Vim letters as text, Enter sending and Stop interruption',
  );

  // Escape leaves the composer for the map; the map keeps Vim keys.
  await focus('.focused-chat [aria-label="Your question"]');
  await b('press', 'Escape');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  check('Escape from the composer returns to the map');
  await click('Reopen chat');
  await wait(`document.querySelector('.focused-chat h2')`);

  // Expanded, branch, light and narrow.
  await click('Expand chat');
  await wait(`document.querySelector('.tree-workspace[data-expanded=true]')`);
  await assertLayout('dark expanded');
  await click('Show map beside chat');
  await ev(`localStorage.setItem('treetutor.appearance', 'light'); true`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('reload');
  await wait(`document.querySelector('[aria-label="Open Why one at a time?"]')`);
  await click('Open Why one at a time?');
  await wait(`document.querySelector('.inherited-context')`);
  await assertLayout('light branch side panel');
  await shot('light-branch');
  await b('find', 'text', 'Inherited from', 'click');
  await wait(`document.querySelector('.inherited-body')?.checkVisibility()`);
  assert.deepEqual(
    await ev(`[...document.querySelectorAll('.inherited-body dd')].map(n => n.textContent)`),
    ['Reply 1.', 'Why one at a time?', 'The tutor explained a mutex.'],
  );
  await click('Return to parent conversation');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(title)}`,
  );
  check(
    'branch keeps inherited context in the transcript and returns to its parent from the header',
  );
  await b('set', 'viewport', '390', '800');
  await assertLayout('light narrow');
  await shot('light-narrow');
  await focus('.focused-chat [aria-label="Your question"]');
  assert.ok((await layout()).inputInView, 'focused input stays visible at 390px');
  check('390px: focused composer stays visible and clear of the latest reply');

  writeFileSync(
    `${verifyOut}/compact-chat-ui.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        evidence: 'built UI, real HTTP/SQLite, fixture providers; no native inference',
        checks,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`${checks.length} checks passed`);
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
