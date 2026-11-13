// Built-app browser fixture (in-process fake provider, not a live model) for the focused chat surround
// (docs/visual-identity-spec.md, Focused chat) and the focused chat reference screenshots in both appearances.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `chat-surround-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { env: { ...process.env, AGENT_BROWSER_ARGS: '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4' } })).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', `!!(${expression})`);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'chat-surround-')), 'data.sqlite'));
const root = store.create('Mutex basics');
store.message(root.id, 'user', 'What is a mutex?', 'completed');
const reply = store.message(root.id, 'assistant', 'A mutex guards shared state so one thread runs at a time. A thread takes the lock, works on the data, then releases it so the next thread can enter.', 'completed');
const child = store.branch(root, { messageId: reply, start: 15, end: 27, text: 'shared state', question: 'Why must shared state be guarded?' }, 'The learner asked what a mutex is.\nThe tutor said a mutex lets one thread at a time touch shared state.');
store.message(child.id, 'user', 'Why must shared state be guarded?', 'completed');
const answer = store.message(child.id, 'assistant', 'Two threads writing at once can interleave their steps. Each reads the old value, adds one and writes back, so one update is lost. Guarding the state makes the read, change and write happen as one step.', 'completed');
store.usage(answer, { input: 900, output: 60, cacheRead: 0 });
const art = store.pendingArtifact(child.id, answer, 'Lost update', 'Two threads race on a counter.');
store.finishArtifact(child.id, art.id, 'flowchart LR\n A[Read 1] --> B[Add] --> C[Write 2]');
let release;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (_tree, _input, emit) => {
  emit({ type: 'item', item: 'one', text: 'Streaming…' });
  await new Promise(resolve => { release = resolve; });
  emit({ type: 'status', status: 'completed' });
} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const steps = [], title = 'Why must shared state be guarded?';
const openChild = async () => {
  await b('wait', '[aria-label="Open Mutex basics"]');
  await b('focus', '[aria-label="Open Mutex basics"]'); await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Mutex basics' && getComputedStyle(document.querySelector('.focused-chat')).display !== 'none' && !document.documentElement.matches(':active-view-transition')`);
  await click('Return to tree');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  await b('focus', `[aria-label="Open ${title}"]`); await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(title)}`);
  await wait(`document.querySelector('.focused-chat .diagram-card img')?.naturalWidth > 0`);
  await b('mouse', 'move', '5', '5');
  await ev(`document.activeElement?.blur(); true`);
};
const look = () => ev(`(() => {
  const chat = document.querySelector('.focused-chat'), css = n => getComputedStyle(n), probe = document.createElement('span');
  chat.append(probe);
  const tone = (v, p = 'color') => { probe.style[p] = 'var(' + v + ')'; return css(probe)[p]; };
  const send = chat.querySelector('button[aria-label="Send"], button[type=submit]');
  const ctx = chat.querySelector('.inherited-context'), h2 = chat.querySelector('.conv-title h2');
  const log = chat.querySelector('[role=log]'), last = [...log.querySelectorAll('article')].at(-1);
  const out = {
    titleFont: css(h2).fontFamily, titleWeight: css(h2).fontWeight,
    meta: css(chat.querySelector('.astryx-chat-composer .chat-model')).color, secondary: tone('--color-text-secondary'), primary: tone('--color-text-primary'), paper: tone('--treetutor-paper'), accent: tone('--color-accent', 'backgroundColor'),
    ctxRule: [css(ctx).borderInlineStartWidth, css(ctx).borderInlineStartColor], ctxTop: css(ctx).borderTopWidth, accentLine: tone('--color-accent'),
    sendBg: css(send).backgroundColor, filled: [...chat.querySelectorAll('button')].filter(n => n !== send && n.checkVisibility() && css(n).backgroundColor === css(send).backgroundColor).map(n => n.getAttribute('aria-label') ?? n.textContent),
    field: css(chat.querySelector('.astryx-chat-composer').firstElementChild).borderTopWidth,
    card: [css(chat.querySelector('.diagram-card')).borderTopColor, css(chat.querySelector('.diagram-card')).backgroundColor, css(chat.querySelector('.diagram-card')).borderRadius],
    seam: tone('--color-border', 'borderTopColor'), surface: css(chat).backgroundColor,
    gapBelow: log.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom,
    gapAbove: log.querySelector('.inherited-context').getBoundingClientRect().top - log.getBoundingClientRect().top,
    statsOpen: String(!!chat.querySelector('.chat-stats-body')),
    blur: [...chat.querySelector('.astryx-chat-layout').lastElementChild.children].some(n => css(n).backdropFilter !== 'none' && css(n).display !== 'none'),
  };
  probe.remove(); return out;
})()`);
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  const shoot = async mode => {
    await openChild();
    await wait(`!document.querySelector('.focused-chat .diagram-card').textContent.includes('Rendering diagram')`);
    const file = join('docs', 'verification', `focused-chat-reference-${mode}.png`);
    const t = await look();
    assert.match(t.titleFont, /Archivo/, `${mode}: title in Archivo`);
    assert.equal(t.titleWeight, '700', `${mode}: title weight 700`);
    assert.equal(t.meta, t.primary, `${mode}: composer model button in paper ink`);
    assert.equal(t.ctxRule[0], '1px', `${mode}: inherited context has a hairline border`);
    assert.equal(t.ctxRule[1], t.seam, `${mode}: inherited context rule in the theme seam colour`);
    assert.equal(t.ctxTop, '1px', `${mode}: inherited context uses the mockup disclosure box`);
    assert.equal(t.sendBg, t.accent, `${mode}: Send filled in the theme seam colour`);
    assert.deepEqual(t.filled, [], `${mode}: Send is the only filled button`);
    assert.equal(t.field, '1px', `${mode}: composer has a hairline border`);
    assert.equal(t.blur, false, `${mode}: dock uses an opaque slate surface without blur`);
    assert.equal(t.statsOpen, 'false', `${mode}: token stats are collapsed by default`);
    assert.equal(t.card[0], t.seam, `${mode}: diagram card hairline seam`);
    assert.equal(t.card[2], '4px', `${mode}: diagram card 4px corners`);
    assert.ok(t.gapAbove < 150, `${mode}: short conversation starts at the top (${t.gapAbove}px), empty space below`);
    assert.ok(t.gapBelow > 50, `${mode}: short conversation leaves space below its reply (${t.gapBelow}px)`);
    await click('Inherited from Mutex basics');
    await wait(`document.querySelector('.inherited-body')?.checkVisibility()`);
    const quote = await ev(`(() => { const n = document.querySelector('.inherited-body dd'), s = getComputedStyle(n); return { color: s.color, font: s.fontFamily, values: [...n.parentElement.querySelectorAll('dd')].map(n => n.textContent) }; })()`);
    assert.equal(quote.color, t.secondary); assert.match(quote.font, /Literata/);
    assert.deepEqual(quote.values, ['shared state', 'Why must shared state be guarded?', 'The learner asked what a mutex is.\nThe tutor said a mutex lets one thread at a time touch shared state.']);
    await b('mouse', 'move', '5', '5'); await ev(`document.activeElement?.blur(); true`);
    await ev(`(() => { const n = document.querySelector('.focused-chat .astryx-chat-layout'); n.scrollTop = 0; n.dispatchEvent(new Event('scroll')); return true; })()`);
    await wait(`document.querySelector('.inherited-context').getBoundingClientRect().top >= document.querySelector('.chat-header').getBoundingClientRect().bottom`);
    await b('screenshot', file);
    await click('Inherited from Mutex basics');
    await click('More conversation options');
    await b('find', 'role', 'menuitem', 'click', '--name', 'Show token stats', '--exact');
    await wait(`document.querySelector('.chat-stats-body')?.checkVisibility()`);
    assert.match(await ev(`document.querySelector('.chat-stats-body').textContent`), /Reply 1: 900 input · 60 output · 0 cache-read tokens/);
    await click('More conversation options');
    await b('find', 'role', 'menuitem', 'click', '--name', 'Hide token stats', '--exact');
    await wait(`!document.querySelector('.chat-stats-body')`);
    steps.push(`${mode}: inherited passage, question and snapshot remain exact in muted reading type; Token stats start hidden; the overflow menu shows and hides the per-reply usage`);
    steps.push(`${mode}: title Archivo 700, composer model, inherited context disclosure box, Send the only filled button, diagram card seam + 4px, transcript starts at top (${Math.round(t.gapAbove)}px) with ${Math.round(t.gapBelow)}px empty below; ${file}`);
    return t;
  };
  const dark = await shoot('dark');

  // Divider is the seam: yellow on hover.
  await b('hover', '.chat-divider');
  await wait(`getComputedStyle(document.querySelector('.chat-divider'), '::after').backgroundColor !== 'rgba(0, 0, 0, 0)'`);
  const hover = await ev(`getComputedStyle(document.querySelector('.chat-divider'), '::after').backgroundColor`);
  assert.equal(hover, dark.paper, 'divider highlights paper ink on hover');
  await b('mouse', 'move', '5', '5');
  steps.push('divider seam highlights paper ink on hover');

  // Return-to-parent row reaches the parent.
  await click('Return to parent conversation');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Mutex basics'`);
  steps.push('return-to-parent row opens the parent conversation');
  await click('Return to tree');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);

  await ev(`localStorage.setItem('treetutor.appearance', 'light'); location.reload(); true`);
  const light = await shoot('light');
  assert.notEqual(dark.surface, light.surface, 'light focused chat has its own surface');

  // Narrow window: chat fills the workspace, composer reachable, Enter sends, Shift+Enter newline, Stop shown.
  await b('set', 'viewport', '390', '780');
  await wait(`document.querySelector('.focused-chat').getBoundingClientRect().width > 370`);
  const composer = await ev(`(() => { const r = document.querySelector('.focused-chat [contenteditable]').getBoundingClientRect(); return { bottom: r.bottom, width: r.width, inner: innerHeight }; })()`);
  assert.ok(composer.bottom <= composer.inner && composer.width > 200, `narrow: composer visible (${JSON.stringify(composer)})`);
  await b('find', 'role', 'textbox', 'click', '--name', 'Your question');
  await b('keyboard', 'type', 'Line one');
  await b('press', 'Shift+Enter');
  await b('keyboard', 'type', 'line two');
  assert.equal(await ev(`document.querySelector('.focused-chat [contenteditable]').innerText.trimEnd()`), 'Line one\nline two', 'Shift+Enter inserts a newline');
  await b('press', 'Enter');
  await wait(`[...document.querySelectorAll('.focused-chat [role=status]')].some(n => n.textContent === 'Responding…')`);
  await wait(`document.querySelector('.focused-chat button[aria-label="Stop"], .focused-chat button[aria-label*="Stop"]')`);
  await b('find', 'role', 'button', 'click', '--name', 'Stop');
  await wait(`![...document.querySelectorAll('.focused-chat [role=status]')].some(n => n.textContent === 'Responding…')`);
  steps.push('narrow 390px: chat fills the workspace, composer visible; Shift+Enter newline, Enter sends, Stop ends the reply');
  await b('screenshot', join('docs', 'verification', 'focused-chat-narrow-light.png'));
  await b('set', 'viewport', '320', '568');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'A longer question\nwith several\nlines to check\nthe input scrolls\nwhile Send stays reachable.');
  const small = await ev(`(() => { const chat = document.querySelector('.focused-chat'), input = chat.querySelector('[contenteditable]'), send = chat.querySelector('[aria-label="Send"]'), r = send.getBoundingClientRect(); return { fits: document.documentElement.scrollWidth <= innerWidth, input: input.getBoundingClientRect().bottom <= innerHeight, action: r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, height: r.height }; })()`);
  assert.ok(small.fits && small.input && small.action && small.height > 0, JSON.stringify(small));
  await b('screenshot', join('docs', 'verification', 'focused-chat-narrow-small-light.png'));
  steps.push('narrow 320×568: long draft scrolls; input and Send stay reachable without horizontal overflow');
  const longTitle = 'Mutual exclusion and shared state across several concurrent worker threads';
  const sourceText = store.tree(root.id).messages.find(m => m.id === reply).text;
  store.rename(root.id, longTitle);
  const longChild = store.branch(store.tree(root.id), { messageId: reply, start: 0, end: sourceText.length, text: sourceText, question: 'Long source example' }, 'Same parent, longer source.');
  store.message(longChild.id, 'user', 'Long source example', 'completed');
  await b('reload');
  await b('wait', '[aria-label="Open Long source example"]');
  await click('Open Long source example');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Long source example'`);
  // The header keeps one row; the long parent title and exact source passage live in the inherited context.
  await b('find', 'text', 'Inherited from', 'click');
  await wait(`document.querySelector('.inherited-body')?.checkVisibility()`);
  const parent = await ev(`(() => { const box = document.querySelector('.inherited-context'), passage = box.querySelector('.inherited-body dd'), css = getComputedStyle(passage); return { trigger: box.querySelector('[aria-expanded]').textContent, passage: passage.textContent, height: passage.getBoundingClientRect().height, line: parseFloat(css.lineHeight), fits: box.scrollWidth <= box.clientWidth && document.documentElement.scrollWidth <= innerWidth, back: document.querySelector('.chat-header [aria-label="Return to parent conversation"]')?.checkVisibility() }; })()`);
  assert.equal(parent.trigger, `Inherited from ${longTitle}`);
  assert.equal(parent.passage, sourceText);
  assert.ok(parent.fits && parent.back && parent.height > parent.line * 2, JSON.stringify(parent));
  const placeholder = await ev(`(() => { const p = document.querySelector('.astryx-chat-composer-input > [aria-hidden=true]').getBoundingClientRect(), m = document.querySelector('.astryx-chat-composer .model-picker').getBoundingClientRect(); return { placeholderBottom: p.bottom, modelTop: m.top }; })()`);
  assert.ok(placeholder.placeholderBottom <= placeholder.modelTop, `wrapped placeholder clears the footer: ${JSON.stringify(placeholder)}`);
  await b('screenshot', join('docs', 'verification', 'focused-chat-long-parent-light.png'));
  steps.push('narrow 320×568: long parent title and exact source passage wrap in the inherited context without horizontal overflow; return-to-parent stays in the one-row header');
  writeFileSync('docs/verification/focused-chat-surround-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence: 'Built app, SQLite, HTTP and Chromium; synthetic provider, not live inference.', pass: true, steps }, null, 2) + '\n');
  console.log(JSON.stringify({ pass: true, steps }, null, 2));
} catch (e) { console.error(steps); await b('screenshot', '/tmp/surround-fail.png').catch(() => {}); throw e; }
finally { release?.(); await b('close').catch(() => {}); app.stop(); store.close(); }
