// Focused Settings/conversation check: built UI, temporary SQLite and controlled providers; no paid inference.
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
  session = `chat-defaults-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const checks = [],
  check = (text) => {
    checks.push(text);
    console.log(`ok - ${text}`);
  };
const dir = mkdtempSync(join(tmpdir(), 'tt-chat-settings-ui-')),
  store = new Store(join(dir, 'trees.sqlite'));
const root = store.create('Saved discussion', 'claude', 'sonnet');
store.message(root.id, 'user', 'Remember the cedar grove.', 'completed');
store.message(root.id, 'assistant', 'The cedar grove has forty-seven trees.', 'completed');
const before = store.tree(root.id),
  calls = [];
let connected = true;
const providers = Object.fromEntries(
  ['claude', 'codex', 'openai'].map((provider) => [
    provider,
    {
      models: async () => {
        if (!connected) throw new Error('Fixture disconnected');
        return [
          {
            model: provider === 'claude' ? 'sonnet' : 'chat',
            label: `${provider === 'openai' ? 'Custom' : provider === 'claude' ? 'Claude' : 'Codex'} chat`,
            isDefault: true,
            efforts: provider === 'openai' ? [] : ['low', 'high'],
          },
        ];
      },
      model: async () => (provider === 'claude' ? 'sonnet' : 'chat'),
      generate: async (tree, text, emit, save) => {
        calls.push({ provider, model: tree.model, effort: tree.effort });
        save(`${provider}-${tree.id}`, tree.model);
        emit({ type: 'item', item: 'reply', text: 'A cedar is an evergreen tree.' });
        emit({ type: 'status', status: 'completed' });
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
  b('screenshot', `${process.cwd()}/.impeccable/review/chat-defaults-${name}.png`);
const settings = async () => {
  await wait(`document.querySelector('[aria-label="Map menu"]')?.checkVisibility()`);
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait('document.activeElement?.id === "settings-heading"');
  await b('find', 'text', 'Models', 'click', '--exact');
  await wait(
    'document.activeElement?.id === "settings-section-models" && document.querySelector(".settings-page:not([hidden])")?.textContent.includes("Chat default")',
  );
};
const choose = async (label, option) => {
  await b('find', 'label', label, 'click');
  await b('find', 'role', 'option', 'click', '--name', option, '--exact');
  await wait(
    'document.querySelector(".settings-page:not([hidden])")?.textContent.includes("Chat defaults saved.")',
  );
};
// Focus retries until an opening menu stops reclaiming focus; Enter then commits by keyboard.
const focusNamed = (selector, name) =>
  wait(`(() => {
  const label = e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || [...(e.labels || [])].map(l => l.textContent).join(' ') || e.textContent).trim();
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => label(e).startsWith(${JSON.stringify(name)}));
  el?.focus(); return !!el && document.activeElement === el;
})()`);
const menu = async () => {
  await b('find', 'role', 'button', 'click', '--name', 'Model for next reply', '--exact');
  await wait('document.querySelector("[role=menu] [role=menuitemradio]")?.checkVisibility()');
};

try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await wait(`document.querySelector('[aria-label="Open Saved discussion"]')`);
  await b('find', 'role', 'button', 'click', '--name', 'Open Saved discussion', '--exact');
  await settings();
  await choose('Chat default model', 'Codex chat');
  await choose('Chat default effort', 'High');
  assert.deepEqual(
    { ...store.chatSettings() },
    { provider: 'codex', model: 'chat', effort: 'high' },
  );
  assert.deepEqual(store.tree(root.id), before);
  assert.equal(calls.length, 0);
  check(
    'Settings saves provider/model/effort through HTTP without inference or rewriting an existing conversation',
  );
  await shot('settings-dark-desktop');

  // Astryx selector keyboard model: open, move to first (Provider default), commit, then restore High.
  await focusNamed('button,[role=combobox],input', 'Chat default effort');
  await b('press', 'Enter');
  await b('press', 'Home');
  await b('press', 'Enter');
  await wait(
    'document.querySelector(".settings-page:not([hidden])")?.textContent.includes("Chat defaults saved.")',
  );
  assert.equal(store.chatSettings().effort, null);
  await choose('Chat default effort', 'High');
  await b('find', 'role', 'button', 'click', '--name', 'Return to learning tree', '--exact');
  await wait('!document.querySelector(".settings-page:not([hidden])")');
  await b('find', 'role', 'button', 'click', '--name', 'New chat', '--exact');
  await wait(
    'document.querySelector(".first-question .chat-model")?.textContent.includes("Codex chat · High")',
  );
  assert.ok(
    !store.list().some((t) => t.title === 'New chat'),
    'New chat saves nothing before the first send',
  );
  await b('click', '.first-question [role=textbox]');
  await b('keyboard', 'type', 'What is a cedar?');
  await b('press', 'Enter');
  await wait(
    'document.querySelector(".chat-model")?.textContent.includes("Codex chat · High") && document.querySelector(".focused-chat h2")?.textContent === "What is a cedar?"',
  );
  const fresh = store.list().find((t) => t.title === 'What is a cedar?');
  assert.ok(fresh);
  assert.equal(store.tree(fresh.id).effort, 'high');
  check(
    'Keyboard can save effort; New chat uses saved global defaults for the tree its first send creates',
  );
  await menu();
  await focusNamed('[role=menuitemradio]', 'Low');
  await b('press', 'Enter');
  await wait('document.querySelector(".chat-model")?.textContent.includes("Codex chat · Low")');
  assert.equal(store.tree(fresh.id).effort, 'low');
  assert.equal(store.chatSettings().effort, 'high');
  await menu();
  await b('find', 'role', 'menuitemradio', 'click', '--name', 'Custom chat', '--exact');
  await wait(
    'document.querySelector(".chat-model")?.textContent.includes("Custom endpoint · Custom chat · Provider default")',
  );
  await wait(
    '[...document.querySelectorAll(".chat-header [role=status]")].some(e => e.textContent.includes("Effort changed to Provider default"))',
  );
  await menu();
  assert.equal(
    await ev('document.querySelectorAll("[role=menuitemradio]").length'),
    4,
    'three models plus Provider default only',
  );
  await b('press', 'Escape');
  check(
    'Keyboard conversation effort override preserves global defaults; custom model without capabilities exposes only Provider default and explains reset',
  );

  await b('reload');
  await wait(
    'document.querySelector(".chat-model")?.textContent.includes("Custom endpoint · Custom chat · Provider default")',
  );
  await settings();
  assert.deepEqual(
    { ...store.chatSettings() },
    { provider: 'codex', model: 'chat', effort: 'high' },
  );
  await choose('Chat default model', 'Custom chat');
  await b('find', 'label', 'Chat default effort', 'click');
  assert.deepEqual(
    JSON.parse(
      await ev(
        `JSON.stringify([...document.querySelectorAll("[role=listbox]")].filter(l => l.checkVisibility()).map(l => [...l.querySelectorAll("[role=option]")].map(o => o.textContent)))`,
      ),
    ),
    [['Provider default']],
  );
  await b('press', 'Escape');
  check(
    'Reopening restores conversation override and Settings choices; custom Settings effort is limited to Provider default',
  );

  for (const appearance of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', '${appearance}'); true`);
    await b('reload');
    await wait('document.querySelector(".chat-model")');
    await b('set', 'viewport', '390', '844');
    // Narrow layout can show the map instead of the chat; open the conversation if so.
    if (
      !(await ev(
        '!!document.querySelector(\'[aria-label="Model for next reply"]\')?.checkVisibility()',
      ))
    )
      await b('find', 'role', 'button', 'click', '--name', 'Reopen chat', '--exact');
    await wait(`document.querySelector('[aria-label="Model for next reply"]')?.checkVisibility()`);
    await menu();
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
    await shot(`conversation-${appearance}-narrow`);
    await b('press', 'Escape');
    await b('find', 'role', 'button', 'click', '--name', 'Return to tree', '--exact');
    await settings();
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(
      await ev('document.querySelector(".settings-page:not([hidden])").scrollWidth <= innerWidth'),
      true,
    );
    await shot(`settings-${appearance}-narrow`);
    await b('press', 'Escape');
    await b('set', 'viewport', '1440', '900');
  }
  check(
    'Dark/light narrow conversation menus and Settings fit without horizontal overflow; screenshot review captured desktop and narrow states',
  );
  await settings();
  connected = false;
  await b('find', 'role', 'button', 'click', '--name', 'Refresh models', '--exact');
  await wait(
    'document.querySelector(".settings-page:not([hidden])")?.textContent.includes("Saved chat default unavailable")',
  );
  assert.deepEqual(
    { ...store.chatSettings() },
    { provider: 'openai', model: 'chat', effort: null },
  );
  connected = true;
  await b('find', 'role', 'button', 'click', '--name', 'Refresh models', '--exact');
  await wait(
    '!document.querySelector(".settings-page:not([hidden])")?.textContent.includes("Saved chat default unavailable")',
  );
  check(
    'Unavailable saved defaults show actionable recovery, retain values and recover on refresh',
  );
  writeFileSync(
    `${verifyOut}/chat-defaults-ui.json`,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        boundary: 'built UI + real HTTP/store + controlled providers, no native inference',
        checks,
        result: 'PASS',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
