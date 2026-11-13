// Settings window (TreeTutor-u7v.3): tabs, entry points, focus handling and mobile layout.
// Built app, isolated database, synthetic providers, agent-browser Chromium. Screenshots go to .impeccable/review/.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { OpenAI } from '../server/openai.mjs';
import { fakeOpenAI } from '../test/fake-openai.mjs';

const run = promisify(execFile), session = `settings-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const shot = async name => { await wait('document.getAnimations().every(a => a.playState !== "running")'); await new Promise(r => setTimeout(r, 300)); return b('screenshot', `${process.cwd()}/.impeccable/review/settings-window-${name}.png`); };
const dialog = `document.querySelector('dialog[open]')`;
const active = 'document.activeElement';
const steps = [], step = text => { steps.push(text); console.log(`ok - ${text}`); };

const dir = mkdtempSync(join(tmpdir(), 'tt-settings-'));
const store = new Store(join(dir, 'trees.sqlite'));
const cleanup = [], upstream = await fakeOpenAI({ after: fn => cleanup.push(fn) });
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
const reply = store.message(root.id, 'assistant', 'Mycorrhizal fungi trade phosphorus for sugar.', 'completed');
store.usage(reply, { input: 120, output: 40, cacheRead: 10 });
store.record(`chat:${reply}`, 'chat', { provider: 'claude', model: 'sonnet' }, { input: 120, output: 40, cacheRead: 10 });
store.pendingSuggestions(root.id, reply, 2201);
store.finishSuggestions(root.id, reply, [], { input: 24, output: 8, cacheRead: 0 }, { provider: 'claude', model: 'haiku' });
let connected = true, modelChecks = 0, authFailure = true, authRequests = 0;
const fixture = { models: async () => { modelChecks++; if (!connected) throw new Error('Fixture signed out'); return [{ model: 'fixture', label: 'Fixture model', isDefault: true }]; }, generate: async (t, text, emit) => { emit({ type: 'item', item: 'answer', text: 'Fixture reply.' }); emit({ type: 'status', status: 'completed' }); } };
const signedOut = { models: async () => { throw new Error('signed out'); }, generate: async () => { throw new Error('signed out'); } };
const endpoint = new OpenAI(dir);
const app = createApp({ store, providers: { claude: fixture, codex: signedOut }, defaultProvider: 'claude', dir, endpoint, auth: { status: () => ({ connected: false, email: null }), start: () => { authRequests++; if (authFailure) throw new Error('Fixture authentication unavailable'); return `${origin}/?fixture-auth=ok`; } } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
mkdirSync('.impeccable/review', { recursive: true });

async function mapMenu(item) {
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', item, '--exact');
  await wait(dialog);
}
const heading = () => ev(`${dialog}.querySelector('h2')?.textContent`);
const tab = async name => { await b('find', 'role', 'link', 'click', '--name', name, '--exact').catch(() => b('find', 'text', name, 'click', '--exact')); await wait(`${dialog}.querySelector('h2')?.textContent === ${JSON.stringify(name)}`); };
const text = () => ev(`${dialog}.textContent`);
const closed = () => wait(`!${dialog}`);

try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await b('eval', 'localStorage.clear(); true');
  await b('reload');
  await wait(`document.querySelector('[aria-label="Open How do fungi trade?"]')`);
  await b('find', 'role', 'button', 'click', '--name', 'Open How do fungi trade?', '--exact');
  await wait(`document.querySelector('[aria-label="Map menu"]')`);

  // 1. Map menu Settings opens on Interface (Appearance first, spec) with the title focused; sidebar no longer holds settings.
  assert.equal(await ev(`!!document.querySelector('.shell-band')?.textContent.includes('Connections')`), false, 'band has no Connections');
  await mapMenu('Settings');
  await wait(`${active}?.id === 'settings-heading'`);
  assert.equal(await heading(), 'Interface');
  assert.equal(await ev(`${dialog}.querySelector('nav a, nav button')?.textContent`), 'Interface', 'Interface is the first section');
  assert.equal(await ev(`${dialog}.querySelector('h3')?.textContent`), 'Appearance', 'Appearance is the first setting');
  // World (spec, Settings window): raised slate, hairline seam, 4px corners, Archivo, small-caps section labels, no shadow.
  const look = {};
  for (const mode of ['dark', 'light']) {
    await b('find', 'role', 'radio', 'click', '--name', mode === 'dark' ? 'Dark' : 'Light', '--exact');
    await wait(`document.documentElement.getAttribute('data-theme') === '${mode}'`);
    look[mode] = await ev(`(() => { const d = ${dialog}, c = getComputedStyle(d), h = getComputedStyle(d.querySelector('h3')), body = getComputedStyle(document.body);
      return { surface: c.backgroundColor, ground: body.backgroundColor, radius: c.borderRadius, border: c.borderTopWidth + ' ' + c.borderTopStyle, shadow: c.boxShadow, font: getComputedStyle(d.querySelector('p, span')).fontFamily, caps: h.fontVariantCaps, label: h.color, text: body.color }; })()`);
    assert.equal(look[mode].radius, '4px', `${mode} 4px corners`);
    assert.notEqual(look[mode].surface, look[mode].ground, `${mode} raised surface`);
    // The theme draws seams as an inset 1px ring (slateTheme hairline); anything else would be a drop shadow.
    assert.ok(/^(0\.5|1)px solid$/.test(look[mode].border) || /^\S+(\([^)]*\))? 0px 0px 0px 1px inset$/.test(look[mode].shadow), `${mode} hairline seam: ${look[mode].border} / ${look[mode].shadow}`);
    assert.ok(!look[mode].shadow.split(/,(?![^(]*\))/).some(x => x !== 'none' && !x.trim().endsWith('inset')), `${mode} no drop shadow: ${look[mode].shadow}`);
    assert.match(look[mode].font, /^"?Archivo/, `${mode} Archivo`);
    assert.equal(look[mode].caps, 'all-small-caps', `${mode} small-caps labels`);
    await shot(`interface-${mode}`); await b('screenshot', `${process.cwd()}/docs/verification/settings-interface-${mode}.png`);
  }
  await b('eval', `localStorage.removeItem('treetutor.appearance'); true`);
  step(`Settings opens on Interface with Appearance first; dark and light: 4px raised surface, hairline seam, no shadow, Archivo, small-caps labels ${JSON.stringify(look)}`);
  await tab('Models');
  assert.ok((await text()).includes('Automatic suggestions'));
  assert.ok((await text()).includes('Concept matching'));
  assert.ok((await text()).includes('concept matching is getting expensive'));
  const box = await ev(`(() => { const r = ${dialog}.getBoundingClientRect(); return [r.width, r.height]; })()`);
  assert.ok(box[0] > 800 && box[1] > 600, `large on desktop: ${box}`);
  await shot('models');
  step(`Map menu Settings opens a ${Math.round(box[0])}x${Math.round(box[1])} window, title focused; Models shows suggestions and concept matching; sidebar holds no settings`);

  // 2. Each tab shows its contents; moved controls work.
  await tab('Connections');
  const conn = await text();
  for (const s of ['Claude: signed in through Claude Code', 'Codex: not connected', 'Continue with ChatGPT', 'Custom endpoint', 'Base URL']) assert.ok(conn.includes(s), s);
  await wait(`${dialog}.querySelector('.endpoint-settings')?.textContent.includes('No endpoint configured.')`);
  await shot('connections'); await b('screenshot', `${process.cwd()}/docs/verification/settings-connections-light.png`);
  await b('find', 'label', 'Base URL', 'fill', upstream.baseUrl);
  await b('find', 'label', 'API key', 'fill', 'settings-fixture-secret');
  await b('find', 'role', 'button', 'click', '--name', 'Save', '--exact');
  await wait(`${dialog}.textContent.includes('Endpoint saved.')`);
  assert.deepEqual(await (await fetch(`${origin}/api/settings/endpoint`)).json(), { configured: true, baseUrl: upstream.baseUrl });
  assert.equal(await ev(`${dialog}.querySelector('input[type=password]').value`), '');
  await b('find', 'role', 'button', 'click', '--name', 'Test connection', '--exact');
  await wait(`${dialog}.textContent.includes('Connection works: model listing succeeded.')`);
  await b('find', 'role', 'button', 'click', '--name', 'Remove', '--exact');
  await wait(`${dialog}.textContent.includes('Endpoint removed.')`);
  assert.deepEqual(await (await fetch(`${origin}/api/settings/endpoint`)).json(), { configured: false, baseUrl: null });
  step('Endpoint Save, Test connection and Remove use real app HTTP/storage with an isolated loopback upstream; saved key stays hidden');
  await b('find', 'role', 'button', 'click', '--name', 'Continue with ChatGPT', '--exact');
  await wait(`${dialog}.querySelector('[role=alert]')?.textContent.includes('TreeTutor could not finish this request.')`);
  assert.equal(authRequests, 1);
  step('ChatGPT connection failure is announced inside Connections');
  await tab('Interface');
  const ui = await text();
  for (const s of ['Vim canvas bindings', 'Map help', 'Vim canvas bindings are off']) assert.ok(ui.includes(s), s);
  // Appearance sits above it now; scroll so the click lands inside the dialog, not on its backdrop.
  await ev(`${dialog}.querySelector('input[type=checkbox]').scrollIntoView({ block: 'center' })`);
  await b('find', 'label', 'Vim canvas bindings', 'check');
  await wait(`localStorage.getItem('treetutor.vim') === 'on' && ${dialog}.textContent.includes('Vim canvas bindings are on')`);
  await shot('interface');
  await tab('Usage');
  await wait(`${dialog}.querySelector('.usage-total')`);
  assert.ok((await text()).includes('144 input, 48 output, 10 cache-read tokens (202 total)'));
  await shot('usage');
  await tab('Models');
  const before = (await (await fetch(`${origin}/api/settings/suggestions`)).json()).enabled;
  await b('find', 'role', 'switch', 'click', '--name', 'Automatic suggestions');
  await wait(`${dialog}.textContent.includes('Quick thinking settings saved.')`);
  const saved = await (await fetch(`${origin}/api/settings/suggestions`)).json();
  assert.equal(saved.enabled, !before);
  await b('find', 'label', 'Quick thinking model', 'click');
  await b('find', 'role', 'option', 'click', '--name', 'Fixture model', '--exact');
  await wait(`${dialog}.textContent.includes('Quick thinking settings saved.')`);
  assert.deepEqual((await (await fetch(`${origin}/api/settings/suggestions`)).json()).model, { provider: 'claude', model: 'fixture' });
  connected = false;
  await b('find', 'role', 'button', 'click', '--name', 'Refresh quick thinking models', '--exact');
  await wait(`${dialog}.textContent.includes('Could not load models.')`);
  await tab('Connections');
  assert.ok((await text()).includes('sign-in status unavailable'));
  const checksBefore = modelChecks;
  await b('find', 'role', 'button', 'click', '--name', 'Check Claude sign-in', '--exact');
  await wait(`${dialog}.querySelector('[role=alert]')?.textContent.includes('Could not load models.')`);
  assert.ok(modelChecks > checksBefore);
  connected = true;
  await b('find', 'role', 'button', 'click', '--name', 'Check Claude sign-in', '--exact');
  await wait(`${dialog}.textContent.includes('Claude: signed in through Claude Code')`);
  step('Suggestion model pin and refresh work; failed provider discovery stays retryable in Connections and Claude check recovers');
  await tab('Models');
  step(`Tabs: Connections (Claude, Codex, endpoint), Interface (Vim toggle saved on, map help), Usage, Models (suggestions switch saved enabled=${saved.enabled})`);

  // 3. Focus trap: 40 Tabs and 10 Shift+Tabs never leave the dialog; Esc closes and returns focus to Map menu.
  for (let i = 0; i < 40; i++) { await b('press', 'Tab'); assert.ok(await ev(`${dialog}.contains(${active})`), `Tab ${i} left dialog: ${await ev(`${active}?.outerHTML.slice(0, 100)`)}`); }
  for (let i = 0; i < 10; i++) { await b('press', 'Shift+Tab'); assert.ok(await ev(`${dialog}.contains(${active})`), `Shift+Tab ${i} left dialog`); }
  await b('press', 'Escape');
  await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Map menu'`);
  step('Focus trapped over 40 Tab and 10 Shift+Tab; Esc closes and focus returns to Map menu');

  // 4. Help opens Interface; close button closes.
  await mapMenu('Help');
  assert.equal(await heading(), 'Interface');
  assert.ok((await text()).includes('Map help'));
  await b('find', 'role', 'button', 'click', '--name', 'Close settings', '--exact');
  await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Map menu'`);
  step('Map menu Help opens on Interface with map help; close button closes and returns focus');

  // 5. Endpoint shortcut from the model menu focuses the endpoint form; backdrop click closes and returns focus.
  await b('find', 'role', 'button', 'click', '--name', 'Reopen chat', '--exact').catch(() => {});
  await wait(`document.querySelector('[aria-label="Model for next reply"]')?.getClientRects().length`);
  await b('find', 'role', 'button', 'click', '--name', 'Model for next reply', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Custom endpoint settings Add an endpoint or check its URL, API key and connection').catch(() => b('find', 'text', 'Custom endpoint settings', 'click'));
  await wait(`${active}?.matches('.endpoint-settings input[type=url]')`);
  assert.equal(await heading(), 'Connections');
  await b('mouse', 'move', '5', '5'); await b('mouse', 'down'); await b('mouse', 'up');
  await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Model for next reply'`);
  step('Custom endpoint shortcut opens Connections with Base URL focused; backdrop click closes; focus returns to model picker');

  // 6. Band gear opens the window and focus returns to it.
  await b('find', 'role', 'button', 'click', '--name', 'Settings', '--exact');
  await wait(dialog);
  await b('press', 'Escape'); await closed();
  await wait(`${active}?.getAttribute('aria-label') === 'Settings'`);
  step('Band settings gear opens the window; Esc returns focus to the gear');

  // 7. Mobile: full-screen, tabs as a list, tap into a tab and back.
  await b('set', 'viewport', '390', '844');
  await b('reload');
  await wait(`document.querySelector('[aria-label="Map menu"]')?.getClientRects().length`);
  await mapMenu('Settings');
  const mobile = await ev(`(() => { const r = ${dialog}.getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; })()`);
  assert.ok(mobile[0] >= mobile[2] - 1 && mobile[1] >= mobile[3] - 1, `full-screen: ${mobile}`);
  assert.equal(await heading(), null, 'tab list first, no panel');
  assert.equal(await ev(`document.documentElement.scrollWidth > innerWidth + 1`), false);
  await shot('mobile-list');
  for (let i = 0; i < 8 && await ev(`${active}?.textContent`) !== 'Connections'; i++) await b('press', 'Tab');
  assert.equal(await ev(`${active}?.textContent`), 'Connections');
  await b('press', 'Enter');
  await wait(`${dialog}.querySelector('h2')?.textContent === 'Connections'`);
  assert.ok(await ev(`${dialog}.contains(${active})`), 'mobile section selection keeps focus inside the dialog');
  assert.equal(await ev(`${dialog}.scrollWidth > ${dialog}.clientWidth + 1`), false, 'no horizontal overflow');
  assert.ok(await ev(`${dialog}.querySelector('h2').getBoundingClientRect().left >= 12`), 'mobile content has an inset');
  await shot('mobile-connections'); await b('screenshot', `${process.cwd()}/docs/verification/settings-mobile-connections-dark.png`);
  await b('find', 'role', 'button', 'click', '--name', 'All settings', '--exact');
  await wait(`!${dialog}.querySelector('h2')`);
  assert.ok(await ev(`${dialog}.contains(${active})`), 'mobile return to settings list keeps focus inside the dialog');
  assert.equal(await ev(`${active}?.id`), 'settings-connections', 'return restores the originating section');
  await b('press', 'Escape'); await closed();
  await mapMenu('Help');
  assert.equal(await heading(), 'Interface');
  await wait(`${active}?.id === 'settings-heading'`);
  step(`Mobile ${mobile[0]}x${mobile[1]} full-screen; keyboard list/detail navigation keeps focus inside; padded content scrolls; Help goes straight to Interface`);

  await b('find', 'role', 'button', 'click', '--name', 'All settings', '--exact');
  await tab('Connections');
  authFailure = false;
  await b('find', 'role', 'button', 'click', '--name', 'Continue with ChatGPT', '--exact');
  await wait(`location.search === '?fixture-auth=ok'`);
  assert.equal(authRequests, 2);
  step('ChatGPT connect follows the app auth URL (local fixture redirect only)');

  writeFileSync('docs/verification/settings-window.json', JSON.stringify({ issue: 'TreeTutor-u7v.3, TreeTutor-nwx.8', checkedAt: new Date().toISOString(), evidence: 'Production build and real app HTTP/storage, agent-browser Chromium. Synthetic Claude sign-in/models, Codex auth failure/redirect, reported usage and loopback OpenAI-compatible upstream. No native provider authentication or inference claimed.', steps, screenshots: ['docs/verification/settings-interface-dark.png', 'docs/verification/settings-interface-light.png', 'docs/verification/settings-connections-light.png', 'docs/verification/settings-mobile-connections-dark.png', ...['models', 'connections', 'interface', 'usage', 'mobile-list', 'mobile-connections'].map(n => `.impeccable/review/settings-window-${n}.png`)] }, null, 2) + '\n');
} finally {
  await b('close').catch(() => {});
  await app.stop(); store.close();
  for (const close of cleanup) await close();
}
