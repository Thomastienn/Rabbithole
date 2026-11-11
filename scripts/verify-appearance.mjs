// Appearance (TreeTutor-nwx.3): dark default, Light persists, System follows the OS, Mermaid follows the app.
// Built app, isolated database, synthetic providers, agent-browser Chromium. Screenshots go to docs/verification/.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `appearance-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const shot = async name => { await wait('document.getAnimations().every(a => a.playState !== "running")'); await new Promise(r => setTimeout(r, 300)); return b('screenshot', `${process.cwd()}/docs/verification/appearance-${name}.png`); };
// Accessible name of a form control, the parts this app uses.
const nameOf = `(el => (el?.getAttribute('aria-label') ?? el?.getAttribute('aria-labelledby')?.split(' ').map(id => document.getElementById(id)?.textContent).join(' ') ?? el?.labels?.[0]?.textContent ?? '').trim())`;
const step = text => console.log(`ok - ${text}`);

const dir = mkdtempSync(join(tmpdir(), 'tt-appearance-'));
const store = new Store(join(dir, 'trees.sqlite'));
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
const reply = store.message(root.id, 'assistant', 'Mycorrhizal fungi trade phosphorus for sugar. The fungus extends the root system far beyond what the plant could reach alone.', 'completed');
const artifact = store.pendingArtifact(root.id, reply, 'Trade loop', 'Sugar flows to the fungus; phosphorus flows to the plant.');
store.finishArtifact(root.id, artifact.id, 'flowchart LR\n P[Plant] -->|sugar| F[Fungus]\n F -->|phosphorus| P');
const fixture = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (t, text, emit) => { emit({ type: 'status', status: 'completed' }); } };
const app = createApp({ store, providers: { claude: fixture, codex: fixture }, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: false, email: null }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
mkdirSync('docs/verification', { recursive: true });

// Resolved colour of a token on the page, as [r, g, b, a].
const probe = `(token, prop = 'color') => { const el = document.createElement('i'); el.style[prop] = 'var(' + token + ')'; document.querySelector('.astryx-theme, #root').append(el);
  const c = getComputedStyle(el)[prop]; el.remove(); const n = c.match(/[\\d.]+/g).map(Number); return [n[0], n[1], n[2], n[3] ?? 1]; }`;
const scheme = () => ev(`document.documentElement.getAttribute('data-theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'system-dark' : 'system-light')`);
const flowDark = () => ev(`document.querySelector('.react-flow').classList.contains('dark')`);
const ground = () => ev(`getComputedStyle(document.querySelector('.react-flow')).backgroundColor`);
const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const over = (top, under) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]));
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const diagramText = () => ev(`decodeURIComponent(document.querySelector('.diagram-card img')?.src.split(',')[1] ?? '')`);
const diagramReady = `document.querySelector('.diagram-card[data-state=ready] img')`;

async function contrast(mode) {
  const c = await ev(`(async () => { const p = ${probe}; const names = ['--color-text-primary', '--color-text-secondary', '--color-text-accent', '--color-text-error', '--color-accent', '--treetutor-selection'];
    const grounds = ['--color-background-body', '--color-background-surface', '--color-background-muted', '--color-background-popover'];
    return { fg: Object.fromEntries(names.map(n => [n, p(n)])), bg: Object.fromEntries(grounds.map(n => [n, p(n, 'backgroundColor')])) }; })()`);
  const rows = [];
  for (const [g, bg] of Object.entries(c.bg)) {
    for (const t of ['--color-text-primary', '--color-text-secondary', '--color-text-accent', '--color-text-error']) rows.push([t, g, ratio(c.fg[t], bg), 4.5]);
    rows.push(['--color-accent (focus outline)', g, ratio(c.fg['--color-accent'], bg), 3]);
    rows.push(['--color-text-primary on selection', g, ratio(c.fg['--color-text-primary'], over(c.fg['--treetutor-selection'], bg)), 4.5]);
  }
  for (const [t, g, r, min] of rows) assert.ok(r >= min, `${mode}: ${t} on ${g} is ${r.toFixed(2)}, needs ${min}`);
  step(`${mode}: text, selection and focus outline meet WCAG AA on every ground (lowest ${Math.min(...rows.map(r => r[2] / r[3])).toFixed(2)}x of its minimum)`);
}
const openTree = async () => {
  await wait(`document.querySelector('[aria-label="Open How do fungi trade?"]')`);
  await b('eval', `document.querySelector('[aria-label="Open How do fungi trade?"]').click(); true`);
  await wait(diagramReady);
};
async function openInterface() {
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
  await wait(`document.querySelector('dialog[open]')`);
  await b('find', 'text', 'Interface', 'click', '--exact');
  await wait(`document.querySelector('dialog[open] h2')?.textContent === 'Interface'`);
}
const closeSettings = async () => { await b('press', 'Escape'); await wait(`!document.querySelector('dialog[open]')`); };

try {
  await b('set', 'viewport', '1440', '900');
  // The OS says light; fresh storage must still open Dark.
  await b('set', 'media', 'light');
  await b('open', origin);
  await b('eval', 'localStorage.clear(); true');
  await b('reload');
  await openTree();
  assert.equal(await scheme(), 'dark');
  assert.equal(await ground(), 'rgb(28, 39, 36)', 'slate ground');
  assert.equal(await flowDark(), true, 'map follows the app');
  assert.equal(await ev(`localStorage.getItem('treetutor.appearance')`), null);
  assert.match(await ev(`getComputedStyle(document.body).fontFamily`), /^"?Public Sans/);
  assert.equal(await ev(`document.fonts.check('16px "Public Sans"') && [...document.querySelectorAll('link[rel=stylesheet], style')].every(s => !/fonts\\.(googleapis|gstatic)/.test(s.href || s.textContent))`), true, 'fonts self-hosted');
  const darkDiagram = await diagramText();
  assert.ok(darkDiagram.includes('rgb(235, 231, 220)'), 'diagram drawn in chalk while the OS is light');
  await contrast('Dark');
  await shot('dark');
  step('fresh storage opens Dark on a light OS: slate ground, self-hosted Public Sans, Mermaid in chalk');

  // Appearance control: labelled radio group, keyboard operable.
  await openInterface();
  assert.equal(await ev(`[...document.querySelectorAll('dialog[open] [role=radiogroup], dialog[open] fieldset')].some(g => (g.getAttribute('aria-label') ?? g.querySelector('legend')?.textContent ?? document.getElementById(g.getAttribute('aria-labelledby'))?.textContent ?? '').trim() === 'Appearance')`), true, 'labelled Appearance group');
  assert.deepEqual(await ev(`[...document.querySelectorAll('dialog[open] input[type=radio][name]')].filter(r => r.closest('[role=radiogroup], fieldset')?.textContent.includes('System')).map(${nameOf})`), ['Dark', 'Light', 'System']);
  await b('eval', `[...document.querySelectorAll('dialog[open] input[type=radio]')].find(r => ${nameOf}(r) === 'Dark').focus(); true`);
  await b('press', 'ArrowDown');
  await wait(`document.documentElement.getAttribute('data-theme') === 'light'`);
  assert.equal(await ev(`${nameOf}(document.activeElement)`), 'Light');
  assert.equal(await ev(`localStorage.getItem('treetutor.appearance')`), 'light');
  await shot('settings-light');
  step('Appearance is a labelled Dark/Light/System radio group; ArrowDown from Dark selects Light');
  await closeSettings();

  // Light persists across reload; Mermaid follows the app while the OS says dark.
  await b('set', 'media', 'dark');
  await b('reload');
  await openTree();
  assert.equal(await scheme(), 'light');
  assert.notEqual(await ground(), 'rgb(28, 39, 36)');
  assert.equal(await flowDark(), false, 'map follows the app, not the dark OS');
  const lightDiagram = await diagramText();
  assert.ok(lightDiagram.includes('rgb(28, 39, 36)') && !lightDiagram.includes('rgb(235, 231, 220)'), 'diagram drawn in slate ink while the OS is dark');
  await contrast('Light');
  await shot('light');
  step('Light persists across reload; Mermaid draws in slate ink although the OS is dark');

  // System follows the emulated colour scheme live.
  await openInterface();
  await b('find', 'role', 'radio', 'click', '--name', 'System', '--exact');
  await closeSettings();
  assert.equal(await scheme(), 'system-dark');
  await wait(`getComputedStyle(document.querySelector('.react-flow')).backgroundColor === 'rgb(28, 39, 36)'`);
  await wait(`decodeURIComponent(${diagramReady}?.src ?? '').includes('rgb(235, 231, 220)')`);
  await b('set', 'media', 'light');
  await wait(`getComputedStyle(document.querySelector('.react-flow')).backgroundColor !== 'rgb(28, 39, 36)'`);
  await wait(`decodeURIComponent(${diagramReady}?.src ?? '').includes('rgb(28, 39, 36)')`);
  assert.equal(await ev(`localStorage.getItem('treetutor.appearance')`), 'system');
  step('System follows the emulated scheme live, map ground and Mermaid included');

  // Unknown stored values fall back to Dark.
  await b('eval', `localStorage.setItem('treetutor.appearance', 'sepia'); true`);
  await b('reload');
  await openTree();
  assert.equal(await scheme(), 'dark');
  step('an unknown stored value opens Dark');
} finally {
  await b('close').catch(() => {});
  app.server.close();
}
