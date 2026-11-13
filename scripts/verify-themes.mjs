// Themes (TreeTutor-got.14/.15): Paperback default, Forest/Harbor/Dusk change surfaces in light and dark, persist across reload,
// leaves Appearance and bubble tint alone; unknown saved values open Paperback. Built app, isolated database,
// synthetic providers, agent-browser Chromium. Screenshots go to docs/verification/.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `themes-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const shot = async name => { await wait('document.getAnimations().every(a => a.playState !== "running")'); await new Promise(r => setTimeout(r, 300)); return b('screenshot', `${process.cwd()}/docs/verification/themes-${name}.png`); };
const step = text => console.log(`ok - ${text}`);

const dir = mkdtempSync(join(tmpdir(), 'tt-themes-'));
const store = new Store(join(dir, 'trees.sqlite'));
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
store.message(root.id, 'assistant', 'Mycorrhizal fungi trade phosphorus for sugar.', 'completed');
const fixture = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (t, text, emit) => { emit({ type: 'status', status: 'completed' }); } };
const app = createApp({ store, providers: { claude: fixture, codex: fixture }, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: false, email: null }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
mkdirSync('docs/verification', { recursive: true });

// Resolved token colour at the app root, and the theme the root wears.
const color = (token, prop = 'backgroundColor') => ev(`(() => { const el = document.createElement('i'); el.style.${prop} = 'var(${token})'; document.querySelector('#root').append(el); const c = getComputedStyle(el).${prop}; el.remove(); return c; })()`);
const surfaces = async () => ({ surface: await color('--color-background-surface'), body: await color('--color-background-body'), ink: await color('--treetutor-ink-1', 'color') });
const themeName = () => ev(`document.documentElement.getAttribute('data-astryx-theme')`);
const stored = key => ev(`localStorage.getItem('treetutor.${key}')`);
async function openInterface() {
  await wait(`document.querySelector('[aria-label="Map menu"]')`);
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait(`document.activeElement?.id === 'settings-heading'`);
}
const pick = name => b('find', 'role', 'radio', 'click', '--name', name, '--exact');
const ready = () => wait(`document.querySelector('[aria-label="Map menu"]')`);

try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  // Light appearance and the Lichen tint are saved first; theme switching must leave both alone.
  await b('eval', `localStorage.clear(); localStorage.setItem('treetutor.appearance', 'light'); localStorage.setItem('treetutor.bubble-tint', 'blue'); true`);
  await b('reload');
  await ready();
  assert.equal(await themeName(), 'paperback', 'fresh storage opens Paperback');
  const paperLight = await surfaces();
  assert.equal(paperLight.surface, 'rgb(250, 247, 240)');
  step('fresh theme storage opens Paperback');

  await openInterface();
  assert.deepEqual(await ev(`[...document.querySelectorAll('.settings-page:not([hidden]) [data-theme-swatch]')].map(s => s.dataset.themeSwatch)`), ['paperback', 'forest', 'harbor', 'dusk']);
  // Each swatch card wears its own theme: different accent and ink dots, the bubble in the chosen tint.
  const cards = await ev(`[...document.querySelectorAll('.settings-page:not([hidden]) [data-theme-swatch]')].map(s => [...s.children].map(i => getComputedStyle(i).backgroundColor))`);
  for (const card of cards) assert.equal(card.length, 6, 'bubble, accent and four branch inks');
  assert.equal(new Set(cards.map(card => JSON.stringify(card))).size, 4, 'cards show each theme’s own bubble, accent and inks');
  await shot('settings-paperback-light');
  await pick('Forest');
  await wait(`document.documentElement.getAttribute('data-astryx-theme') === 'forest'`);
  const forestLight = await surfaces();
  assert.equal(forestLight.surface, 'rgb(245, 248, 240)');
  assert.notEqual(forestLight.body, paperLight.body);
  assert.notEqual(forestLight.ink, paperLight.ink, 'branch family inks follow the theme');
  assert.equal(await stored('theme'), 'forest');
  assert.equal(await stored('appearance'), 'light', 'Appearance kept');
  assert.equal(await stored('bubble-tint'), 'blue', 'bubble tint kept');
  assert.equal(await ev(`document.documentElement.getAttribute('data-theme')`), 'light');
  assert.equal(await ev(`document.querySelector('input[type=radio][value=blue]')?.checked`), true, 'Lichen still selected');
  await shot('settings-forest-light');
  step('picking Forest changes light surfaces and branch inks; Appearance and bubble tint unchanged');

  // Persists across reload, applied with the first render.
  await b('reload');
  await ready();
  assert.equal(await themeName(), 'forest');
  assert.equal((await surfaces()).surface, 'rgb(245, 248, 240)');
  await shot('forest-light');
  step('Forest persists across reload');

  // Dark variant of each theme.
  await openInterface();
  await pick('Dark');
  await wait(`document.documentElement.getAttribute('data-theme') === 'dark'`);
  const forestDark = await surfaces();
  assert.equal(forestDark.surface, 'rgb(26, 36, 28)');
  assert.equal(await stored('theme'), 'forest', 'Appearance change keeps the theme');
  await shot('settings-forest-dark');
  await pick('Paperback');
  await wait(`document.documentElement.getAttribute('data-astryx-theme') === 'paperback'`);
  const paperDark = await surfaces();
  assert.equal(paperDark.surface, 'rgb(36, 31, 26)');
  assert.notEqual(forestDark.body, paperDark.body);
  assert.notEqual(forestDark.ink, paperDark.ink);
  assert.equal(await stored('appearance'), 'dark');
  assert.equal(await stored('bubble-tint'), 'blue');
  step('Forest and Paperback have different dark surfaces; switching back keeps Dark and the tint');

  for (const [id, label, light, dark] of [
    ['harbor', 'Harbor', 'rgb(243, 246, 249)', 'rgb(26, 34, 45)'],
    ['dusk', 'Dusk', 'rgb(248, 243, 248)', 'rgb(33, 25, 38)'],
  ]) {
    for (const [mode, expected] of [['light', light], ['dark', dark]]) {
      await pick(mode === 'light' ? 'Light' : 'Dark');
      await pick(label);
      await wait(`document.documentElement.getAttribute('data-astryx-theme') === '${id}' && document.documentElement.getAttribute('data-theme') === '${mode}'`);
      assert.equal((await surfaces()).surface, expected, `${label} ${mode} surface`);
      assert.equal(await stored('theme'), id);
      assert.equal(await stored('appearance'), mode);
      assert.equal(await stored('bubble-tint'), 'blue');
      assert.equal(await ev(`document.querySelector('input[type=radio][value=${id}]')?.checked`), true);
      const swatch = await ev(`[...document.querySelector('[data-theme-swatch=${id}]').children].map(i => getComputedStyle(i).backgroundColor)`);
      assert.equal(swatch[0], await color('--color-background-blue'), 'swatch bubble follows the chosen tint');
      assert.equal(swatch[1], await color('--color-accent'), 'swatch accent matches the applied theme');
      for (let n = 1; n <= 4; n++) assert.equal(swatch[n + 1], await color(`--treetutor-ink-${n}`), `swatch branch ink ${n}`);
      await shot(`settings-${id}-${mode}`);
      await b('reload');
      await ready();
      assert.equal(await themeName(), id, `${label} persists across reload`);
      assert.equal((await surfaces()).surface, expected, `${label} ${mode} restored`);
      await openInterface();
      step(`${label} ${mode}: swatch matches applied palette; persists; Appearance and tint kept`);
    }
    await b('set', 'viewport', '390', '844');
    assert.equal(await ev(`document.documentElement.scrollWidth <= innerWidth`), true, `${label} narrow settings fit`);
    await b('eval', `document.querySelector('[data-theme-swatch=${id}]').scrollIntoView({ block: 'center' }); true`);
    await shot(`settings-${id}-narrow`);
    await b('set', 'viewport', '1440', '900');
  }

  // Unknown stored value falls back to Paperback.
  await b('eval', `localStorage.setItem('treetutor.theme', 'ocean'); true`);
  await b('reload');
  await ready();
  assert.equal(await themeName(), 'paperback');
  assert.equal((await surfaces()).surface, 'rgb(36, 31, 26)');
  step('an unknown stored theme opens Paperback');
} finally {
  await b('close').catch(() => {});
  app.server.close();
}
