// Bubble tint presets and Mermaid palette (TreeTutor-nwx.11), in both appearances.
// Built app, isolated database, synthetic providers, agent-browser Chromium. Screenshots go to docs/verification/.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `palette-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const shot = async name => { await wait('document.getAnimations().every(a => a.playState !== "running")'); await new Promise(r => setTimeout(r, 300)); return b('screenshot', `${process.cwd()}/docs/verification/palette-${name}.png`); };
const step = text => console.log(`ok - ${text}`);

const dir = mkdtempSync(join(tmpdir(), 'tt-palette-'));
const store = new Store(join(dir, 'trees.sqlite'));
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
const flowReply = store.message(root.id, 'assistant', 'Mycorrhizal fungi trade phosphorus for sugar.', 'completed');
const flow = store.pendingArtifact(root.id, flowReply, 'Trade loop', 'Sugar flows to the fungus; phosphorus flows to the plant.');
store.finishArtifact(root.id, flow.id, 'flowchart LR\n P[Plant] -->|sugar| F[Fungus]\n F -->|phosphorus| P');
store.message(root.id, 'user', 'Where does the plant spend its sugar?', 'completed');
const pieReply = store.message(root.id, 'assistant', 'Roughly, by share of fixed carbon:', 'completed');
const pie = store.pendingArtifact(root.id, pieReply, 'Carbon budget', 'Growth, respiration, fungi and exudates as shares of fixed carbon.');
store.finishArtifact(root.id, pie.id, 'pie title Carbon budget\n "Growth" : 45\n "Respiration" : 30\n "Fungi" : 15\n "Exudates" : 10');
const fixture = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (t, text, emit) => { emit({ type: 'status', status: 'completed' }); } };
const app = createApp({ store, providers: { claude: fixture, codex: fixture }, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: false, email: null }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
mkdirSync('docs/verification', { recursive: true });

const tints = ['neutral', 'yellow', 'blue', 'pink', 'green'];
const ready = `document.querySelectorAll('.diagram-card[data-state=ready]').length === 2`;
// Rendered question text against its bubble fill composited over the chat surface.
const bubbleContrast = `(() => { const rgba = c => { const n = c.match(/[\\d.]+/g).map(Number); return [n[0], n[1], n[2], n[3] ?? 1]; };
  const bubble = document.querySelector('.focused-chat .question-bubble'), s = getComputedStyle(bubble);
  const fill = rgba(s.backgroundColor), under = rgba(getComputedStyle(document.querySelector('.focused-chat')).backgroundColor), text = rgba(s.color);
  const bg = fill.slice(0, 3).map((v, i) => v * fill[3] + under[i] * (1 - fill[3]));
  const lum = c => c.slice(0, 3).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(text), lum(bg)].sort((p, q) => q - p); return { fill: s.backgroundColor, ratio: (x + 0.05) / (y + 0.05) }; })()`;
const series = `['yellow', 'blue', 'pink', 'green'].map(h => { const el = document.createElement('i'); el.style.color = 'var(--color-text-' + h + ')'; document.querySelector('.diagram-card').append(el); const c = getComputedStyle(el).color; el.remove(); return c; })`;
const svgs = `[...document.querySelectorAll('.diagram-card .diagram-open img')].map(i => decodeURIComponent(i.src.split(',')[1]))`;
const open = async (appearance, tint) => {
  await b('eval', `localStorage.setItem('treetutor.appearance', '${appearance}'); localStorage.setItem('treetutor.bubble-tint', '${tint}'); true`);
  await b('reload');
  await wait(`document.querySelector('[aria-label="Open How do fungi trade?"]')`);
  await b('eval', `document.querySelector('[aria-label="Open How do fungi trade?"]').click(); true`);
  await wait(ready);
};

const results = {};
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  for (const appearance of ['dark', 'light']) {
    const rows = results[appearance] = {};
    for (const tint of tints) {
      await open(appearance, tint);
      rows[tint] = await ev(bubbleContrast);
      assert.ok(rows[tint].ratio >= 4.5, `${appearance} ${tint}: question text ${rows[tint].ratio.toFixed(2)}:1`);
    }
    assert.equal(new Set(tints.map(t => rows[t].fill)).size, tints.length, `${appearance}: every preset has its own fill`);
    step(`${appearance}: every bubble tint gives question text AA (lowest ${Math.min(...tints.map(t => rows[t].ratio)).toFixed(2)}:1)`);

    // Mermaid: flowchart in surface/paper/hairline; pie series in amber, lichen, rust, leaf ink.
    const [hues, [flowSvg, pieSvg], text, surface] = await Promise.all([ev(series), ev(svgs),
      ev(`getComputedStyle(document.querySelector('.diagram-card')).color`), ev(`getComputedStyle(document.querySelector('.diagram-card')).backgroundColor`)]);
    assert.ok(flowSvg.includes(text) && flowSvg.includes(surface), `${appearance}: flowchart in paper text on the raised surface`);
    const order = hues.map(h => pieSvg.indexOf(`fill:${h}`) >= 0 ? pieSvg.indexOf(`fill:${h}`) : pieSvg.indexOf(`fill="${h}"`));
    assert.ok(order.every(i => i >= 0), `${appearance}: pie uses every series ink ${JSON.stringify(hues)}`);
    assert.deepEqual([...order].sort((p, q) => p - q), order, `${appearance}: series in amber, lichen, rust, leaf order`);
    results[appearance].series = hues;
    await b('eval', `document.querySelectorAll('.diagram-card')[1].scrollIntoView({ block: 'center' }); true`);
    await shot(`diagrams-${appearance}`);
    step(`${appearance}: Mermaid uses the theme palette, series follow the ink order`);

    // Choosing a preset in Settings applies it live and persists.
    await open(appearance, 'neutral');
    await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
    await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
    await wait(`document.querySelector('dialog[open]')`);
    await b('find', 'text', 'Interface', 'click', '--exact');
    await b('find', 'role', 'radio', 'click', '--name', 'Rust', '--exact');
    assert.equal(await ev(`localStorage.getItem('treetutor.bubble-tint')`), 'pink');
    await b('eval', `document.querySelector('dialog[open] .bubble-tint-swatch').scrollIntoView({ block: 'center' }); true`);
    await shot(`tints-settings-${appearance}`);
    await b('press', 'Escape');
    await wait(`!document.querySelector('dialog[open]')`);
    assert.equal((await ev(bubbleContrast)).fill, rows.pink.fill);
    await shot(`bubble-pink-${appearance}`);
    step(`${appearance}: Settings Rust tint applies to the bubble and persists`);
  }
  // A preset saved under the old palette maps to its nearest ink.
  await open('dark', 'purple');
  assert.equal((await ev(bubbleContrast)).fill, results.dark.pink.fill);
  step('legacy Purple preference opens as Rust');
  writeFileSync('docs/verification/palette-results.json', JSON.stringify(results, null, 2) + '\n');
} finally {
  await b('close').catch(() => {});
  app.server.close();
}
