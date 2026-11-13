// Focused Settings role check: built UI, temporary SQLite and controlled providers; no paid inference.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `model-roles-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const checks = [], check = text => { checks.push(text); console.log(`ok - ${text}`); };
const dir = mkdtempSync(join(tmpdir(), 'tt-model-roles-ui-')), store = new Store(join(dir, 'trees.sqlite')), calls = [];
const names = { claude: 'Claude', codex: 'Codex', openai: 'Custom' };
const providers = Object.fromEntries(['claude', 'codex', 'openai'].map(provider => [provider, {
  models: async () => [{ model: 'chat', label: `${names[provider]} chat`, isDefault: true, efforts: provider === 'openai' ? ['low', 'high'] : ['low', 'medium', 'high'] }, { model: 'plain', label: `${names[provider]} plain`, efforts: [] }],
  model: async () => 'chat',
  generate: async () => { calls.push(provider); },
}]));
let app;
const launch = async () => {
  app = createApp({ store, providers, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${app.server.address().port}`;
};
mkdirSync('.impeccable/review', { recursive: true });
const shot = name => b('screenshot', `${process.cwd()}/.impeccable/review/model-roles-${name}.png`);
const dialogText = 'document.querySelector(".settings-page:not([hidden])")?.textContent';
const settings = async () => {
  await wait(`document.querySelector('[aria-label="Map menu"]')?.checkVisibility()`);
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait('document.activeElement?.id === "settings-heading"');
  await b('find', 'text', 'Models', 'click', '--exact');
  await wait(`document.activeElement?.id === 'settings-section-models' && ${dialogText}?.includes("Quick thinking model")`);
};
const choose = async (label, option, saved, exact = true) => {
  await b('find', 'label', label, 'click');
  await b('find', 'role', 'option', 'click', '--name', option, ...exact ? ['--exact'] : []);
  await wait(`${dialogText}?.includes(${JSON.stringify(saved)}) && !${dialogText}?.includes("Saving")`);
};
const value = label => ev(`(() => { const l = [...document.querySelectorAll('.settings-page:not([hidden]) label, .settings-page:not([hidden]) [id]')].find(e => e.textContent.trim() === ${JSON.stringify(label)}); const c = l && (document.getElementById(l.htmlFor) || document.querySelector('[aria-labelledby~="' + l.id + '"]')); return c?.textContent.trim() ?? null; })()`);
const focusNamed = (selector, name) => wait(`(() => {
  const label = e => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || [...(e.labels || [])].map(l => l.textContent).join(' ') || e.textContent).trim();
  const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => label(e).startsWith(${JSON.stringify(name)}));
  el?.focus(); return !!el && document.activeElement === el;
})()`);

try {
  let origin = await launch();
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await settings();
  assert.deepEqual(await ev(`[...document.querySelectorAll('.settings-page:not([hidden]) [role=table] [role=rowheader] b')].map(h => h.textContent)`), ['Chat', 'Smart', 'Quick thinking']);
  assert.equal(await ev(`document.querySelector('.settings-page:not([hidden]) [role=table]').getAttribute('aria-label')`), 'Roles in Default');
  await choose('Chat default model', 'Codex chat', 'Chat defaults saved.');
  await choose('Chat default effort', 'High', 'Chat defaults saved.');
  await wait(`${dialogText}?.includes("Follow chat default (Codex chat)") && ${dialogText}?.includes("Follow chat default (High)")`);
  check('Upgrade/fresh profile "Default" is active; all three roles are visible in one table; smart follows the changed chat default model and effort dynamically');

  await choose('Smart effort', 'Low', 'Smart settings saved.');
  assert.deepEqual(store.smartSettings(), { model: null, followEffort: false, effort: 'low' });
  await choose('Chat default model', 'Claude chat', 'Chat defaults saved.');
  await wait(`${dialogText}?.includes("Follow chat default (Claude chat)")`);
  await choose('Smart model', 'Custom chat', 'Smart settings saved.');
  assert.deepEqual(store.smartSettings(), { model: { provider: 'openai', model: 'chat' }, followEffort: false, effort: 'low' });
  assert.deepEqual({ ...store.chatSettings() }, { provider: 'claude', model: 'chat', effort: 'high' });
  check('Smart effort pin keeps following the chat model; smart model pin keeps its own effort and never changes chat defaults');

  await choose('Quick thinking model', 'Custom plain', 'Quick thinking settings saved.');
  await b('find', 'label', 'Quick thinking effort', 'click');
  assert.deepEqual(JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll("[role=listbox]")].filter(l => l.checkVisibility()).map(l => [...l.querySelectorAll("[role=option]")].map(o => o.textContent)))`)), [['Provider default']]);
  await b('press', 'Escape');
  await choose('Quick thinking model', 'Custom chat', 'Quick thinking settings saved.');
  // Keyboard: open effort, move to last listed effort, commit.
  await focusNamed('button,[role=combobox],input', 'Quick thinking effort');
  await b('press', 'Enter'); await b('press', 'End'); await b('press', 'Enter');
  await wait(`${dialogText}?.includes("Quick thinking settings saved.") && !${dialogText}?.includes("Saving")`);
  assert.deepEqual(store.suggestionSettings(), { enabled: true, model: { provider: 'openai', model: 'chat' }, effort: 'high' });
  assert.equal(calls.length, 0, 'configuring roles starts no model call');
  check('Quick thinking accepts the custom endpoint, offers only advertised efforts and saves effort by keyboard without any model call');
  await shot('settings-dark-desktop');

  await b('close').catch(() => {});
  await app.stop();
  origin = await launch();
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await settings();
  await wait(`${dialogText}?.includes("Custom chat") && !${dialogText}?.includes("Loading")`);
  assert.deepEqual(store.smartSettings(), { model: { provider: 'openai', model: 'chat' }, followEffort: false, effort: 'low' });
  for (const [label, expected] of [['Smart model', 'Custom chat'], ['Smart effort', 'Low'], ['Quick thinking model', 'Custom chat'], ['Quick thinking effort', 'High']]) {
    const shown = await value(label);
    assert.ok(shown?.includes(expected), `${label}: ${shown}`);
  }
  check('Restarting the server restores every role selection in Settings');

  // Profiles: management UI is TreeTutor-2li.10, so the second profile is created through the store seam.
  const homeRoles = { chat: { ...store.chatSettings() }, smart: store.smartSettings(), quick: store.suggestionSettings() };
  const deep = store.createProfile('Deep study');
  store.activateProfile(deep); store.saveSuggestionSettings({ enabled: true, model: { provider: 'openai', model: 'retired' }, effort: null }); store.activateProfile(store.profiles().profiles[0].id);
  await b('reload'); await settings();
  await choose('Model profile', 'Deep study', 'Changes save into Deep study.', false);
  await wait(`document.querySelector('.settings-page:not([hidden]) [role=table]')?.getAttribute('aria-label') === 'Roles in Deep study' && ${dialogText}?.includes('retired (unavailable)') && ${dialogText}?.includes('Quick thinking model unavailable')`);
  assert.equal(store.profiles().active, deep);
  assert.deepEqual(store.suggestionSettings().model, { provider: 'openai', model: 'retired' }, 'an unavailable model is flagged, never replaced');
  await shot('profile-unavailable-dark-desktop');
  await choose('Chat default model', 'Codex plain', 'Chat defaults saved.');
  assert.deepEqual({ ...store.chatSettings() }, { provider: 'codex', model: 'plain', effort: null });
  await choose('Model profile', 'Default', 'Changes save into Default.', false);
  await wait(`![...document.querySelectorAll('.settings-page:not([hidden]) [role=alert]')].some(a => a.textContent.includes('unavailable')) && !${dialogText}?.includes('Loading')`);
  assert.deepEqual({ chat: { ...store.chatSettings() }, smart: store.smartSettings(), quick: store.suggestionSettings() }, homeRoles, 'edits saved into Deep study only');
  for (const [label, expected] of [['Chat default model', 'Claude chat'], ['Quick thinking model', 'Custom chat']]) assert.ok((await value(label))?.includes(expected), label);
  assert.equal(calls.length, 0, 'swapping starts no model call');
  check('Picker swaps all three roles at once; role edits save into the active profile; an unavailable model swaps in flagged and unreplaced');

  for (const appearance of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', '${appearance}'); true`);
    await b('set', 'viewport', '390', '844');
    await b('reload');
    await settings();
    assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true);
    assert.equal(await ev('document.querySelector(".settings-page:not([hidden])").scrollWidth <= innerWidth'), true);
    await b('find', 'text', 'Smart', 'scrollintoview', '--exact').catch(() => {});
    await shot(`settings-${appearance}-narrow`);
  }
  check('Dark/light narrow Settings fit without horizontal overflow; screenshots captured');
  writeFileSync('docs/verification/model-roles-ui.json', JSON.stringify({ date: new Date().toISOString(), boundary: 'built UI + real HTTP/store + controlled providers, no native inference', checks, result: 'PASS' }, null, 2) + '\n');
} finally { await b('close').catch(() => {}); await app?.stop(); store.close(); }
