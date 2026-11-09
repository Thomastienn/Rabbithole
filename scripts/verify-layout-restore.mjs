import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Synthetic fixture: checks layout restore in a real browser, not live Codex behavior.
const exec = promisify(execFile), session = `layout-restore-${process.pid}`;
const b = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
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
const chatShown = `getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`;
const view = () => ev('document.querySelector(".react-flow__viewport").style.transform');
// Opening chat animates the map; sample only once the transform holds still for 300ms.
async function settledView() { for (;;) { const a = await view(); await new Promise(r => setTimeout(r, 300)); if (a === await view()) return a; } }
async function openTree(name) { await click('Map menu'); await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact'); await click(name); }
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
  for (let i = 0; i < 50 && JSON.stringify(layout(first.id)) !== JSON.stringify({ folded: [f1.id], selected: f1.id, panel: 'beside' }); i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(layout(first.id), { folded: [f1.id], selected: f1.id, panel: 'beside' });
  await openTree('Second');
  await wait(`${node(s1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'Second'`);
  for (let i = 0; i < 50 && !store.db.prepare('SELECT layout FROM trees WHERE id=?').get(second.id).layout; i++) await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(layout(second.id), { folded: [], selected: second.id, panel: 'collapsed' });
  assert.deepEqual(layout(first.id), { folded: [f1.id], selected: f1.id, panel: 'beside' }, 'second tree left first snapshot intact');

  await openTree('First');
  await wait(`${node(f1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'F1'`);
  const savedView = await settledView();
  const savedStorage = await ev(`localStorage.getItem('treetutor.viewport.${first.id}')`);
  await b('reload');
  await wait(`${node(f1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'F1'`);
  assert.equal(await ev(node(f2.id)), false, 'fold restored');
  assert.equal(await ev(chatShown), true, 'panel mode restored');
  assert.equal(await settledView(), savedView, 'viewport restored from its existing store');
  assert.equal(await ev(`localStorage.getItem('treetutor.viewport.${first.id}')`), savedStorage);
  await click('Expand descendants of F1'); await wait(node(f2.id));
  await openTree('Second');
  await wait(`${node(s1.id)} && document.querySelector('.focused-chat h2')?.textContent === 'Second'`);
  assert.equal(await ev(chatShown), false, 'second tree keeps its own collapsed panel');
  await openTree('Old');
  await wait(`${node(old.id)} && document.querySelector('.focused-chat h2')?.textContent === 'Old'`);
  assert.equal(await ev(chatShown), false, 'corrupt legacy layout falls back to defaults');

  for (const t of [first, second]) assert.deepEqual(Object.keys(layout(t.id)), ['folded', 'selected', 'panel']);
  assert.deepEqual([first, f1, f2, second, s1, old].map(t => store.tree(t.id).messages), before);
  assert.ok(store.db.prepare('SELECT layout FROM trees WHERE layout IS NOT NULL').all().every(r => !r.layout.includes('Tutor reply')));
  console.log('PASS: per-tree fold/selection/panel snapshots, viewport restore after reload, independent trees, legacy/corrupt layout fallback, IDs-only persisted shape, messages unchanged.');
} catch (error) { console.error(await b('snapshot')); throw error; }
finally { await b('close').catch(() => {}); app.stop(); store.close(); }
