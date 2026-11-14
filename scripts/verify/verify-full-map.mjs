// Full Map and conversation states: production build, isolated SQLite and synthetic provider only.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
  session = `full-map-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const node = (id) => `.react-flow__node[data-id="${id}"]`;
const settled = () =>
  wait(
    `new Promise(r=>{const v=()=>document.querySelector('.react-flow__viewport')?.style.transform,a=v();requestAnimationFrame(()=>requestAnimationFrame(()=>r(a===v())));})`,
  );
const dir = mkdtempSync(join(tmpdir(), 'tt-full-map-')),
  store = new Store(join(dir, 'trees.sqlite'));
const other = store.create('Unrelated learning tree');
const otherSource = store.message(other.id, 'assistant', 'Other passage', 'completed');
store.branch(
  other,
  { messageId: otherSource, start: 0, end: 5, text: 'Other', question: 'Unrelated family' },
  'Fixture',
);
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
const source = store.message(
  root.id,
  'assistant',
  'Fungi exchange phosphorus for sugar. Hyphae extend the reach of roots into the soil.',
  'completed',
);
const titles = [
  'Why trade at all?',
  'What are hyphae?',
  'Phosphorus in soil',
  'What if a reply stops?',
  'Who cheats?',
];
const families = titles.map((question, i) => {
  const t = store.branch(
    root,
    { messageId: source, start: 0, end: 5, text: 'Fungi', question },
    'Synthetic context.',
  );
  store.db.prepare('UPDATE trees SET created=? WHERE id=?').run(root.created + i + 1, t.id);
  return t;
});
const rawQuestion = 'Where does phosphorus come from? '.repeat(40);
const answers = [
  'Each partner offers something the other needs.',
  'Hyphae are thread-like cells that reach beyond the roots.',
  '',
  'An interrupted reply keeps its text.',
  'Trade depends on local conditions.',
];
for (const [i, t] of families.entries()) {
  store.message(t.id, 'user', i === 2 ? rawQuestion : titles[i], 'completed');
  if (i === 4) {
    store.message(t.id, 'assistant', 'Earlier failure', 'failed');
    store.message(t.id, 'user', 'Continue the discussion', 'completed');
  }
  const m = store.message(
    t.id,
    'assistant',
    answers[i],
    i === 2 ? 'failed' : i === 3 ? 'interrupted' : 'completed',
  );
  if (i === 3) store.update(m, answers[i], 'interrupted', 'learner');
}
const childSource = store.tree(families[0].id).messages.at(-1).id;
const deep = store.branch(
  families[0],
  { messageId: childSource, start: 0, end: 4, text: 'Each', question: 'Could a plant go alone?' },
  'Fixture',
);
store.message(
  deep.id,
  'assistant',
  'Some can, but many plants grow poorly without a partner.',
  'completed',
);
for (const [t, x, y] of [
  [root, 0, 180],
  [families[0], 370, 0],
  [families[1], 370, 310],
  [families[2], 740, 0],
  [families[3], 740, 270],
  [families[4], 740, 510],
  [deep, 1100, 0],
])
  store.position(t.id, x, y);
store.layout(root.id, { folded: [families[0].id], selected: families[1].id, panel: 'collapsed' });
let release,
  calls = 0;
const provider = {
  models: async () => [{ model: 'fixture', label: 'Fixture', isDefault: true }],
  async generate(_tree, prompt, emit) {
    calls++;
    assert.equal(
      prompt,
      rawQuestion,
      'map retry uses the full saved question, not its truncated preview',
    );
    emit({
      type: 'item',
      item: 'reply',
      text: 'Retry fixture: phosphorus is released by weathering.',
    });
    await new Promise((r) => {
      release = r;
    });
    emit({ type: 'status', status: 'completed' });
  },
};
const app = createApp({
  dir,
  store,
  providers: { claude: provider, codex: provider },
  auth: { status: () => ({ connected: true }) },
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`,
  out = resolve(verifyOut);
mkdirSync(out, { recursive: true });
const report = {
  issue: 'TreeTutor-y36.7',
  evidence: 'Production-build Chromium; synthetic transcripts/provider; no live inference',
  appearances: {},
  checks: [],
};
const shot = (name) => b('screenshot', join(out, `full-map-${name}.png`));
try {
  await b('set', 'viewport', '1440', '900');
  await b('set', 'media', 'light', 'reduced-motion');
  await b('open', origin);
  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance',${JSON.stringify(mode)});true`);
    await b('reload');
    await wait(
      `document.querySelectorAll('.ink-legend li').length===6 && document.querySelectorAll('.react-flow__node').length===6`,
    );
    await wait(`document.fonts.status==='loaded'`);
    await click('Fit tree');
    await settled();
    const state = await ev(`(() => {
      const probe=v=>{const p=document.createElement('i');p.style.color=v;document.body.append(p);const c=getComputedStyle(p).color;p.remove();return c;};
      const map=document.querySelector('.overview'),r=map.getBoundingClientRect(),band=document.querySelector('.shell-band').getBoundingClientRect(),legend=document.querySelector('.ink-legend'),l=legend.getBoundingClientRect(),toolbar=document.querySelector('.map-toolbar').getBoundingClientRect();
      const rows=[...legend.querySelectorAll('li')].map(li=>({text:li.textContent,ink:getComputedStyle(li.querySelector('.contents-dot')).backgroundColor}));
      const failed=document.querySelector(${JSON.stringify(node(families[2].id) + ' .node-status')}),current=document.querySelector(${JSON.stringify(node(families[1].id) + ' .conversation-box')});
      return { rows, inks:[1,2,3,4,1].map(i=>probe('--unused'.replace('--unused','var(--treetutor-ink-'+i+')'))),paper:probe('var(--treetutor-paper)'),outline:getComputedStyle(current).outlineColor,failed:getComputedStyle(failed).color,error:probe('var(--color-error)'),legendText:getComputedStyle(legend).color,ground:getComputedStyle(map).backgroundColor,
        full:Math.abs(r.width-innerWidth)<1 && Math.abs(r.top-band.bottom)<1 && r.bottom===innerHeight,clear:l.left>=r.left && l.right<=r.right && l.top>=r.top && l.bottom<=toolbar.top || l.left>=toolbar.right,
        inkOn:probe('var(--treetutor-ink-on)'),paperOn:probe('var(--treetutor-paper-ink)'),surface:probe('var(--color-background-surface)'),muted:probe('var(--color-text-secondary)'),hover:probe('var(--color-text-secondary)'),retry:document.querySelectorAll('.overview .node-retry').length,contents:!!document.querySelector('.contents')};
    })()`);
    assert.deepEqual(
      state.rows.map((r) => r.text),
      [`1 ${root.title} · trunk`, ...titles.map((t, i) => `1.${i + 1} ${t}`)],
    );
    assert.deepEqual(
      state.rows.slice(1).map((r) => r.ink),
      state.inks,
    );
    assert.equal(state.rows[0].ink, state.paper);
    assert.equal(state.outline, state.paper);
    assert.equal(state.failed, state.error);
    assert.equal(state.full, true);
    assert.equal(state.clear, true);
    assert.equal(state.contents, false);
    assert.equal(state.retry, 1);
    // WCAG relative luminance, from computed opaque theme colours.
    const lum = (rgb) =>
      rgb
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((c) => c / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    state.contrast = {
      legend: ratio(state.legendText, state.ground),
      failure: ratio(state.failed, state.surface),
      body: ratio(state.muted, state.surface),
      trunk: ratio(state.paper, state.paperOn),
      current: ratio(state.paper, state.ground),
      bands: state.inks.map((ink) => ratio(ink, state.inkOn)),
    };
    assert.ok(
      [
        state.contrast.legend,
        state.contrast.failure,
        state.contrast.body,
        state.contrast.trunk,
        ...state.contrast.bands,
      ].every((r) => r >= 4.5),
      JSON.stringify(state.contrast),
    );
    assert.ok(state.contrast.current >= 3);
    await shot(mode);
    // Keyboard focus on the map, its controls and legend uses paper, not family ink.
    for (const selector of [
      '.tree-canvas',
      '.map-toolbar button',
      '.ink-legend',
      `#open-${families[1].id}`,
      `#fold-${families[0].id}`,
      `#reveal-${families[1].id}`,
      '.node-retry',
    ]) {
      await b('focus', selector);
      await b('press', 'Tab');
      await b('press', 'Shift+Tab');
      const ring = await ev(
        `({visible:document.activeElement.matches(':focus-visible'),color:getComputedStyle(document.activeElement).outlineColor,style:getComputedStyle(document.activeElement).outlineStyle})`,
      );
      assert.equal(ring.visible, true, selector);
      assert.equal(ring.color, state.paper, selector);
      assert.equal(ring.style, 'solid', selector);
    }
    await b('hover', `${node(families[1].id)} .conversation-box`);
    assert.equal(
      await ev(
        `getComputedStyle(document.querySelector(${JSON.stringify(node(families[1].id) + ' .conversation-box')})).borderColor`,
      ),
      state.hover,
    );
    await click('Collapse descendants of How do fungi trade?');
    await click('Fit tree');
    await settled();
    const stubs = await ev(
      `[...document.querySelectorAll('.fold-stub')].map(e=>({text:e.innerText.trim(),ink:getComputedStyle(e,'::before').borderTopColor})).sort((a,b)=>a.text.localeCompare(b.text))`,
    );
    assert.deepEqual(
      stubs.map((s) => s.text),
      ['1.1 · 2 folded', '1.2 · 1 folded', '1.3 · 1 folded', '1.4 · 1 folded', '1.5 · 1 folded'],
    );
    assert.deepEqual(
      stubs.map((s) => s.ink),
      state.inks,
    );
    assert.equal(
      await ev(
        `[...document.querySelectorAll('.fold-stub button')].every(s=>{const r=s.getBoundingClientRect();return s.contains(document.elementFromPoint(r.right-4,r.top+r.height/2));})`,
      ),
      true,
      'folded stubs are not covered by later nodes',
    );
    assert.equal(
      await ev(`document.querySelectorAll('.ink-legend li').length`),
      6,
      'legend includes folded families',
    );
    await shot(`folded-${mode}`);
    await click('Expand descendants of How do fungi trade?');
    await click('Fit tree');
    await settled();
    await b('set', 'viewport', '390', '844');
    await click('Fit tree');
    await settled();
    assert.equal(
      await ev(
        `document.documentElement.scrollWidth===innerWidth && (()=>{const l=document.querySelector('.ink-legend').getBoundingClientRect(),t=document.querySelector('.map-toolbar').getBoundingClientRect();return l.left>=0 && l.right<=innerWidth && l.bottom<t.top && t.bottom<=innerHeight;})()`,
      ),
      true,
    );
    await shot(`narrow-${mode}`);
    await b('set', 'viewport', '1440', '900');
    report.appearances[mode] = { ...state, stubs };
  }
  report.checks.push(
    'Both appearances: full workspace, five named/addressed families, repeated inks, trunk paper, folded family remains in legend, other learning trees/deeper descendants excluded, paper current/focus, hover, rose failures, latest-failed-only Retry, AA contrast, narrow legend clear of controls.',
  );
  await click('Fit tree');
  await settled();
  // Loading the full conversation can fail; keep the map and failed reply recoverable.
  await ev(
    `window.__fetch=window.fetch;window.fetch=(...args)=>{if(args[0]=== '/api/trees/${families[2].id}'){window.fetch=window.__fetch;return Promise.resolve(new Response(JSON.stringify({error:'Fixture conversation unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}));}return window.__fetch(...args);};true`,
  );
  await b('focus', '.node-retry');
  await b('press', 'Enter');
  await wait(`document.body.textContent.includes('Fixture conversation unavailable')`);
  assert.equal(calls, 0);
  await b('focus', '.node-retry');
  await b('press', 'Enter');
  await wait(
    `document.querySelector(${JSON.stringify(node(families[2].id))})?.textContent.includes('Retry fixture:') && !document.querySelector('.node-retry')`,
  );
  assert.equal(calls, 1);
  assert.equal(
    await ev(`getComputedStyle(document.querySelector('.focused-chat')).display`),
    'none',
  );
  assert.equal(await ev('document.activeElement.id'), `open-${families[2].id}`);
  release();
  release = undefined;
  await wait(`!document.querySelector(${JSON.stringify(node(families[2].id))}+' .node-status')`);
  assert.deepEqual(
    store.tree(families[2].id).messages.map((m) => [m.role, m.status]),
    [
      ['user', 'completed'],
      ['assistant', 'completed'],
    ],
  );
  assert.equal(store.tree(families[2].id).messages[0].text, rawQuestion);
  report.checks.push(
    'Keyboard map Retry: full-conversation fetch failure stays recoverable; successful retry uses raw untruncated question, replaces reply in place, leaves map open and focus on its title, no duplicate question/call. Learner-stopped and historical failed replies have no map Retry.',
  );
  // Ink legend follows actual rename/delete actions without storing duplicate labels.
  await click('Open Who cheats?');
  await wait(
    `!document.documentElement.matches(':active-view-transition') && document.querySelector('.focused-chat h2')?.textContent==='Who cheats?'`,
  );
  assert.equal(
    await ev(`document.querySelector('.ink-legend').checkVisibility()`),
    false,
    'Read uses the existing compact map without a second legend',
  );
  await click('Rename conversation');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Conversation title', 'Partner choice');
  await click('Save title');
  await click('Return to tree');
  await wait(`document.querySelector('.ink-legend').textContent.includes('1.5 Partner choice')`);
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Delete branch…', '--exact');
  await click('Delete branch');
  await wait(
    `document.querySelectorAll('.ink-legend li').length===5 && !document.querySelector('.ink-legend').textContent.includes('Partner choice')`,
  );
  report.checks.push(
    'Legend reflects rename and confirmed deletion immediately; compact Read map omits the legend.',
  );
  writeFileSync(join(out, 'full-map-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: ' + report.checks.join('\nPASS: '));
} catch (e) {
  console.error(await b('snapshot').catch(() => ''));
  throw e;
} finally {
  release?.();
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
