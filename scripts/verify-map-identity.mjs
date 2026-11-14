// Paperback map reference (family inks since TreeTutor-y36.2). Built app, isolated SQLite, synthetic providers only.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const exec = promisify(execFile),
  session = `map-identity-${process.pid}`;
const b = async (...args) =>
  (await exec('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const dir = mkdtempSync(join(tmpdir(), 'tt-map-identity-')),
  store = new Store(join(dir, 'trees.sqlite'));
let finish;
const provider = {
  models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
  async generate(tree, prompt, emit) {
    emit({
      type: 'item',
      item: 'reply',
      text: tree.instructions?.startsWith('You write the background')
        ? 'A tournament lock uses two-thread locks at each internal level.'
        : 'Each thread raises its flag, then gives the other thread priority.',
    });
    if (!tree.instructions?.startsWith('You write the background'))
      await new Promise((r) => {
        finish = r;
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
const origin = `http://127.0.0.1:${app.server.address().port}`;
const out = resolve('docs/verification');
mkdirSync(out, { recursive: true });
const results = {
  issue: 'TreeTutor-y36.7',
  date: new Date().toISOString(),
  evidence:
    'Built app; agent-browser Chromium; synthetic transcripts and providers; no live inference',
  references: ['map-reference-dark.png', 'map-reference-light.png'],
  referenceViewport: [1440, 900],
  appearances: {},
  checks: [],
};
const shot = (name) => b('screenshot', join(out, `map-${name}.png`));
const appearance = async (mode) => {
  await ev(`localStorage.setItem('treetutor.appearance', ${JSON.stringify(mode)}); true`);
  await b('reload');
};
const settled = () =>
  wait(
    `new Promise(r => { const v = () => document.querySelector('.react-flow__viewport')?.style.transform, a = v(); requestAnimationFrame(() => requestAnimationFrame(() => r(a === v()))); })`,
  );
const node = (id) => `.react-flow__node[data-id="${id}"]`;
const controlBounds = async () =>
  ev(
    `(() => { const t=document.querySelector('.map-toolbar').getBoundingClientRect(), m=document.querySelector('.overview').getBoundingClientRect(), s=document.querySelector('.shell-band').getBoundingClientRect(); return {bottom:m.bottom-t.bottom,left:t.left-m.left,within:t.left>=m.left && t.right<=m.right && t.top>=m.top && t.bottom<=m.bottom,clear:t.top>=s.bottom}; })()`,
  );
try {
  await b('set', 'viewport', '1440', '900');
  await b('set', 'media', 'light', 'reduced-motion');
  await b('open', origin);
  await wait(
    `document.querySelector('.empty-map')?.textContent.includes('Your first tree starts with a question.')`,
  );
  for (const mode of ['dark', 'light']) {
    await appearance(mode);
    await wait(
      `document.querySelector('.empty-map')?.textContent.includes('Your first tree starts with a question.')`,
    );
    assert.equal((await controlBounds()).within, true);
    await shot(`empty-${mode}`);
  }
  const root = store.create('Tournament trees', 'claude');
  store.message(root.id, 'user', 'How does a tournament lock work?', 'completed');
  const source = store.message(
    root.id,
    'assistant',
    'A tournament lock arranges Peterson locks into a binary tree. Each thread climbs from its leaf to the root, acquiring a two-thread lock at every level.',
    'completed',
  );
  store.message(root.id, 'user', 'Is it the same as selecting a winner?', 'completed');
  const later = store.message(
    root.id,
    'assistant',
    'A winner-selection tree propagates the smaller value. The lock instead arbitrates permission to enter a critical section.',
    'completed',
  );
  const branch = (parent, messageId, text, question) =>
    store.branch(
      parent,
      { messageId, start: 0, end: text.length, text, question },
      'Synthetic learning context.',
    );
  const heap = branch(root, later, 'A winner-selection tree', 'Heap comparison');
  store.message(heap.id, 'user', 'Why not use a binary heap?', 'completed');
  const heapReply = store.message(
    heap.id,
    'assistant',
    'A heap is useful when priorities change. A tournament tree keeps the path of comparisons explicit.',
    'completed',
  );
  const cost = branch(heap, heapReply, 'A heap', 'Updating a winner');
  store.message(
    cost.id,
    'assistant',
    'Updating a leaf revisits only the path to the root.',
    'completed',
  );
  const peterson = branch(root, source, 'A tournament lock', "Peterson's algorithm");
  store.message(peterson.id, 'user', 'Why does it need two flags?', 'completed');
  const petersonReply = store.message(
    peterson.id,
    'assistant',
    'Each thread raises its own flag to say “I want in”, then hands the turn to the other. The turn variable breaks a tie when both threads want to enter.',
    'completed',
  );
  const memory = branch(peterson, petersonReply, 'Each thread', 'Memory fences');
  store.message(memory.id, 'user', 'Does this still work on modern CPUs?', 'completed');
  store.message(
    memory.id,
    'assistant',
    'The proof assumes an order of reads and writes. Memory ordering must preserve those assumptions.',
    'completed',
  );
  for (const [t, x, y] of [
    [root, 0, 140],
    [heap, 365, 85],
    [peterson, 365, 450],
    [memory, 730, 450],
    [cost, 730, 85],
  ])
    store.position(t.id, x, y);
  store.layout(root.id, { folded: [heap.id], selected: peterson.id, panel: 'collapsed' });

  for (const mode of ['dark', 'light']) {
    await appearance(mode);
    await wait(
      `document.querySelectorAll('.react-flow__edge').length === 3 && document.querySelector(${JSON.stringify(node(memory.id))})`,
    );
    await wait(`document.fonts.status === 'loaded'`);
    await click('Fit tree');
    await settled();
    const styles = await ev(`(() => {
      const box=document.querySelector(${JSON.stringify(node(peterson.id) + ' .conversation-box')}), edge=document.querySelector('.branch-focused path'), plain=document.querySelector('.react-flow__edge:not(.branch-focused) path');
      const probe=v=>{ const p=document.createElement('i'); p.style.color=v; box.append(p); const c=getComputedStyle(p).color; p.remove(); return c; }, accent=probe('var(--color-accent)'), ink=probe('var(--treetutor-ink-2)'), paper=probe('var(--treetutor-paper)');
      const band=e=>getComputedStyle(document.querySelector(e+' .node-band')).backgroundColor, addr=e=>document.querySelector(e+' .node-address').textContent;
      return {ground:getComputedStyle(document.querySelector('.react-flow')).backgroundColor,radius:getComputedStyle(box).borderRadius,outline:getComputedStyle(box).outlineColor,offset:getComputedStyle(box).outlineOffset,accent,stroke:getComputedStyle(edge).stroke,width:getComputedStyle(edge).strokeWidth,plainWidth:getComputedStyle(plain).strokeWidth,cap:getComputedStyle(plain).strokeLinecap,titleWeight:getComputedStyle(box.querySelector('h2')).fontWeight,plainAnimated:plain.getAnimations().length,ink,paper,band:band(${JSON.stringify(node(peterson.id))}),childBand:band(${JSON.stringify(node(memory.id))}),trunkBand:band(${JSON.stringify(node(root.id))}),childStroke:getComputedStyle(document.querySelector('.react-flow__edge[data-id="${memory.id}"] path')).stroke,addresses:[${[root, heap, peterson, memory].map((t) => `addr(${JSON.stringify(node(t.id))})`).join(',')}]};
    })()`);
    assert.equal(styles.radius, '8px');
    assert.equal(styles.offset, '3px');
    assert.equal(styles.outline, styles.paper);
    // Peterson is the trunk's second family (1.2, leaf ink); its child shares the ink, the trunk wears paper.
    assert.deepEqual(styles.addresses, ['1', '1.1', '1.2', '1.2.1']);
    assert.equal(styles.stroke, styles.ink);
    assert.equal(styles.band, styles.ink);
    assert.equal(styles.childBand, styles.ink);
    assert.equal(styles.childStroke, styles.ink);
    assert.equal(styles.trunkBand, styles.paper);
    assert.equal(styles.width, '2.5px');
    assert.equal(styles.plainWidth, '2px');
    assert.equal(styles.cap, 'round');
    assert.equal(styles.titleWeight, '600');
    assert.equal(styles.plainAnimated, 0);
    assert.equal(
      await ev(
        `document.querySelectorAll('.react-flow__attribution, .react-flow__background').length`,
      ),
      0,
    );
    assert.equal(
      await ev(
        `document.querySelectorAll(${JSON.stringify(node(root.id) + ' [data-message]')}).length`,
      ),
      4,
    );
    assert.equal(
      await ev(
        `document.querySelector('[aria-label="Show hidden branch Updating a winner"]')?.textContent.trim()`,
      ),
      '1.1.1 · 1 folded',
    );
    const controls = await controlBounds();
    assert.equal(
      controls.within && controls.clear && controls.bottom === 12 && controls.left === 12,
      true,
    );
    results.appearances[mode] = { ...styles, controls };
    await shot(`reference-${mode}`);
    if (process.env.IMPECCABLE_SCAN) {
      const html = await ev(
        `document.documentElement.outerHTML.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '').replace('<head>', '<head><base href="${origin}/">')`,
      );
      const target = join(dir, `map-${mode}.html`);
      writeFileSync(target, html);
      let scan;
      try {
        scan = await exec(process.env.IMPECCABLE_SCAN, ['detect', `file://${target}`, '--json']);
      } catch (error) {
        if (error.code !== 2) throw error;
        scan = error;
      }
      results.appearances[mode].detector = JSON.parse(scan.stdout);
    }
    await click('Collapse descendants of Tournament trees');
    await click('Fit tree');
    await settled();
    const counts = await ev(
      `[...document.querySelectorAll('.fold-stub button')].map(e=>({name:e.getAttribute('aria-label'),count:e.textContent.trim()}))`,
    );
    assert.equal(counts.length, 2);
    assert.deepEqual(counts.map((c) => c.count).sort(), ['1.1 · 2 folded', '1.2 · 2 folded']);
    await shot(`folded-${mode}`);
    await click('Expand descendants of Tournament trees');
    await click('Fit tree');
    await settled();
  }
  results.checks.push(
    'Both appearances: bare field, no watermark/grid, 3px cards, 600 titles, focused path/node, 2px round branches, bottom-left controls, every message and counted stubs; opening/unfolding does not animate.',
  );
  results.checks.push(
    'Both appearances: addresses 1, 1.1, 1.2, 1.2.1; the 1.2 family band and branch lines wear ink 2, the trunk band wears paper.',
  );
  // Read: the passage underline and address chip of a family share its node band and branch ink.
  for (const mode of ['dark', 'light']) {
    await appearance(mode);
    await wait(`document.querySelector(${JSON.stringify(node(root.id))})`);
    await click('Open Tournament trees');
    await wait(
      `document.querySelector('.focused-chat h2')?.textContent === 'Tournament trees' && document.querySelectorAll('.reply-md .passage-address').length === 2 && !document.documentElement.matches(':active-view-transition')`,
    );
    const read =
      await ev(`(() => { const p=document.createElement('i'); p.style.color='var(--treetutor-ink-2)'; document.body.append(p); const ink=getComputedStyle(p).color; p.remove();
      const chip=[...document.querySelectorAll('.reply-md .passage-address')].find(c=>c.textContent==='1.2'), u=chip.previousElementSibling;
      return {ink,underline:getComputedStyle(u).textDecorationColor,chip:getComputedStyle(chip).backgroundColor,chips:[...document.querySelectorAll('.reply-md .passage-address')].map(c=>c.textContent),label:document.querySelector('.reply-md u.explored[tabindex]').getAttribute('aria-label')}; })()`);
    assert.equal(read.underline, read.ink);
    assert.equal(read.chip, read.ink);
    assert.deepEqual(read.chips.sort(), ['1.1', '1.2']);
    results.appearances[mode].read = read;
    await b('screenshot', join(out, `read-inks-${mode}.png`));
    await click('Return to tree');
    await click('Fit tree');
    await settled();
  }
  results.checks.push(
    'Both appearances: the 1.2 passage underline and its address chip share the ink of its node band and branch line.',
  );
  // Keyboard opening, source attachment and focus marker survive returning to the map.
  await b('focus', `#open-${peterson.id}`);
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === "Peterson's algorithm" && !document.documentElement.matches(':active-view-transition')`,
  );
  await click('Return to tree');
  await click('Fit tree');
  await settled();
  assert.equal(
    await ev(
      `document.querySelector(${JSON.stringify(node(peterson.id) + ' .conversation-box')}).dataset.focused`,
    ),
    'true',
  );
  const attachment = await ev(
    `(() => { const h=document.querySelector('[data-source="${peterson.id}"]'), p=document.querySelector('.react-flow__edge[data-id="${peterson.id}"] path'), r=h.getBoundingClientRect(), a=p.getPointAtLength(0), q=new DOMPoint(a.x,a.y).matrixTransform(p.getScreenCTM()); return {message:h.closest('[data-message]').dataset.message,gap:Math.hypot(q.x-r.right,q.y-r.top-r.height/2)}; })()`,
  );
  assert.equal(attachment.message, source);
  assert.ok(attachment.gap < 1);
  // Observe the actual draw-on on a branch created through the keyboard passage flow.
  await b('set', 'media', 'light');
  await click('Open Tournament trees');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === 'Tournament trees' && !document.documentElement.matches(':active-view-transition')`,
  );
  await ev(
    `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Select passage in tutor reply 1').focus(); true`,
  );
  await b('press', 'Enter');
  await b('press', 'Home');
  await b('press', 'Shift+ArrowRight');
  await b('press', 'Tab');
  await b('press', 'Enter');
  await b(
    'find',
    'role',
    'textbox',
    'fill',
    '--name',
    'Question about this passage',
    'A new chalk branch',
  );
  await ev(
    `window.__draw=[]; new MutationObserver(()=>document.querySelectorAll('.branch-new').forEach(p=>{if(!p.__seen){p.__seen=true;const a=p.getAnimations()[0];window.__draw.push({duration:a?.effect.getTiming().duration,frames:a?.effect.getKeyframes().map(f=>f.strokeDashoffset),length:p.getAttribute('pathLength')});}})).observe(document.querySelector('.tree-canvas'),{subtree:true,childList:true}); true`,
  );
  await click('Create focused chat');
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === 'A new chalk branch' && window.__draw.length>0`,
  );
  const draw = await ev('window.__draw');
  assert.equal(draw[0].duration, 350);
  assert.deepEqual(draw[0].frames.map(parseFloat), [1, 0]);
  assert.equal(draw[0].length, '1');
  await wait(`document.querySelector('.focused-chat [aria-label=Stop]')`);
  await click('Return to tree');
  await click('Fit tree');
  await settled();
  const fresh = store.list().find((t) => t.title === 'A new chalk branch');
  await wait(
    `getComputedStyle(document.querySelector(${JSON.stringify(node(fresh.id) + ' .activity-dot')})).animationName === 'pulse'`,
  );
  await b('set', 'media', 'light', 'reduced-motion');
  await wait(
    `getComputedStyle(document.querySelector('.branch-new')).animationName === 'none' && getComputedStyle(document.querySelector(${JSON.stringify(node(fresh.id) + ' .activity-dot')})).animationName === 'none'`,
  );
  await shot('activity-light');
  results.draw = draw;
  results.attachment = attachment;
  results.checks.push(
    'Keyboard open/return retains focused conversation; branch leaves its source message; new branch draws 350ms from source to child; replying dot pulses, both stop under reduced motion.',
  );
  finish();
  finish = undefined;
  await b('set', 'media', 'light');
  await click('Collapse descendants of Tournament trees');
  await click('Expand descendants of Tournament trees');
  await wait(
    `!!document.querySelector('.branch-new') && !document.querySelector('.branch-new').getAnimations().some(a=>a.playState==='running')`,
  );
  results.checks.push(
    'A newly created branch does not replay its draw-on when folded and unfolded later.',
  );
  await b('set', 'media', 'light', 'reduced-motion');
  await b('set', 'viewport', '390', '844');
  await click('Fit tree');
  await settled();
  assert.equal(await ev('document.documentElement.scrollWidth === innerWidth'), true);
  assert.equal((await controlBounds()).within, true);
  assert.equal((await controlBounds()).clear, true);
  await shot('narrow-light');
  results.checks.push(
    '390px map has no horizontal overflow; controls remain visible bottom-left and clear of the shell band.',
  );
  writeFileSync(join(out, 'map-identity-results.json'), JSON.stringify(results, null, 2) + '\n');
  if (process.env.IMPECCABLE_SCAN)
    writeFileSync(
      join(out, 'map-detector-results.json'),
      JSON.stringify(
        Object.fromEntries(
          Object.entries(results.appearances).map(([mode, data]) => [mode, data.detector]),
        ),
        null,
        2,
      ) + '\n',
    );
  console.log('PASS: ' + results.checks.join('\nPASS: '));
} catch (error) {
  console.error(await b('snapshot').catch(() => 'snapshot unavailable'));
  throw error;
} finally {
  finish?.();
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
