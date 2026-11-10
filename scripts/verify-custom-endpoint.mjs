// Real built UI, HTTP, storage and keyboard focus; provider replies are synthetic fixtures.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Store } from '../server/store.mjs';
import { OpenAI } from '../server/openai.mjs';
import { createApp } from '../server/app.mjs';
import { fakeOpenAI, streamReply } from '../test/fake-openai.mjs';

process.umask(0o077);
const filename = fileURLToPath(import.meta.url);
if (process.argv[2] === '--serve') {
  const dir = process.argv[3], store = new Store(join(dir, 'trees.sqlite')), endpoint = new OpenAI(dir);
  let offline = false;
  const native = (model, label) => ({
    models: async () => { if (offline) throw new Error('Fixture offline'); return [{ model, label, isDefault: true }]; },
    generate: async (tree, _text, emit, save) => { save(tree.thread ?? `fixture-${tree.id}`, tree.model); emit({ type: 'item', item: 'a', text: 'Peterson fixture continuation.' }); emit({ type: 'status', status: 'completed' }); },
  });
  const app = createApp({ store, dir, endpoint, providers: { claude: native('sonnet', 'Sonnet'), codex: native('codex-model', 'Codex model'), ...(endpoint.status().configured && { openai: endpoint }) }, defaultProvider: 'claude', auth: { status: () => ({ connected: true }) } });
  process.on('message', async message => {
    if (message === 'stop') { await app.stop(); store.close(); process.exit(0); }
    offline = message === 'offline'; process.send({ ack: message });
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}`, pid: process.pid });
} else {
  const dir = mkdtempSync(join(tmpdir(), 'tt-endpoint-ui-')), cleanup = [];
  const fake = await fakeOpenAI({ after: fn => cleanup.push(fn) });
  fake.reply = (req, res) => streamReply(res, ['Peterson fixture continuation.']);
  const store = new Store(join(dir, 'trees.sqlite')), root = store.create('Root switch fixture', 'claude');
  store.model(root.id, 'sonnet');
  store.message(root.id, 'user', 'Root seed question', 'completed');
  const source = store.message(root.id, 'assistant', 'Peterson root passage', 'completed');
  const child = store.branch(store.tree(root.id), { messageId: source, start: 0, end: 8, text: 'Peterson', question: 'Child fixture' }, 'Frozen root fact 47');
  const childSource = store.message(child.id, 'assistant', 'Peterson child passage', 'completed');
  const nested = store.branch(store.tree(child.id), { messageId: childSource, start: 0, end: 8, text: 'Peterson', question: 'Nested switch fixture' }, 'Frozen marble grove has 83 trees.');
  store.message(nested.id, 'user', 'Nested seed question', 'completed');
  store.message(nested.id, 'assistant', 'Nested seed answer', 'completed');
  store.layout(root.id, { folded: [], selected: root.id, panel: 'beside' });
  store.close();
  const exec = promisify(execFile), session = `tt-endpoint-${process.pid}`;
  const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
  const evaluate = async expression => JSON.parse(await browser('eval', expression, '--json')).data.result;
  const wait = expression => browser('wait', '--fn', expression, '--timeout', '15000');
  const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
  const fill = (label, text) => browser('find', 'label', label, 'fill', text);
  const checks = [], pass = name => { checks.push(name); console.log('PASS:', name); };
  let server, origin;
  async function start() { server = fork(filename, ['--serve', dir], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }); const [ready] = await once(server, 'message'); origin = ready.origin; return ready.pid; }
  async function stop() { const stopped = once(server, 'exit'); server.send('stop'); await stopped; }
  async function signal(message) { const ack = once(server, 'message'); server.send(message); await ack; }
  const get = async path => (await fetch(origin + path)).json();
  const saved = id => get(`/api/trees/${id}`);
  const field = '.endpoint-settings input[type=url]', key = '.endpoint-settings input[type=password]';
  async function tabTo(selector, text) {
    for (let i = 0; i < 80; i++) { if (await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)}) && (${text === undefined ? 'true' : `document.activeElement.textContent.trim() === ${JSON.stringify(text)}`})`)) return; await browser('press', 'Tab'); }
    assert.fail(`Tab did not reach ${selector}: ` + await evaluate('document.activeElement?.outerHTML'));
  }
  async function menuItem(label) {
    await browser('press', 'Home');
    for (let i = 0; i < 20; i++) {
      if (await evaluate(`document.activeElement?.textContent.trim().startsWith(${JSON.stringify(label)})`)) { await browser('press', 'Enter'); return; }
      await browser('press', 'ArrowDown');
    }
    assert.fail(`Menu item not reached: ${label}`);
  }
  async function modelMenu() {
    if (!await evaluate('!!document.querySelector(".focused-chat")?.getClientRects().length')) { await tabTo('[aria-label="Reopen chat"]'); await browser('press', 'Enter'); }
    await tabTo('[aria-label="Model for next reply"]'); await browser('press', 'Space'); await wait(`document.querySelector('[aria-label="Model for next reply"]')?.getAttribute('aria-expanded') === 'true' && [...document.querySelectorAll('[role=menu]')].some(e=>e.getClientRects().length)`);
  }
  async function mapMenu() {
    if (!await evaluate(`!!document.querySelector('[aria-label="Map menu"]')?.getClientRects().length`)) await browser('press', 'Escape');
    await tabTo('[aria-label="Map menu"]'); await browser('press', 'Space');
  }
  async function endpointSettings() { await modelMenu(); await menuItem('Custom endpoint settings'); await wait(`document.activeElement?.matches('${field}')`); }
  async function keyboardSave() {
    await tabTo(field); await browser('press', 'Control+a'); await browser('keyboard', 'inserttext', fake.baseUrl);
    await tabTo(key); await browser('keyboard', 'inserttext', 'ui-fixture-secret');
    assert.equal(await evaluate(`document.querySelector('${key}').type`), 'password');
    await browser('press', 'Enter'); await wait('document.querySelector(".endpoint-settings").textContent.includes("Endpoint saved.")');
    assert.equal(await evaluate(`document.querySelector('${key}').value`), '');
    assert.deepEqual(await get('/api/settings/endpoint'), { configured: true, baseUrl: fake.baseUrl });
  }
  async function closeSettings() { await tabTo('[aria-label="Close learning trees"]'); await browser('press', 'Enter'); await wait('document.querySelector(".trees").dataset.open === "false"'); }
  async function openConversation(title) { await tabTo(`[aria-label="Open ${title}"]`); await browser('press', 'Enter'); await wait(`document.querySelector('.chat-title h2')?.textContent === ${JSON.stringify(title)}`); }
  const labels = { claude: 'Sonnet', codex: 'Codex model', openai: 'second-model' };
  const models = { claude: 'sonnet', codex: 'codex-model', openai: 'second-model' };
  async function switchCycle(id, phase) {
    for (const provider of ['openai', 'codex', 'claude', 'codex', 'openai', 'claude']) {
      const before = await saved(id), from = before.provider;
      const visible = await evaluate("[...document.querySelectorAll('.focused-chat article')].map(e=>e.textContent)");
      assert.equal(visible.length, before.messages.length);
      await modelMenu(); await menuItem(labels[provider]);
      await wait(`document.querySelector('.chat-title')?.textContent.includes(${JSON.stringify(labels[provider] + ' · saved automatically')})`);
      const after = await saved(id);
      assert.equal(after.provider, provider); assert.equal(after.model, models[provider]);
      assert.deepEqual(after.messages, before.messages); assert.deepEqual(after.branch, before.branch);
      assert.deepEqual(await evaluate("[...document.querySelectorAll('.focused-chat article')].map(e=>e.textContent)"), visible);
      await tabTo('[role=textbox][aria-label="Your question"]');
      await browser('keyboard', 'inserttext', `${phase}: ${from} to ${provider}`); await browser('press', 'Enter');
      await wait(`document.querySelectorAll('.focused-chat article').length === ${before.messages.length + 2} && ![...document.querySelectorAll('.focused-chat [role=status]')].some(e=>e.textContent.includes('Responding')) && document.querySelector('[aria-label="Model for next reply"]')?.getAttribute('aria-disabled') !== 'true'`);
      const replied = await saved(id); assert.equal(replied.messages.length, before.messages.length + 2); assert.equal(replied.messages.at(-1).status, 'completed');
      assert.equal(replied.provider, provider);
      pass(`${phase}: keyboard ${from} -> ${provider}, transcript unchanged and next reply completed`);
    }
  }
  try {
    const firstPid = await start();
    await browser('set', 'viewport', '1280', '900'); await browser('open', origin); await browser('set', 'media', 'light', 'reduced-motion');
    await browser('wait', '[aria-label="Model for next reply"]');
    await endpointSettings(); await keyboardSave();
    await tabTo('.endpoint-settings button', 'Test connection'); await browser('press', 'Enter'); await wait('document.querySelector(".endpoint-settings").textContent.includes("Connection works:")');
    await tabTo('.endpoint-settings button', 'Remove'); await browser('press', 'Space'); await wait('document.querySelector(".endpoint-settings").textContent.includes("Endpoint removed.")');
    assert.deepEqual(await get('/api/settings/endpoint'), { configured: false, baseUrl: null });
    pass('keyboard-only menu -> focused configuration -> Save -> Test -> Remove; key cleared and never returned');
    await fill('Base URL', fake.baseUrl); await fill('API key', 'ui-fixture-secret'); await click('Save');
    await wait('document.querySelector(".endpoint-settings").textContent.includes("Endpoint saved.")');
    await click('Test connection'); await wait('document.querySelector(".endpoint-settings").textContent.includes("Connection works:")');
    await click('Remove'); await wait('document.querySelector(".endpoint-settings").textContent.includes("Endpoint removed.")');
    pass('mouse Save, Test and Remove use the same real settings API');
    await keyboardSave();
    await closeSettings();
    await mapMenu(); await menuItem('Settings');
    await wait('document.activeElement?.id === "settings-heading"');
    await wait(`!!document.querySelector('${field}') && document.querySelector('${field}').value !== ''`);
    assert.equal(await evaluate(`document.querySelector('${key}').value`), '');
    assert.equal(await evaluate(`document.querySelector('${field}').value`), fake.baseUrl);
    await fill('API key', 'unsaved-fixture-key');
    assert.ok(await evaluate(`[...document.querySelectorAll('.endpoint-settings button')].find(b=>b.textContent.trim()==='Test connection').disabled`));
    await closeSettings();
    pass('Map menu Settings focuses the section; reopen restores URL only; unsaved edits cannot be tested');
    await switchCycle(root.id, 'root before restart');
    await openConversation('Nested switch fixture'); await switchCycle(nested.id, 'nested before restart');
    const beforeRestart = await saved(nested.id); await stop(); const secondPid = await start(); assert.notEqual(firstPid, secondPid);
    await browser('open', origin); await browser('wait', '[aria-label="Open Nested switch fixture"]');
    await openConversation('Root switch fixture'); assert.equal((await saved(root.id)).provider, 'claude');
    await switchCycle(root.id, 'root after restart');
    await openConversation('Nested switch fixture'); assert.deepEqual(await saved(nested.id), beforeRestart);
    await switchCycle(nested.id, 'nested after restart');
    pass('fresh server PID, SQLite/credential reload and all six directions repeated in root and depth-two child');
    // The catalogue can fail while other providers work, then while every provider fails.
    fake.modelStatus = 401;
    await endpointSettings();
    await tabTo('.endpoint-settings button', 'Test connection'); await browser('press', 'Enter');
    await wait('!!document.querySelector(".endpoint-settings [role=alert]")');
    assert.ok((await evaluate('document.querySelector(".endpoint-settings [role=alert]").textContent')).includes('API key'));
    assert.equal(await evaluate(`document.querySelector('${key}').value`), '');
    await closeSettings(); await signal('offline');
    await endpointSettings(); await wait(`document.querySelector('${field}').value !== ''`);
    pass('failing endpoint and total catalogue failure keep an actionable settings item; Test names API-key recovery');
    fake.modelStatus = 200; fake.models = [];
    await closeSettings(); await signal('online'); await endpointSettings();
    pass('empty endpoint catalogue also routes to settings instead of a dead selection');
    fake.models = [{ id: 'local-tutor' }, { id: 'second-model' }];
    await click('Test connection'); await wait('document.querySelector(".endpoint-settings").textContent.includes("Connection works:")');
    await closeSettings(); await modelMenu(); await menuItem('second-model');
    await wait('document.querySelector(".chat-title").textContent.includes("second-model · saved automatically")');
    await mapMenu(); await menuItem('Settings');
    await wait(`document.querySelector('${field}').value !== ''`);
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      await browser('set', 'viewport', String(width), String(height));
      await tabTo(field); await browser('screenshot', join(dir, `settings-${width}.png`));
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow');
      await closeSettings(); await modelMenu(); await browser('screenshot', join(dir, `menu-${width}.png`));
      assert.ok(await evaluate('(()=>{const r=[...document.querySelectorAll("[role=menu]")].find(e=>e.getClientRects().length)?.getBoundingClientRect();return r&&r.width>0&&r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()'), 'Menu outside viewport');
      await browser('press', 'Escape');
      assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'), 'Model for next reply');
      await mapMenu(); await menuItem('Settings'); await wait(`!!document.querySelector('${field}')`);
    }
    pass('desktop/mobile form scroll and menu bounds; Escape returns focus to the model button');
    await tabTo('.endpoint-settings button', 'Remove'); await browser('press', 'Enter'); await wait('document.querySelector(".endpoint-settings").textContent.includes("Endpoint removed.")');
    assert.equal((await saved(nested.id)).provider, 'openai', 'removal never silently changes provider');
    await closeSettings(); await modelMenu(); await menuItem('Custom endpoint settings'); await wait(`document.activeElement?.matches('${field}')`);
    assert.equal(await evaluate(`document.querySelector('${key}').value`), '');
    await closeSettings(); await modelMenu(); await menuItem('Sonnet');
    await wait('document.querySelector(".chat-title").textContent.includes("Sonnet · saved automatically")');
    pass('removed endpoint stays explicit in saved chat; actionable menu repairs it or switches to Claude');
    await mapMenu(); await menuItem('Help');
    assert.ok((await evaluate('document.querySelector(".trees").textContent')).includes('New chats default to Claude.'));
    assert.ok(!await evaluate('document.body.textContent.includes("ui-fixture-secret") || document.body.innerHTML.includes("unsaved-fixture-key")'));
    const result = { result: 'PASS', mode: 'fixture', date: new Date().toISOString(), liveEndpointTested: false, serverPids: [firstPid, secondPid], checks, screenshots: dir };
    writeFileSync('docs/verification/custom-endpoint-settings-results.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Fixture checkpoint:', dir, await browser('snapshot', '-i').catch(() => 'browser unavailable'));
    throw error;
  } finally {
    await browser('close').catch(() => {});
    if (server?.connected) await stop();
    for (const fn of cleanup) await fn();
  }
}
