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
const wait = expression => browser('wait', '--fn', expression);
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
let release, client, app, store, completeTurn;
const report = { mode: live ? 'live' : 'fixture', date: new Date().toISOString(), turns: [] };
try {
  let provider;
  if (live) {
    const authDir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
    release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
    client = new Codex(new Auth(authDir), dir);
    provider = client;
  } else provider = {
    models: async () => [{ model: 'fixture-original', label: 'Original', isDefault: true }, { model: 'fixture-alternate', label: 'Alternate' }, { model: 'fixture-denied', label: 'Denied' }],
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
  await browser('wait', '--text', 'Open Recall the tree');
  await click('Open Recall the tree');
  await wait("!!document.querySelector('[role=combobox]')");
  // Keyboard-only selection; labels and ordering come from the provider.
  await browser('focus', '[role=combobox]');
  await browser('press', 'Space');
  await browser('press', 'Home');
  for (let i = 0; i < catalog.indexOf(second); i++) await browser('press', 'ArrowDown');
  await browser('press', 'Enter');
  await wait(`document.querySelector('[role=combobox]')?.textContent.includes(${JSON.stringify(second.label)}) && !document.querySelector('[role=combobox]')?.hasAttribute('aria-busy')`);
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
  await browser('wait', '--text', 'Open Recall the tree');
  await click('Open Recall the tree');
  await wait(`document.querySelector('[role=combobox]')?.textContent.includes(${JSON.stringify(second.label)})`);
  const restarted = await ask('after transport restart');
  assert.equal(restarted.thread, before.thread);
  if (!live) {
    const stream = await post(`/api/trees/${child.id}/messages`, { text: 'Hold this turn' });
    await browser('reload');
    await browser('wait', '--text', 'Open Recall the tree');
    await click('Open Recall the tree');
    await wait("document.querySelector('[role=combobox]')?.getAttribute('aria-disabled') === 'true'");
    assert.equal((await post(`/api/trees/${child.id}/model`, { model: first.model })).status, 409);
    completeTurn(); await stream.text();
    await wait("document.querySelector('[role=combobox]')?.getAttribute('aria-disabled') !== 'true'");
    await browser('find', 'role', 'combobox', 'click', '--name', 'Model for next reply');
    await browser('find', 'role', 'option', 'click', '--name', 'Denied', '--exact');
    await wait("document.querySelector('[role=combobox]')?.textContent.includes('Denied')");
    await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Try denied model');
    await click('Send');
    await browser('wait', '--text', 'Synthetic model access denied.');
    await wait("document.querySelector('[role=combobox]')?.textContent.includes('Alternate')");
    assert.equal(store.tree(child.id).model, second.model);
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
