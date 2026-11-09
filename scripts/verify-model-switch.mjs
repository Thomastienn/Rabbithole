import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { Store } from '../server/store.mjs';
import { Codex } from '../server/codex.mjs';
import { Auth } from '../server/auth.mjs';
import { createApp } from '../server/app.mjs';

// Default is a deterministic browser check. --live uses app-owned consent and synthetic data only.
process.umask(0o077);
const live = process.argv.includes('--live');
const dir = mkdtempSync(join(tmpdir(), 'treetutor-model-switch-'));
const exec = promisify(execFile);
const session = `treetutor-model-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const evaluate = async expression => JSON.parse(await browser('eval', expression, '--json')).data.result;
const wait = async expression => {
  const caller = new Error().stack;
  try { return await browser('wait', '--fn', expression); }
  catch (error) { console.error('Wait failed at', caller, 'UI:', await evaluate("document.querySelector('.focused-chat')?.textContent")); throw error; }
};
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
// The map fits a frame after mounting; click the box only once its title is the hit target.
const openTree = async () => {
  await wait(`(() => { const e = document.querySelector('[aria-label="Open Recall the tree"]'), r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`);
  await click('Open Recall the tree');
};
const waitForModel = async (id, model) => {
  for (let i = 0; i < 100; i++) {
    if (store.tree(id).model === model) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(store.tree(id).model, model);
};
let release, client, app, store, completeTurn, failCatalog = false;
const report = { mode: live ? 'live' : 'fixture', date: new Date().toISOString(), turns: [] };
try {
  let provider;
  if (live) {
    const authDir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
    release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
    client = new Codex(new Auth(authDir), dir);
    provider = client;
  } else provider = {
    models: async () => { if (failCatalog) throw new Error('Synthetic catalog failure.'); return [{ model: 'fixture-original', label: 'Original', isDefault: true }, { model: 'fixture-alternate', label: 'Alternate' }, { model: 'fixture-denied', label: 'Denied' }]; },
    generate: (tree, text, emit, save) => {
      save(tree.thread ?? `thread-${tree.id}`, tree.model ?? 'fixture-original');
      if (tree.model === 'fixture-denied') throw new Error('Synthetic model access denied.');
      emit({ type: 'item', item: 'a', text: 'Aster-731 lives in a copper grove of 47 trees.' });
      if (text === 'Hold this turn') return new Promise(resolve => { completeTurn = () => { emit({ type: 'status', status: 'completed' }); resolve(); }; });
      emit({ type: 'status', status: 'completed' });
    }
  };
  const catalog = await provider.models();
  const first = catalog.find(m => m.isDefault) ?? catalog[0];
  const second = catalog.find(m => m.model !== first.model);
  assert.ok(first && second, 'Need two catalog models to verify switching');
  report.models = [first.model, second.model];
  store = new Store(join(dir, 'trees.sqlite'));
  const parent = store.create('Model switch verification');
  store.model(parent.id, first.model);
  store.finishModel(parent.id, true);
  store.message(parent.id, 'user', 'Name our fictional learning tree.', 'completed');
  const messageId = store.message(parent.id, 'assistant', 'Our fictional tree is named Aster-731.', 'completed');
  const child = store.branch(store.tree(parent.id), { messageId, start: 4, end: 13, text: 'fictional', question: 'Recall the tree' }, 'The inherited copper grove contains exactly 47 trees.');
  app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body) => fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  const question = 'From our previous discussion and fixed inherited context, recall the fictional tree name, grove material, and exact tree count. Answer in one sentence; do not guess missing facts.';
  // Supply a local child history; the first provider turn must import this discussion.
  store.message(child.id, 'user', 'Name our fictional learning tree.', 'completed');
  store.message(child.id, 'assistant', 'Our fictional tree is named Aster-731.', 'completed');
  async function ask(label) {
    const started = performance.now();
    const response = await post(`/api/trees/${child.id}/messages`, { text: question });
    assert.equal(response.status, 200);
    await response.text();
    const saved = store.tree(child.id), reply = saved.messages.at(-1);
    assert.equal(reply.status, 'completed', reply.text);
    for (const fact of ['Aster-731', 'copper', '47']) assert.ok(reply.text.includes(fact), `Missing ${fact}: ${reply.text}`);
    report.turns.push({ label, model: saved.model, status: reply.status, elapsedMs: Math.round(performance.now() - started), text: reply.text });
    return saved;
  }
  const before = await ask('before switch');
  assert.equal(before.model, first.model);
  await browser('open', origin);
  await browser('set', 'media', 'light', 'reduced-motion');
  await browser('wait', '[aria-label="Open Recall the tree"]');
  await click('Fit tree');
  await openTree();
  await wait("!!document.querySelector('[aria-label=\"Model for next reply\"]')");
  // Keyboard-only selection; labels and ordering come from the provider.
  await browser('focus', '[aria-label="Model for next reply"]');
  await browser('press', 'Space');
  await wait("document.activeElement?.getAttribute('role') === 'menuitemradio'");
  await browser('press', 'Home');
  for (let i = 0; i < catalog.indexOf(second); i++) await browser('press', 'ArrowDown');
  assert.equal(await evaluate('document.activeElement?.textContent.trim()'), second.label);
  await browser('press', 'Enter');
  await waitForModel(child.id, second.model);
  await wait(`document.querySelector('.focused-chat').textContent.includes(${JSON.stringify(second.label + ' · saved automatically')}) && !document.querySelector('[aria-label="Model for next reply"]')?.hasAttribute('aria-busy')`);
  assert.equal(store.tree(child.id).model, second.model);
  assert.equal(store.tree(parent.id).model, first.model);
  assert.deepEqual(store.tree(child.id).messages, before.messages);
  assert.deepEqual(store.tree(child.id).branch, before.branch);
  const after = await ask('after switch');
  assert.equal(after.model, second.model);
  assert.equal(after.thread, before.thread);
  assert.deepEqual(after.branch, before.branch);
  client?.close();
  await browser('reload');
  await browser('wait', '[aria-label="Open Recall the tree"]');
  await click('Fit tree');
  await openTree();
  await wait(`document.querySelector('.focused-chat').textContent.includes(${JSON.stringify(second.label + ' · saved automatically')})`);
  const restarted = await ask('after transport restart');
  assert.equal(restarted.thread, before.thread);
  if (!live) {
    const stream = await post(`/api/trees/${child.id}/messages`, { text: 'Hold this turn' });
    await browser('reload');
    await browser('wait', '[aria-label="Open Recall the tree"]');
    await click('Fit tree');
    await openTree();
    await wait("document.querySelector('[aria-label=\"Model for next reply\"]')?.getAttribute('aria-disabled') === 'true'");
    assert.equal((await post(`/api/trees/${child.id}/model`, { model: first.model })).status, 409);
    completeTurn(); await stream.text();
    await wait("document.querySelector('[aria-label=\"Model for next reply\"]')?.getAttribute('aria-disabled') !== 'true'");
    await click('Model for next reply');
    await browser('find', 'role', 'menuitemradio', 'click', '--name', 'Denied', '--exact');
    await wait("document.querySelector('.focused-chat').textContent.includes('Denied · saved automatically')");
    await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Try denied model');
    await click('Send');
    await browser('wait', '--text', 'Synthetic model access denied.');
    await wait("document.querySelector('.focused-chat').textContent.includes('Alternate · saved automatically')");
    assert.equal(store.tree(child.id).model, second.model);
    failCatalog = true;
    await click('Model for next reply');
    await browser('find', 'role', 'menuitemradio', 'click', '--name', 'Original', '--exact');
    await browser('wait', '--text', 'Model change failed. Your previous selection is saved.');
    assert.equal(store.tree(child.id).model, second.model);
    assert.ok(await evaluate("document.querySelector('.focused-chat').textContent.includes('Alternate · saved automatically')"));
    failCatalog = false;
    store.model(child.id, 'fixture-missing');
    await browser('reload');
    await browser('wait', '[aria-label="Open Recall the tree"]');
    await click('Fit tree');
    await openTree();
    await wait("document.querySelector('.focused-chat').textContent.includes('fixture-missing · saved automatically')");
    await click('Model for next reply');
    assert.equal(await evaluate("document.querySelector('[role=menuitemradio][aria-disabled=true]')?.textContent.includes('fixture-missing (saved)')"), true);
    await browser('find', 'role', 'menuitemradio', 'click', '--name', 'Alternate', '--exact');
    await wait("document.querySelector('.focused-chat').textContent.includes('Alternate · saved automatically')");
  }
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    await browser('set', 'viewport', String(width), String(height));
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), 'Horizontal overflow');
    assert.ok(await evaluate("(()=>{const r=document.querySelector('.focused-chat [role=textbox]').getBoundingClientRect();return r.height>0&&r.bottom<=innerHeight})()"), 'Composer clipped');
    await browser('screenshot', join(dir, `model-${width}.png`));
  }
  console.log(JSON.stringify({ result: 'PASS', ...report, screenshots: dir }, null, 2));
} finally {
  completeTurn?.();
  await browser('close').catch(() => {});
  app?.stop(); store?.close(); client?.close();
  await release?.();
}
