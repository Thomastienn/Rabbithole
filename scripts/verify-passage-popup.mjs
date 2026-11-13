// Focused check for the compact passage popup: built UI, temporary SQLite, fixture provider; no paid inference.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `passage-popup-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const key = name => b('press', name);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const checks = [], check = text => { checks.push(text); console.log(`ok - ${text}`); };

const dir = mkdtempSync(join(tmpdir(), 'tt-passage-popup-')), store = new Store(join(dir, 'trees.sqlite'));
const title = 'Passage popup fixture';
const text = 'A mutex guards shared state. Threads wait their turn at the lock.';
const root = store.create(title);
store.message(root.id, 'user', 'How does a mutex work?', 'completed');
const reply = store.message(root.id, 'assistant', text, 'completed');
const graph = { concepts: [{ name: 'Mutual exclusion', topics: ['Concurrency'] }, { name: 'Threads', topics: ['Concurrency'] }], links: [] };
const passages = [{ start: 2, end: 7, text: 'mutex', concept: 'Mutual exclusion' }, { start: 29, end: 36, text: 'Threads', concept: 'Threads' }];
store.addGraph(graph, reply);
store.pendingSuggestions(root.id, reply); store.finishSuggestions(root.id, reply, passages, null);
// An earlier manual branch underlines its passage and reopens that child instead of the popup.
const explored = store.branch(store.tree(root.id), { messageId: reply, start: 15, end: 27, text: 'shared state', question: 'Which state?' }, 'Fixture snapshot');
let failCompact = false;
let releaseSuggestion;
const provider = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (tree, input, emit) => {
  if (tree.instructions?.startsWith('You mark')) {
    const late = input.includes('A latch waits for a signal.');
    if (late) await new Promise(resolve => { releaseSuggestion = resolve; });
    emit({ type: 'item', item: 'one', text: JSON.stringify(late ? { concepts: [], links: [], suggestions: [{ text: 'latch' }] } : { ...graph, suggestions: [] }) }); emit({ type: 'status', status: 'completed' }); return;
  }
  if (tree.instructions?.startsWith('You write the background') && failCompact) throw new Error('Fixture compaction failure');
  emit({ type: 'item', item: 'one', text: tree.instructions?.startsWith('You write the background') ? 'Fixture inherited context' : input === 'Explain a latch' ? 'A latch waits for a signal.' : 'Fixture reply.' });
  emit({ type: 'status', status: 'completed' });
} };
const app = createApp({ store, provider, suggestions: true, dir, auth: { status: () => ({ connected: true }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const concept = async name => (await (await fetch(origin + '/api/graph')).json()).concepts.find(c => c.name === name);
const stop = word => `[...document.querySelectorAll('.focused-chat u.suggestion[tabindex]')].find(u => u.textContent === ${JSON.stringify(word)})`;
const popup = `document.querySelector('.passage-box .branch-form')`;
const input = `document.querySelector('.branch-form input')`;
const children = () => store.list().filter(t => t.parent === root.id).length;
mkdirSync('.impeccable/review', { recursive: true });

const center = async selector => ev(`(() => { const r = (${selector}).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; })()`);
async function clickAt([x, y]) { await b('mouse', 'move', String(x), String(y)); await b('mouse', 'down', 'left'); await b('mouse', 'up', 'left'); }
// Drag-select one word inside the reply's text nodes.
async function highlight(word) {
  const [x1, y1, x2, y2] = await ev(`(() => { const walker = document.createTreeWalker(document.querySelector('.focused-chat .passage section'), NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) if (n.textContent.includes(${JSON.stringify(word)})) break;
    const i = n.textContent.indexOf(${JSON.stringify(word)}), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${word.length}); const box = r.getBoundingClientRect();
    return [box.left + 1, box.top + box.height / 2, box.right - 1, box.top + box.height / 2].map(Math.round); })()`);
  await b('mouse', 'move', String(x1), String(y1)); await b('mouse', 'down', 'left');
  await b('mouse', 'move', String(x2), String(y2), '--steps', '8'); await b('mouse', 'up', 'left');
}
const geometry = () => ev(`(() => {
  const r = n => n.getBoundingClientRect(), box = r(document.querySelector('.passage-box')), send = document.querySelector('.branch-send');
  const shown = [...document.querySelectorAll('.focused-chat button')].filter(n => n.checkVisibility()).map(n => n.getAttribute('aria-label') || n.textContent.trim());
  return { width: innerWidth, height: innerHeight, page: document.documentElement.scrollWidth, box: [box.left, box.top, box.right, box.bottom], boxHeight: box.height,
    sendRound: parseFloat(getComputedStyle(send).borderTopLeftRadius) >= r(send).width / 2 || getComputedStyle(send).borderTopLeftRadius === '50%',
    passage: document.querySelector('.branch-passage').textContent, shown,
    quoteHidden: r(document.querySelector('.branch-passage')).width <= 1 && document.querySelector('.branch-form input').getAttribute('aria-describedby') === document.querySelector('.branch-passage').id,
    painted: [...CSS.highlights.get('passage') ?? []].map(r => r.toString()) };
})()`);

async function flow(mode, { word, manual, correction, label }) {
  // Suggested underline: compact popup with passage, question field and small send control.
  await ev(`${stop(word)}.focus(); true`); await key('Enter');
  await wait(`document.activeElement === ${input}`);
  const g = await geometry();
  assert.equal(g.passage, word, `${mode}: popup describes the exact passage`);
  assert.ok(g.quoteHidden, `${mode}: passage quote is screen-reader-only and still describes the question`);
  assert.deepEqual(g.painted, [word], `${mode}: the reply paints the passage while asking`);
  assert.ok(g.page <= g.width && g.box[0] >= 0 && g.box[2] <= g.width && g.box[1] >= 0 && g.box[3] <= g.height, `${mode}: popup fits the viewport ${JSON.stringify(g)}`);
  assert.ok(g.sendRound && g.shown.includes('Create focused chat'), `${mode}: small round send control`);
  assert.ok(!g.shown.some(n => /Cancel branch|I know this|I don't get this/.test(n)), `${mode}: no Cancel branch or prominent correction buttons ${JSON.stringify(g.shown)}`);
  assert.ok(g.boxHeight < 160, `${mode}: popup stays compact (${g.boxHeight}px)`);
  await b('screenshot', `${process.cwd()}/.impeccable/review/passage-popup-${mode.replace(/\W+/g, '-')}.png`);
  check(`${mode}: suggested underline opens a ${Math.round(g.boxHeight)}px popup, passage painted in the reply and quoted only for screen readers, question field and round send; no Cancel branch`);

  // Empty question cannot submit; Escape dismisses and returns focus to the underline.
  await key('Enter');
  assert.equal(children(), before, `${mode}: empty question creates no branch`);
  await key('Escape');
  await wait(`!${popup} && document.activeElement === ${stop(word)} && !CSS.highlights.has('passage')`);
  check(`${mode}: empty Enter does nothing; Escape dismisses, clears the highlight and returns focus to the underline`);

  // Outside click dismisses without creating a branch, and focus never falls to the page body.
  await key('Enter'); await wait(`document.activeElement === ${input}`);
  await b('keyboard', 'type', 'draft');
  // Header padding is outside the popup and every underline, regardless of text wrapping.
  const hit = await ev(`(() => { const r = document.querySelector('.focused-chat .chat-header').getBoundingClientRect(); return [Math.round(r.left + 4), Math.round(r.top + 4)]; })()`);
  assert.ok(await ev(`!document.elementFromPoint(${hit[0]}, ${hit[1]}).closest('.passage-box')`), `${mode}: click target is outside the popup`);
  await clickAt(hit);
  await wait(`!${popup} && !CSS.highlights.has('passage')`);
  await wait(`document.activeElement && document.activeElement !== document.body`);
  assert.equal(children(), before, `${mode}: dismissing creates no branch`);
  check(`${mode}: outside click dismisses with focus kept off the page body; no branch created`);

  // Manual highlight shows only Ask and keeps the native selection, so copy works; Ask opens the same popup.
  await highlight(manual);
  await wait(`[...document.querySelectorAll('.focused-chat button')].some(n => n.textContent.trim() === 'Ask about selection') && !${popup} && getSelection().toString() === ${JSON.stringify(manual)}`);
  assert.ok(await ev(`document.execCommand('copy')`), `${mode}: the kept selection can be copied`);
  await b('screenshot', `${process.cwd()}/.impeccable/review/passage-ask-${mode.replace(/\W+/g, '-')}.png`);
  await click('Ask about selection');
  await wait(`document.activeElement === ${input} && document.querySelector('.branch-passage')?.textContent === ${JSON.stringify(manual)}`);
  await b('keyboard', 'type', 'typing keeps it');
  assert.deepEqual(await ev(`[...CSS.highlights.get('passage') ?? []].map(r => r.toString())`), [manual], `${mode}: passage stays painted while typing`);
  await b('screenshot', `${process.cwd()}/.impeccable/review/passage-painted-${mode.replace(/\W+/g, '-')}.png`);
  assert.equal(await ev(`document.querySelectorAll('.branch-form [aria-label^="Familiarity options"]').length`), 0, `${mode}: manual passages guess no concept`);
  await key('Escape'); await wait(`!${popup} && document.activeElement?.matches('.focused-chat .passage > section') && !CSS.highlights.has('passage')`);
  check(`${mode}: manual highlight shows only Ask with a copyable native selection; Ask opens the same popup, painted while typing, without guessed corrections; Escape clears it and returns focus to the reply`);

  // Familiarity corrections in the overflow menu; Escape closes only the menu.
  await ev(`${stop(word)}.focus(); true`); await key('Enter'); await wait(`document.activeElement === ${input}`);
  await b('keyboard', 'type', 'why');
  await ev(`document.querySelector('.branch-form [aria-label="Familiarity options for ${word === 'mutex' ? 'Mutual exclusion' : 'Threads'}"]').focus(); true`);
  await key('Enter');
  await wait(`[...document.querySelectorAll('[role=menu] [role=menuitemradio]')].some(m => m.checkVisibility())`);
  await key('Escape');
  await wait(`![...document.querySelectorAll('[role=menu]')].some(m => m.checkVisibility())`);
  assert.ok(await ev(`!!${popup}`), `${mode}: Escape in the menu keeps the popup`);
  await key('Enter');
  await wait(`[...document.querySelectorAll('[role=menu] [role=menuitemradio]')].some(m => m.checkVisibility())`);
  await b('find', 'role', 'menuitemradio', 'click', '--name', label, '--exact');
  await wait(`document.querySelector('.branch-form .correction-status')?.textContent.includes('overrides the estimate')`);
  const saved = await concept(word === 'mutex' ? 'Mutual exclusion' : 'Threads');
  assert.equal(saved.correction, correction);
  assert.equal(await ev(`${input}.value`), 'why', `${mode}: correcting keeps the question`);
  assert.equal(children(), before, `${mode}: correcting creates no branch`);
  const menuOpen = `[...document.querySelectorAll('[role=menu]')].some(m => m.checkVisibility())`;
  if (!(await ev(menuOpen))) await click(`Familiarity options for ${word === 'mutex' ? 'Mutual exclusion' : 'Threads'}`);
  await wait(`[...document.querySelectorAll('[role=menu] [role=menuitemradio]')].find(m => m.checkVisibility() && m.textContent.includes(${JSON.stringify(label)}))?.getAttribute('aria-checked') === 'true'`);
  await key('Escape'); await wait(`!(${menuOpen})`);
  assert.ok(await ev(`!!${popup}`), `${mode}: closing the menu keeps the popup`);
  check(`${mode}: overflow offers I know this / I don't get this; "${label}" saves ${correction}, shows checked, keeps the question; menu Escape keeps the popup`);

  // Failed submit keeps the popup and question; retry by Enter creates the branch with the exact anchor.
  failCompact = true;
  await ev(`${input}.focus(); true`); await key('Enter');
  await wait(`document.body.textContent.includes('Fixture compaction failure') || document.querySelector('[role=alert]')`);
  await wait(`${popup} && ${input}.value === 'why' && !${input}.disabled`);
  assert.equal(children(), before, `${mode}: failure creates no branch`);
  failCompact = false;
  await ev(`${input}.focus(); true`); await key('Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'why' && !CSS.highlights.has('passage')`);
  const anchor = store.list().filter(t => t.parent === root.id).map(t => store.tree(t.id).branch).find(a => a.text === word);
  assert.deepEqual([anchor.messageId, anchor.text, anchor.question, text.slice(anchor.start, anchor.end)], [reply, word, 'why', word]);
  check(`${mode}: failed submit keeps popup and question; Enter retry creates the branch anchored to exactly "${word}"`);
  before = children();

  // Explored underlines reopen their child.
  await click('Return to parent conversation');
  await wait(stop(word));
  await ev(`${stop(word)}.focus(); true`); await key('Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'why'`);
  assert.equal(children(), before);
  await click('Return to parent conversation');
  await wait(stop('shared state'));
  await ev(`${stop('shared state')}.focus(); true`); await key('Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Which state?'`);
  await click('Return to parent conversation'); await wait(stop('mutex'));
  check(`${mode}: explored underlines reopen their child conversations without a popup`);
}

let before = children();
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await ev(`localStorage.setItem('treetutor.appearance', 'dark'); true`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await b('reload');
  await wait(`document.querySelector('[aria-label="Open ${title}"]')`);
  await click(`Open ${title}`); await wait(stop('mutex'));
  await flow('dark wide', { word: 'mutex', manual: 'guards', correction: 'known', label: 'I know this' });

  await ev(`localStorage.setItem('treetutor.appearance', 'light'); true`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('set', 'viewport', '390', '844');
  await b('reload');
  await wait(`document.querySelector('[aria-label="Open ${title}"]')`);
  await click(`Open ${title}`); await wait(stop('Threads'));
  await flow('light narrow', { word: 'Threads', manual: 'lock', correction: 'unknown', label: "I don't get this" });
  assert.ok(explored);

  const { csrf } = await (await fetch(origin + '/api/state')).json();
  for (const [mode, width] of [['dark', 1440], ['light', 390]]) {
    const late = store.create(`Late suggestions ${mode}`);
    await (await fetch(`${origin}/api/trees/${late.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify({ text: 'Explain a latch' }) })).text();
    await b('set', 'viewport', String(width), '900');
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); location.reload(); true`);
    await wait(`document.querySelector('[aria-label="Open Late suggestions ${mode}"]')`);
    await click(`Open Late suggestions ${mode}`);
    await wait(`document.querySelector('.focused-chat .reply-md')?.textContent.includes('A latch waits for a signal.')`);
    await highlight('latch'); await click('Ask about selection');
    await wait(`document.activeElement === ${input}`);
    await b('keyboard', 'type', 'Why wait?');
    assert.deepEqual((await geometry()).painted, ['latch']);
    releaseSuggestion();
    await wait(stop('latch'));
    assert.deepEqual((await geometry()).painted, ['latch'], 'late suggestions retain the passage paint');
    await b('keyboard', 'type', ' How long?');
    assert.equal(await ev(`${input}.value`), 'Why wait? How long?');
    await b('screenshot', `${process.cwd()}/.impeccable/review/passage-late-suggestions-${mode}.png`);
    await key('Escape'); await wait(`!${popup} && !CSS.highlights.has('passage')`);
    check(`${mode}: late suggestions keep the passage painted, question and typing focus intact; Escape clears it`);
  }

  writeFileSync('docs/verification/passage-popup-ui.json', JSON.stringify({ date: new Date().toISOString(), evidence: 'built UI, real HTTP/SQLite, fixture provider; no native inference', checks }, null, 2) + '\n');
  console.log(`${checks.length} checks passed`);
} catch (error) { console.error(await b('snapshot', '-i').catch(() => '')); throw error; }
finally { releaseSuggestion?.(); await b('close').catch(() => {}); await app.stop(); store.close(); }
