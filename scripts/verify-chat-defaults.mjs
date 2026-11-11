// Focused Settings/conversation check: built UI, temporary SQLite and controlled providers; no paid inference.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `chat-defaults-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const checks = [], check = text => { checks.push(text); console.log(`ok - ${text}`); };
const dir = mkdtempSync(join(tmpdir(), 'tt-chat-settings-ui-')), store = new Store(join(dir, 'trees.sqlite'));
const root = store.create('Saved discussion', 'claude', 'sonnet');
store.message(root.id, 'user', 'Remember the cedar grove.', 'completed');
store.message(root.id, 'assistant', 'The cedar grove has forty-seven trees.', 'completed');
const before = store.tree(root.id), calls = [];
let connected = true;
const providers = Object.fromEntries(['claude', 'codex', 'openai'].map(provider => [provider, {
  models: async () => {
    if (!connected) throw new Error('Fixture disconnected');
    return [{ model: provider === 'claude' ? 'sonnet' : 'chat', label: `${provider === 'openai' ? 'Custom' : provider === 'claude' ? 'Claude' : 'Codex'} chat`, isDefault: true, efforts: provider === 'openai' ? [] : ['low', 'high'] }];
  },
  model: async () => provider === 'claude' ? 'sonnet' : 'chat',
  generate: async (tree, text, emit, save) => { calls.push({ provider, model: tree.model, effort: tree.effort }); save(`${provider}-${tree.id}`, tree.model); emit({ type: 'item', item: 'reply', text: 'A cedar is an evergreen tree.' }); emit({ type: 'status', status: 'completed' }); },
}]));
const app = createApp({ store, providers, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: true }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
mkdirSync('.impeccable/review', { recursive: true });
const shot = name => b('screenshot', `${process.cwd()}/.impeccable/review/chat-defaults-${name}.png`);
const settings = async () => {
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait('document.querySelector("dialog[open]")');
  await b('find', 'text', 'Models', 'click', '--exact');
  await wait('document.querySelector("dialog[open]")?.textContent.includes("Chat default")');
};
const choose = async (label, option) => {
  await b('find', 'label', label, 'click');
  await b('find', 'role', 'option', 'click', '--name', option, '--exact');
  await wait('document.querySelector("dialog[open]")?.textContent.includes("Chat defaults saved.")');
};
const menu = async () => { await b('find', 'role', 'button', 'click', '--name', 'Model for next reply', '--exact'); await wait('document.querySelector("[role=menu]")'); };

try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await wait(`document.querySelector('[aria-label="Open Saved discussion"]')`);
  await b('find', 'role', 'button', 'click', '--name', 'Open Saved discussion', '--exact');
  await settings();
  await choose('Chat default model', 'Codex chat');
  await choose('Chat default effort', 'High');
  assert.deepEqual(store.chatSettings(), { provider: 'codex', model: 'chat', effort: 'high' });
  assert.deepEqual(store.tree(root.id), before);
  assert.equal(calls.length, 0);
  check('Settings saves provider/model/effort through HTTP without inference or rewriting an existing conversation');
  await shot('settings-dark-desktop');

  // Astryx selector keyboard model: open, move to first (Provider default), commit, then restore High.
  await b('find', 'label', 'Chat default effort', 'focus');
  await b('press', 'Enter'); await b('press', 'Home'); await b('press', 'Enter');
  await wait('document.querySelector("dialog[open]")?.textContent.includes("Chat defaults saved.")');
  assert.equal(store.chatSettings().effort, null);
  await choose('Chat default effort', 'High');
  await b('find', 'role', 'button', 'click', '--name', 'Close settings', '--exact');
  await wait('!document.querySelector("dialog[open]")');
  await b('find', 'role', 'button', 'click', '--name', 'New chat', '--exact');
  await wait('document.querySelector(".chat-model")?.textContent.includes("Codex chat · High")');
  const fresh = store.list().find(t => t.title === 'New chat');
  assert.ok(fresh); assert.equal(store.tree(fresh.id).effort, 'high');
  check('Keyboard can save effort; New chat uses saved global defaults');
  await menu();
  await b('find', 'role', 'menuitemradio', 'focus', '--name', 'Low', '--exact'); await b('press', 'Enter');
  await wait('document.querySelector(".chat-model")?.textContent.includes("Codex chat · Low")');
  assert.equal(store.tree(fresh.id).effort, 'low'); assert.equal(store.chatSettings().effort, 'high');
  await menu();
  await b('find', 'role', 'menuitemradio', 'click', '--name', 'Custom chat', '--exact');
  await wait('document.querySelector(".chat-model")?.textContent.includes("Custom endpoint · Custom chat · Provider default")');
  await wait('document.querySelector(".chat-header [role=status]")?.textContent.includes("Effort changed to Provider default")');
  await menu();
  assert.equal(await ev('document.querySelectorAll("[role=menuitemradio]").length'), 4, 'three models plus Provider default only');
  await b('press', 'Escape');
  check('Keyboard conversation effort override preserves global defaults; custom model without capabilities exposes only Provider default and explains reset');

  await b('reload');
  await wait('document.querySelector(".chat-model")?.textContent.includes("Custom endpoint · Custom chat · Provider default")');
  await settings();
  assert.deepEqual(store.chatSettings(), { provider: 'codex', model: 'chat', effort: 'high' });
  await choose('Chat default model', 'Custom chat');
  await b('find', 'label', 'Chat default effort', 'click');
  assert.equal(await ev('document.querySelectorAll("[role=option]").length'), 1);
  await b('press', 'Escape');
  check('Reopening restores conversation override and Settings choices; custom Settings effort is limited to Provider default');

  for (const appearance of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', '${appearance}'); true`);
    await b('reload');
    await wait('document.querySelector(".chat-model")');
    await b('set', 'viewport', '390', '844');
    await menu();
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
    await shot(`conversation-${appearance}-narrow`);
    await b('press', 'Escape');
    await settings();
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(await ev('document.querySelector("dialog[open]").scrollWidth <= innerWidth'), true);
    await shot(`settings-${appearance}-narrow`);
    await b('press', 'Escape');
    await b('set', 'viewport', '1440', '900');
  }
  check('Dark/light narrow conversation menus and Settings fit without horizontal overflow; screenshot review captured desktop and narrow states');
  await settings();
  connected = false;
  await b('find', 'role', 'button', 'click', '--name', 'Refresh chat models', '--exact');
  await wait('document.querySelector("dialog[open]")?.textContent.includes("Saved chat default unavailable")');
  assert.deepEqual(store.chatSettings(), { provider: 'openai', model: 'chat', effort: null });
  connected = true;
  await b('find', 'role', 'button', 'click', '--name', 'Refresh chat models', '--exact');
  await wait('!document.querySelector("dialog[open]")?.textContent.includes("Saved chat default unavailable")');
  check('Unavailable saved defaults show actionable recovery, retain values and recover on refresh');
  writeFileSync('docs/verification/chat-defaults-ui.json', JSON.stringify({ date: new Date().toISOString(), boundary: 'built UI + real HTTP/store + controlled providers, no native inference', checks, result: 'PASS' }, null, 2) + '\n');
} finally { await b('close').catch(() => {}); await app.stop(); store.close(); }
