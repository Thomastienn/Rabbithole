// Accessibility and visual audit over a seeded fixture tree (synthetic provider, real Chromium and production build).
// Usage: node scripts/verify-polish.mjs [label]  → docs/verification/polish-<label>.json and .impeccable/review/polish-<label>-*.png
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const label = process.argv[2] ?? 'after';
const run = promisify(execFile), session = `polish-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', code, '--timeout', '20000');
const dir = mkdtempSync(join(tmpdir(), 'tt-polish-'));
const store = new Store(join(dir, 'trees.sqlite'));
store.create('Second chat', 'claude');
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
const reply = store.message(root.id, 'assistant', '## Trading partners\n\nMycorrhizal **fungi trade** phosphorus for sugar.\n\n- Hyphae reach far\n- Roots pay in carbon\n\n| Gives | Gets |\n| --- | --- |\n| Fungus | Sugar |\n\n`code` and $E=mc^2$.', 'completed');
store.finishArtifact(root.id, store.pendingArtifact(root.id, reply, 'Trade loop', 'Sugar flows to the fungus, phosphorus flows to the root.').id, 'flowchart LR\n R[Root] -->|sugar| F[Fungus]\n F -->|phosphorus| R');
const video = store.pendingArtifact(root.id, reply, 'Hyphae growing', 'Hyphae spread through soil.', 'video', '{}');
store.finishVideo(root.id, video.id, video.attempt, {}, 'Renderer stopped.');
const child = store.branch(store.tree(root.id), { messageId: reply, start: 33, end: 44, text: 'fungi trade', question: 'Why trade at all?' }, 'Root snapshot.');
store.message(child.id, 'user', 'Why trade at all?', 'completed');
store.message(child.id, 'assistant', 'Neither partner can make what the other offers.', 'completed');
const fixture = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (t, text, emit) => { emit({ type: 'item', item: 'answer', text: 'Fixture reply.' }); emit({ type: 'status', status: 'completed' }); } };
const signedOut = { models: async () => { throw new Error('signed out'); }, generate: async () => { throw new Error('signed out'); } };
const app = createApp({ store, providers: { claude: fixture, codex: signedOut }, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: false, email: null }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
mkdirSync('.impeccable/review', { recursive: true });

// In-page probes. Contrast walks visible text and composites ancestor backgrounds; focus checks outline or ring.
const probes = `window.__probe = {
  rgb(c) { const m = c.match(/[\\d.]+/g)?.map(Number) ?? [0,0,0,0]; return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; },
  lum({ r, g, b }) { const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); },
  bg(el) { const layers = []; for (let e = el; e; e = e.parentElement) { const c = this.rgb(getComputedStyle(e).backgroundColor); if (c.a) layers.push(c); if (c.a >= 1) break; }
    let out = this.rgb(getComputedStyle(document.body).backgroundColor); if (!out.a) out = matchMedia('(prefers-color-scheme: dark)').matches ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) out = { r: l.r * l.a + out.r * (1 - l.a), g: l.g * l.a + out.g * (1 - l.a), b: l.b * l.a + out.b * (1 - l.a), a: 1 }; return out; },
  contrast() { const fails = [], seen = new Set(); const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) { const el = n.parentElement; if (!n.textContent.trim() || seen.has(el)) continue; seen.add(el);
      const r = el.getBoundingClientRect(), s = getComputedStyle(el); if (!r.width || !r.height || s.visibility === 'hidden' || el.closest('.sr-only, .focus-reveal:not(:focus-visible), [aria-hidden=true], svg, .katex-mathml')) continue;
      if (el.closest('button:disabled, [aria-disabled=true], .react-flow__attribution')) continue;
      let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); if (o < 0.5) continue;
      const fg = this.rgb(s.color), bg = this.bg(el), a = this.lum({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }), c = this.lum(bg);
      const ratio = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05), large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) fails.push({ text: n.textContent.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100 }); }
    return fails; },
  ring() { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e), r = e.getBoundingClientRect();
    const drawn = x => { const t = getComputedStyle(x); return (t.outlineStyle !== 'none' && parseFloat(t.outlineWidth) > 0) || t.boxShadow !== 'none'; };
    // Map boxes ring their inner box, edges thicken their path, the composer rings its wrapper.
    const box = e.querySelector(':scope > .conversation-box'), path = e.querySelector('.react-flow__edge-path');
    const wrapper = e.isContentEditable && [e.parentElement, e.parentElement?.parentElement, e.parentElement?.parentElement?.parentElement].find(x => x && drawn(x));
    const visible = drawn(e) || (box && drawn(box)) || (path && parseFloat(getComputedStyle(path).strokeWidth) > 2) || !!wrapper;
    return { name: e.getAttribute('aria-label') || e.textContent?.trim().slice(0, 40) || e.tagName, visible, onScreen: r.width > 0 && r.bottom > 0 && r.top < innerHeight }; },
  unnamed() { return [...document.querySelectorAll('button, a[href], input, textarea, select, [role=button], [role=textbox], [role=menuitem], [role=menuitemradio], [tabindex="0"]')].filter(e => e.getClientRects().length && !e.closest('[aria-hidden=true]'))
    .filter(e => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.labels?.length || e.textContent.trim() || e.getAttribute('title'))).map(e => e.outerHTML.slice(0, 120)); },
  motion() { return [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); const t = s.transitionDuration.split(',').some(d => parseFloat(d) > 0) && s.transitionProperty !== 'none'; const a = s.animationName !== 'none' && s.animationDuration.split(',').some(d => parseFloat(d) > 0); return (t || a) && e.getClientRects().length; })
    .map(e => (e.className?.baseVal ?? e.className) + ' ' + getComputedStyle(e).transitionProperty + '/' + getComputedStyle(e).animationName).slice(0, 20); },
  overflow() { return document.documentElement.scrollWidth > innerWidth + 1; },
}; true`;
const results = { label, checkedAt: new Date().toISOString(), evidence: 'Synthetic fixture providers, seeded SQLite tree with markdown, ready diagram, failed video and branch; production build in agent-browser Chromium. 200% zoom is emulated as a half-size CSS viewport.', checks: {} };
const shot = name => b('screenshot', `${process.cwd()}/.impeccable/review/polish-${label}-${name}.png`);
async function openApp(width, height, scheme) {
  await b('set', 'viewport', String(width), String(height));
  await b('set', 'media', scheme, 'reduced-motion');
  await b('open', origin);
  await ev(`localStorage.setItem('treetutor.appearance', ${JSON.stringify(scheme)}); true`);
  await b('reload');
  await wait(`!!document.querySelector('[aria-label="Open How do fungi trade?"]')`);
  await ev(probes);
}
const openChat = async () => { await b('find', 'role', 'button', 'click', '--name', 'Open How do fungi trade?', '--exact'); await wait(`!!document.querySelector('.focused-chat .diagram-card[data-state=ready]')`); await ev(probes); };
try {
  for (const scheme of ['light', 'dark']) {
    await openApp(1440, 900, scheme);
    const map = await ev('__probe.contrast()'); await shot(`${scheme}-map`);
    await openChat();
    const chat = await ev('__probe.contrast()'); await shot(`${scheme}-chat`);
    await b('find', 'role', 'button', 'click', '--name', 'Model for next reply', '--exact'); await wait(`!!document.querySelector('[role=menu]')`);
    const menu = await ev('__probe.contrast()'); await shot(`${scheme}-model-menu`); await b('press', 'Escape');
    await b('find', 'role', 'button', 'click', '--name', 'Return to tree', '--exact');
    await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact'); await b('find', 'role', 'menuitem', 'click', '--name', 'Settings', '--exact');
    await b('find', 'role', 'button', 'click', '--name', 'Connections', '--exact');
    await wait(`!!document.querySelector('.endpoint-settings')`);
    const sidebar = await ev('__probe.contrast()'); await shot(`${scheme}-sidebar`);
    results.checks[`contrast-${scheme}`] = { map, chat, menu, sidebar };
  }
  // Reduced motion: nothing visible keeps a transition or animation; chat opening keeps the composer still.
  await openApp(1440, 900, 'light');
  const motionMap = await ev('__probe.motion()');
  await openChat();
  const composerAt = () => ev(`JSON.stringify(document.querySelector('.focused-chat [role=textbox]').getBoundingClientRect())`);
  const first = await composerAt(); await new Promise(r => setTimeout(r, 800)); const later = await composerAt();
  results.checks['reduced-motion'] = { map: motionMap, chat: await ev('__probe.motion()') };
  results.checks['chat-open-shift'] = { stable: first === later, first, later };
  results.checks['unnamed-controls'] = await ev('__probe.unnamed()');
  // Keyboard: Tab through the chat and map, recording every stop's visible focus.
  const stops = [];
  await b('press', 'Escape');
  await ev('document.activeElement.blur(); document.body.focus(); true');
  for (let i = 0; i < 45; i++) { await b('press', 'Tab'); stops.push(await ev('__probe.ring()')); }
  await openChat();
  for (let i = 0; i < 30; i++) { await b('press', 'Tab'); stops.push(await ev('__probe.ring()')); }
  results.checks['focus-visible'] = { stops: stops.length, missing: stops.filter(s => s && (!s.visible || !s.onScreen)) };
  // Responsive and zoom: no horizontal page overflow, composer reachable.
  const sizes = { narrow: [390, 844], zoom200: [720, 450], wide: [2560, 1080], breakpoint: [768, 900] };
  for (const [name, [w, h]] of Object.entries(sizes)) {
    await openApp(w, h, 'light'); const mapOverflow = await ev('__probe.overflow()'); await shot(`${name}-map`);
    await openChat();
    const composer = await ev(`(() => { const r = document.querySelector('.focused-chat [role=textbox]').getBoundingClientRect(); return r.height > 0 && r.bottom <= innerHeight + 1; })()`);
    results.checks[`viewport-${name}`] = { mapOverflow, chatOverflow: await ev('__probe.overflow()'), composerVisible: composer };
    await shot(`${name}-chat`);
  }
  writeFileSync(`docs/verification/polish-${label}.json`, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results.checks, null, 1));
} finally {
  await b('close').catch(() => {});
  app.stop(); store.close();
}
