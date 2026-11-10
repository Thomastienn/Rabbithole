import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, totalmem, release, arch } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Reproducible content/shape, isolated SQLite and synthetic inference only.
const baseline = process.argv.includes('--baseline');
// Production copies with a fixture-only counter inside Conversation's function body.
// The control differs only in viewport culling. Never rewrite app sources or shipped dist.
const { build } = await import('vite');
const assets = join(mkdtempSync(join(tmpdir(), 'treetutor-profiled-')), 'dist');
await build({ logLevel: 'error', build: { outDir: assets }, plugins: [{
  name: 'conversation-render-counter', enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/TreeOverview.tsx')) return;
    const marker = 'const Conversation = memo(function Conversation({ data }: NodeProps<ConversationNode>) {';
    assert.ok(code.includes(marker));
    code = code.replace(marker, marker + `
      const id = data.conversation.id, old = window.__nodeRenderData.get(id);
      window.__nodeRenders[id] = (window.__nodeRenders[id] || 0) + 1;
      window.__nodeRenderReasons[id] = Object.keys(data).filter(key => old?.[key] !== data[key]);
      window.__nodeRenderData.set(id, data);
    `);
    if (baseline) {
      assert.ok(code.includes('onlyRenderVisibleElements={canCull && nodes.length > 50}'));
      code = code.replace('onlyRenderVisibleElements={canCull && nodes.length > 50}', 'onlyRenderVisibleElements={false}');
    }
    return code;
  },
}] });
const seed = 721, count = 200, turns = 20;
let random = seed;
const next = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-large-')), 'trees.sqlite'));
const conversations = [], replies = [], levels = [], ranks = new Map();
const started = performance.now();
for (let i = 0; i < count; i++) {
  const parentIndex = Math.floor((i - 1) / 4);
  const parent = conversations[parentIndex];
  const title = i ? `Conversation ${i}` : 'Large seeded tree';
  const tree = i ? store.branch(parent, { messageId: replies[parentIndex], start: 0, end: 6, text: 'Answer', question: title }, 'Seeded context') : store.create(title);
  conversations.push(tree);
  const level = i ? levels[parentIndex] + 1 : 0, rank = ranks.get(level) ?? 0;
  levels.push(level); ranks.set(level, rank + 1);
  store.db.exec('BEGIN');
  store.position(tree.id, level * 360, rank * 3100);
  for (let t = 0; t < turns; t++) {
    store.message(tree.id, 'user', `Question ${t + 1}, sample ${next()}: ${'Explain roots and nutrients. '.repeat(30)}`, 'completed');
    const reply = store.message(tree.id, 'assistant', `Answer ${t + 1}, sample ${next()}: ${'Roots and fungi exchange nutrients in the forest. '.repeat(30)}`, 'completed');
    if (!t) replies[i] = reply;
  }
  store.db.exec('COMMIT');
}
const root = conversations[0];
store.layout(root.id, { folded: [], selected: root.id, panel: 'collapsed', viewport: { x: 80, y: 100, zoom: 0.35 } });
const seedMs = performance.now() - started;
const exec = promisify(execFile), session = `treetutor-large-${process.pid}`;
const init = join(mkdtempSync(join(tmpdir(), 'treetutor-profile-')), 'init.js');
writeFileSync(init, readFileSync(resolve('scripts/layout-clock.js'), 'utf8') + `
window.__nodeRenders = {};
window.__nodeRenderReasons = {}; window.__nodeRenderData = new Map();
window.__previewInFlight = 0;
const previewFetch = window.fetch;
window.fetch = async (...args) => {
  if (!String(args[0]).includes('/api/previews?')) return previewFetch(...args);
  window.__previewInFlight++;
  try {
    const response = await previewFetch(...args), json = response.json.bind(response);
    response.json = async () => { try { return await json(); } finally { window.__previewInFlight--; } };
    return response;
  } catch (error) { window.__previewInFlight--; throw error; }
};
`);
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024, env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: init } })).stdout;
const evaluate = async expression => JSON.parse(await browser('eval', expression, '--json')).data.result;
const wait = expression => browser('wait', '--fn', expression);
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
let emitChunk, finish;
const app = createApp({ store, assets, auth: { status: () => ({ connected: true }) }, provider: {
  models: async () => [{ model: 'fixture', label: 'Fixture', isDefault: true }],
  async generate(_tree, _prompt, emit) {
    emitChunk = text => emit({ type: 'item', item: 'reply', text });
    emitChunk('Short reply.');
    await new Promise(resolve => { finish = resolve; });
    emit({ type: 'status', status: 'completed' });
  },
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const report = { date: new Date().toISOString(), seed, conversations: count, turnsPerConversation: turns, messages: count * turns * 2, baseline, machine: { cpu: cpus()[0].model, logicalCpus: cpus().length, ramGiB: +(totalmem() / 2 ** 30).toFixed(1), os: `${process.platform} ${release()} ${arch()}`, node: process.version }, seedMs };
try {
  const before = performance.now(), payload = store.previews(conversations.map(t => t.id));
  report.previewQueryMs = performance.now() - before;
  report.previewBytes = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(Object.values(payload).every(rows => rows.length === 40 && rows.every(m => Array.from(m.text).length <= 513)));
  await browser('set', 'viewport', '1440', '900');
  const opened = performance.now();
  await browser('open', origin);
  await wait(`document.querySelector('.react-flow__node[data-id="${root.id}"] .node-preview')?.children.length === 40 && document.fonts.status === 'loaded'`);
  await wait(baseline ? `document.querySelectorAll('.node-message').length === 8000` : `document.querySelectorAll('.react-flow__node').length < 50`);
  report.openMs = performance.now() - opened;
  report.dom = await evaluate(`({ nodes: document.querySelectorAll('.react-flow__node').length, rows: document.querySelectorAll('.node-message').length, elements: document.querySelectorAll('*').length, userAgent: navigator.userAgent })`);
  console.log('Loaded:', JSON.stringify({openMs:report.openMs,dom:report.dom}));
  report.panZoom = await evaluate(`new Promise(resolve => {
    const pane = document.querySelector('.react-flow__pane'), times = [], start = performance.now(); let last = start, frame = 0;
    const box = pane.getBoundingClientRect(), transform = () => document.querySelector('.react-flow__viewport').style.transform;
    const initialTransform = transform(); let pannedTransform;
    pane.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, view:window, button:0, buttons:1, clientX:box.right-30, clientY:box.top+300 }));
    function tick(now) {
      if (frame) times.push(now-last); last=now;
      if (frame < 60) window.dispatchEvent(new MouseEvent('mousemove', { bubbles:true, view:window, buttons:1, clientX:box.right-30-frame*2, clientY:box.top+300-frame }));
      else { if (frame === 60) { pannedTransform = transform(); window.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, view:window, button:0 })); } pane.dispatchEvent(new WheelEvent('wheel', { bubbles:true, cancelable:true, deltaY:frame%2 ? -8 : 4, clientX:box.left+200, clientY:box.top+300 })); }
      if (++frame < 120) requestAnimationFrame(tick); else { times.sort((a,b)=>a-b); resolve({ frames:times.length, elapsedMs:performance.now()-start, p50Ms:times[Math.floor(times.length*.5)], p95Ms:times[Math.floor(times.length*.95)], maxMs:times.at(-1), over33Ms:times.filter(t=>t>33.4).length, initialTransform, pannedTransform, finalTransform:transform() }); }
    } requestAnimationFrame(tick);
  })`);
  assert.notEqual(report.panZoom.initialTransform, report.panZoom.pannedTransform, 'pan changes the real viewport');
  assert.notEqual(report.panZoom.pannedTransform, report.panZoom.finalTransform, 'wheel zoom changes the real viewport');
  const foldStart = performance.now();
  await click('Map menu');
  await browser('find', 'role', 'menuitem', 'click', '--name', 'Collapse all', '--exact');
  await wait(`document.querySelectorAll('.react-flow__node').length === 1`);
  report.foldMs = performance.now() - foldStart;
  const unfoldStart = performance.now();
  await click('Map menu');
  await browser('find', 'role', 'menuitem', 'click', '--name', 'Expand all', '--exact');
  await wait(`document.querySelector('.react-flow__node[data-id="${conversations[1].id}"] .node-preview')?.children.length === 40`);
  report.unfoldMs = performance.now() - unfoldStart;
  await click('Fit tree');
  await wait(`document.querySelectorAll('.react-flow__node').length === 200`);
  report.fit = await evaluate(`(() => {
    const c=document.querySelector('.tree-canvas').getBoundingClientRect();
    const rects=[...document.querySelectorAll('.react-flow__node')].map(n=>n.getBoundingClientRect());
    return { zoom:document.querySelector('[aria-label="Current zoom"]').textContent, allInside:rects.every(r=>r.left>=c.left-1 && r.right<=c.right+1 && r.top>=c.top-1 && r.bottom<=c.bottom+1) };
  })()`);
  assert.ok(report.fit.allInside, 'Fit tree contains all 200 full transcripts');
  await evaluate(`window.__selectionTiming = new Promise(resolve => {
    document.querySelector('[aria-label="Reopen chat"]').addEventListener('click', () => {
      const start = performance.now();
      function ready() {
        const n=document.querySelector('.react-flow__node[data-id="${root.id}"]')?.getBoundingClientRect(), c=document.querySelector('.tree-canvas').getBoundingClientRect();
        if (document.activeElement?.getAttribute('aria-label') === 'Your question' && n?.width >= 50 && n.left >= c.left-1 && n.right <= c.right+1 && n.top >= c.top+35 && n.bottom <= c.bottom+1) resolve(performance.now()-start);
        else requestAnimationFrame(ready);
      } requestAnimationFrame(ready);
    }, {once:true});
  }); true`);
  const selectStart = performance.now();
  await click('Reopen chat');
  report.selectClickMs = performance.now() - selectStart;
  await wait(`document.activeElement?.getAttribute('aria-label') === 'Your question'`);
  await wait(`parseFloat(document.querySelector('[aria-label="Current zoom"]').textContent) >= 20 && !document.documentElement.matches(':active-view-transition')`);
  report.selectMs = performance.now() - selectStart;
  report.selectUiMs = await evaluate('window.__selectionTiming');
  report.selectedBounds = await evaluate(`(() => { const n=document.querySelector('.react-flow__node[data-id="${root.id}"]').getBoundingClientRect(), c=document.querySelector('.tree-canvas').getBoundingClientRect(); return {left:n.left-c.left,top:n.top-c.top,right:n.right-c.left,bottom:n.bottom-c.top,canvasWidth:c.width,canvasHeight:c.height}; })()`);
  assert.ok(report.selectedBounds.left >= -1 && report.selectedBounds.top >= 35 && report.selectedBounds.right <= report.selectedBounds.canvasWidth + 1 && report.selectedBounds.bottom <= report.selectedBounds.canvasHeight + 1, 'selected tall node fits beside the chat panel');
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Continue the forest lesson');
  await click('Send');
  await wait(`document.querySelector('.node-message:last-child') && document.body.textContent.includes('Short reply.')`);
  // A visible folded neighbour must also keep its data reference on each chunk.
  await click('Collapse descendants of Conversation 1');
  await wait('window.__previewInFlight === 0');
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await evaluate('window.__nodeRenders = {}; window.__nodeRenderReasons = {}');
  const chunkStart = performance.now();
  for (let i = 0; i < 12; i++) { emitChunk(`Chunk ${i}: ${'More roots. '.repeat(10)}`); await new Promise(resolve => setTimeout(resolve, 40)); }
  await wait(`document.body.textContent.includes('Chunk 11:')`);
  report.streamingMs = performance.now() - chunkStart;
  report.chunkRenders = await evaluate('window.__nodeRenders');
  report.chunkRenderReasons = await evaluate('window.__nodeRenderReasons');
  assert.ok(report.chunkRenders[root.id] >= 1, 'profiler observes the replying node');
  assert.deepEqual(Object.keys(report.chunkRenders), [root.id], 'streaming chunks do not render unrelated conversations');
  finish(); finish = undefined;
  await wait(`!document.querySelector('[role="status"]')?.textContent.includes('Responding')`);
  await browser('screenshot', `/tmp/treetutor-large-${baseline ? 'before' : 'after'}.png`);
  console.log(JSON.stringify(report, null, 2));
  writeFileSync(`docs/verification/large-map-${baseline ? 'baseline' : 'results'}.json`, JSON.stringify(report, null, 2) + '\n');
} catch (error) { report.error = error.message; writeFileSync(`docs/verification/large-map-${baseline ? 'baseline' : 'results'}.json`, JSON.stringify(report, null, 2) + '\n'); throw error; }
finally { finish?.(); await browser('close').catch(() => {}); app.stop(); store.close(); }
