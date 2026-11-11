import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Synthetic fixture: checks layout restore in a real browser, not live Codex behavior.
const exec = promisify(execFile), session = `layout-restore-${process.pid}`;
const b = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') } })).stdout;
const ev = async s => JSON.parse(await b('eval', s, '--json')).data.result;
const wait = s => b('wait', '--fn', s);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'layout-restore-')), 'trees.sqlite'));
function branch(parent, title) {
  const messageId = store.message(parent.id, 'assistant', `Tutor reply in ${parent.title}`, 'completed');
  return store.branch(parent, { messageId, start: 0, end: 5, text: 'Tutor', question: title }, `Context for ${title}`);
}
const old = store.create('Old'); store.message(old.id, 'user', 'Old question', 'completed'); store.db.prepare("UPDATE trees SET layout='{broken' WHERE id=?").run(old.id);
const second = store.create('Second'), s1 = branch(second, 'S1');
const first = store.create('First'), f1 = branch(first, 'F1'), f2 = branch(f1, 'F2');
for (const [i, t] of [first, f1, f2, second, s1, old].entries()) store.position(t.id, i * 400, 0);
const before = [first, f1, f2, second, s1, old].map(t => store.tree(t.id).messages);
const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const node = id => `!!document.querySelector('.react-flow__node[data-id="${id}"]')`;
const layout = id => JSON.parse(store.db.prepare('SELECT layout FROM trees WHERE id=?').get(id).layout);
const ids = id => { const l = layout(id); delete l.viewport; return l; };
const flush = async () => { await ev('__layoutMinute()'); await wait('window.__layoutInFlight === 0'); };
const chatShown = `getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`;
const view = () => ev('document.querySelector(".react-flow__viewport").style.transform');
// Opening chat animates the map; sample only once the transform holds still for 300ms.
async function settledView() { for (;;) { const a = await view(); await new Promise(r => setTimeout(r, 300)); if (a === await view()) return a; } }
async function openTree(name) { if (await ev('getComputedStyle(document.querySelector(".trees")).display') === 'none') { await click('Map menu'); await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact'); } await click(name); }
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await wait(`${node(f2.id)} && document.querySelector('.focused-chat h2')?.textContent === 'First'`);
  assert.equal(await ev(chatShown), false, 'tree without saved layout opens on the map');
  await b('focus', '.tree-canvas'); await b('press', 'ArrowRight'); await b('press', 'ArrowDown');
  await click(`Collapse descendants of F1`);
  await wait(`!${node(f2.id)}`);
  await b('focus', `#open-${f1.id}`); await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'F1'`);
  await wait(`${chatShown}`);
  assert.equal(await ev('window.__layoutPosts'), 0, 'pan, fold and panel changes wait for the minute batch');
  assert.equal(await ev('__layoutTimers()'), 1, 'one pending timer for all interactions');
  assert.equal(store.db.prepare('SELECT layout FROM trees WHERE id=?').get(first.id).layout, null);
  await flush();
  assert.equal(await ev('window.__layoutPosts'), 1, 'one coalesced write');
  assert.deepEqual(ids(first.id), { folded: [f1.id], selected: f1.id, panel: 'beside' });
  await openTree('Second');
  await wait(`${node(s1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'Second'`);
  await flush();
  assert.deepEqual(ids(second.id), { folded: [], selected: second.id, panel: 'collapsed' });
  assert.deepEqual(ids(first.id), { folded: [f1.id], selected: f1.id, panel: 'beside' }, 'second tree left first snapshot intact');
  const posts = await ev('window.__layoutPosts');
  await new Promise(r => setTimeout(r, 500)); await flush();
  assert.equal(await ev('window.__layoutPosts'), posts, 'no idle writes');

  await openTree('First');
  await wait(`${node(f1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'F1'`);
  const savedView = await settledView();
  await flush();
  await b('reload');
  await wait(`${node(f1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'F1'`);
  assert.equal(await ev(node(f2.id)), false, 'fold restored');
  assert.equal(await ev(chatShown), true, 'panel mode restored');
  assert.equal(await settledView(), savedView, 'viewport restored from the batched layout');
  await click('Expand chat');
  await wait(`document.querySelector('.tree-workspace').dataset.expanded === 'true'`);
  await flush();
  assert.equal(layout(first.id).panel, 'expanded', 'expanded mode joins the minute batch');
  await b('reload');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'F1' && document.querySelector('.tree-workspace').dataset.expanded === 'true'`);
  assert.equal(await view(), savedView, 'expanded reload preserves the map viewport');
  await b('screenshot', '/tmp/treetutor-release-expanded-desktop.png');
  await b('set', 'viewport', '390', '844');
  assert.equal(await ev(`getComputedStyle(document.querySelector('.overview')).display`), 'none');
  await b('screenshot', '/tmp/treetutor-release-expanded-mobile.png');
  await b('set', 'viewport', '1440', '900');
  await click('Show map beside chat');
  await wait(`document.querySelector('.tree-workspace').dataset.expanded === 'false'`);
  assert.equal(await settledView(), savedView, 'leaving restored expanded mode returns to the saved map');
  await click('Expand descendants of F1'); await wait(node(f2.id));
  await openTree('Second');
  await wait(`${node(s1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'Second'`);
  assert.equal(await ev(chatShown), false, 'second tree keeps its own collapsed panel');
  await openTree('Old');
  await wait(`${node(old.id)} && document.querySelector('.focused-chat h2')?.textContent === 'Old'`);
  assert.equal(await ev(chatShown), false, 'corrupt legacy layout falls back to defaults');

  for (const t of [first, second]) assert.deepEqual(Object.keys(layout(t.id)).filter(k => k !== 'viewport'), ['folded', 'selected', 'panel']);
  assert.deepEqual([first, f1, f2, second, s1, old].map(t => store.tree(t.id).messages), before);
  assert.ok(store.db.prepare('SELECT layout FROM trees WHERE layout IS NOT NULL').all().every(r => !r.layout.includes('Tutor reply')));
  console.log('PASS: controlled-clock single coalesced write, no idle writes, per-tree fold/selection/panel snapshots, beside and expanded viewport restore after reload, narrow expanded chat, independent trees, legacy/corrupt layout fallback, IDs-only persisted shape, messages unchanged.');
} catch (error) { console.error(await b('snapshot')); throw error; }
finally { await b('close').catch(() => {}); app.stop(); store.close(); }
