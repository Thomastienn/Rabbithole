import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// Synthetic provider; real built UI, pointer drag, HTTP/SSE and reopened SQLite/HTTP app.
const path = join(mkdtempSync(join(tmpdir(), 'treetutor-growth-')), 'trees.sqlite');
let store = new Store(path);
const root = store.create('Growing conversation');
store.message(root.id, 'user', 'Explain roots.', 'completed');
const source = store.message(root.id, 'assistant', 'Roots exchange nutrients.', 'completed');
const branch = (parent, messageId, title) =>
  store.branch(
    parent,
    { messageId, start: 0, end: 5, text: 'Roots', question: title },
    'Frozen fixture context',
  );
const lower = branch(root, source, 'Covered branch');
const nestedSource = store.message(lower.id, 'assistant', 'Roots have fungi.', 'completed');
const descendant = branch(lower, nestedSource, 'Nested branch');
const near = branch(root, source, 'Clear neighbour');
const far = branch(root, source, 'Distant neighbour');
for (const [t, x, y] of [
  [root, 0, 0],
  [lower, 0, 220],
  [descendant, 360, 600],
  [near, 270, 100],
  [far, 720, 220],
])
  store.position(t.id, x, y);
store.layout(root.id, {
  folded: [],
  selected: root.id,
  panel: 'collapsed',
  viewport: { x: 60, y: 100, zoom: 0.8 },
});
const exec = promisify(execFile),
  session = `treetutor-growth-${process.pid}`;
const browser = async (...args) =>
  (
    await exec('agent-browser', ['--session', session, ...args], {
      env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') },
    })
  ).stdout;
const evaluate = async (expression) =>
  JSON.parse(await browser('eval', expression, '--json')).data.result;
const wait = (expression) => browser('wait', '--fn', expression);
const click = (name) => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const selector = (id) => `.react-flow__node[data-id="${id}"]`;
const boxes = () =>
  evaluate(
    `Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map(n=>{const p=new DOMMatrixReadOnly(getComputedStyle(n).transform);return [n.dataset.id,{x:p.e,y:p.f,width:n.offsetWidth,height:n.offsetHeight}]}))`,
  );
const position = (b) => ({ x: b.x, y: b.y });
const saved = () => store.list().map((t) => [t.id, t.x, t.y]);
const flush = async () => {
  await evaluate('__layoutMinute()');
  await wait('window.__layoutInFlight === 0');
};
const clear = (rects) => {
  const list = Object.values(rects);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i],
        b = list[j];
      assert.ok(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
        `overlap: ${JSON.stringify([a, b])}`,
      );
    }
};
let emitChunk, finish;
const makeApp = () =>
  createApp({
    store,
    auth: { status: () => ({ connected: true }) },
    provider: {
      models: async () => [{ model: 'fixture', label: 'Fixture', isDefault: true }],
      async generate(_tree, _prompt, emit) {
        emitChunk = (text) => emit({ type: 'item', item: 'reply', text });
        emitChunk('Short reply.');
        await new Promise((resolve) => {
          finish = resolve;
        });
        emit({ type: 'status', status: 'completed' });
      },
    },
  });
const app = makeApp();
let restarted;
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const report = {
  date: new Date().toISOString(),
  evidence:
    'Seeded data, synthetic provider, real browser and HTTP/SSE; controlled one-minute timer; SQLite/HTTP app restored in a fresh Node process. No native provider inference.',
  stages: {},
};
try {
  await browser('set', 'viewport', '1440', '1000');
  await browser('open', origin);
  await wait(
    `document.querySelectorAll('.node-message').length === 3 && document.fonts.status === 'loaded'`,
  );
  const before = await boxes();
  clear(before);
  report.stages.initial = before;
  await click('Open Growing conversation');
  await wait(`document.activeElement?.getAttribute('aria-label') === 'Your question'`);
  const send = async () => {
    await browser(
      'find',
      'role',
      'textbox',
      'fill',
      '--name',
      'Your question',
      'Explain roots, fungi, and their forest nutrient network. '.repeat(6),
    );
    await click('Send');
    await wait(
      `document.querySelector('.focused-chat')?.textContent.includes('Short reply.') && !!document.querySelector('[aria-label="Stop"]')`,
    );
  };
  await send();
  await wait(
    `new DOMMatrixReadOnly(getComputedStyle(document.querySelector('${selector(lower.id)}')).transform).f > 220`,
  );
  const grown = await boxes();
  clear(grown);
  report.stages.grown = grown;
  assert.deepEqual(position(grown[root.id]), position(before[root.id]));
  const dy = grown[lower.id].y - before[lower.id].y;
  assert.ok(dy > 0);
  assert.equal(
    grown[descendant.id].y - before[descendant.id].y,
    dy,
    'whole subtree shifts by the same amount',
  );
  for (const id of [near.id, far.id])
    assert.deepEqual(position(grown[id]), position(before[id]), 'clear neighbours stay put');
  assert.equal(await evaluate('__layoutPosts'), 0, 'growth waits for the existing minute batch');

  // Hold a real pointer drag just below the old reply; its next chunk will cover this spot.
  const drag = await evaluate(
    `(() => {const n=document.querySelector('${selector(lower.id)}'),r=n.getBoundingClientRect(),v=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.react-flow__viewport')).transform);return {x:r.left+r.width/2,y:r.bottom-3,zoom:v.a};})()`,
  );
  const delta = (grown[root.id].height + 5 - grown[lower.id].y) * drag.zoom;
  await browser('mouse', 'move', String(Math.round(drag.x)), String(Math.round(drag.y)));
  await browser('mouse', 'down', 'left');
  await browser(
    'mouse',
    'move',
    String(Math.round(drag.x)),
    String(Math.round(drag.y + delta)),
    '--duration',
    '200',
    '--steps',
    '8',
  );
  await wait(`document.querySelector('${selector(lower.id)}').classList.contains('dragging')`);
  const held = await boxes();
  emitChunk('Long streaming explanation about roots and their fungi. '.repeat(30));
  await wait(
    `document.querySelector('${selector(root.id)}').offsetHeight > ${held[root.id].height}`,
  );
  const streaming = await boxes();
  report.stages.dragHeld = streaming;
  assert.deepEqual(
    position(streaming[lower.id]),
    position(held[lower.id]),
    'growth never moves the dragged box',
  );
  assert.deepEqual(
    position(streaming[descendant.id]),
    position(held[descendant.id]),
    'defer the whole subtree',
  );
  await browser('mouse', 'up', 'left');
  await wait(
    `new DOMMatrixReadOnly(getComputedStyle(document.querySelector('${selector(lower.id)}')).transform).f >= document.querySelector('${selector(root.id)}').offsetHeight`,
  );
  const released = await boxes();
  clear(released);
  report.stages.dragReleased = released;
  const afterDrag = released[lower.id].y - held[lower.id].y;
  assert.ok(afterDrag > 0);
  assert.equal(released[descendant.id].y - held[descendant.id].y, afterDrag);
  finish();
  finish = undefined;
  await wait(`!document.querySelector('[aria-label="Stop"]')`);
  await flush();
  const beforeFold = saved();
  const posts = await evaluate('__layoutPosts');
  assert.equal(posts, 1, 'growth and drag coalesce into one write');
  assert.equal(await evaluate('__layoutMinute()'), 0, 'idle schedules no writes');
  assert.equal(await evaluate('__layoutPosts'), posts);

  await click('Collapse descendants of Growing conversation');
  await wait(`document.querySelectorAll('.react-flow__node').length === 1`);
  await send();
  finish();
  finish = undefined;
  await wait(`!document.querySelector('[aria-label="Stop"]')`);
  await flush();
  assert.deepEqual(saved(), beforeFold, 'hidden descendants occupy no space while the root grows');
  report.hiddenPositionsUnchanged = true;
  await click('Expand descendants of Growing conversation');
  await wait(
    `document.querySelectorAll('.react-flow__node').length === 5 && new DOMMatrixReadOnly(getComputedStyle(document.querySelector('${selector(lower.id)}')).transform).f >= document.querySelector('${selector(root.id)}').offsetHeight`,
  );
  const unfolded = await boxes();
  clear(unfolded);
  report.stages.unfolded = unfolded;
  assert.deepEqual(position(unfolded[root.id]), position(before[root.id]));
  for (const id of [near.id, far.id])
    assert.deepEqual(position(unfolded[id]), position(before[id]));
  await click('Return to tree');
  await wait(
    `getComputedStyle(document.querySelector('.focused-chat')).display === 'none' && !document.documentElement.matches(':active-view-transition')`,
  );
  await click('Fit tree');
  await wait(
    `(() => {const c=document.querySelector('.tree-canvas').getBoundingClientRect();return [...document.querySelectorAll('.react-flow__node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=c.left&&r.right<=c.right&&r.top>=c.top&&r.bottom<=c.bottom;});})()`,
  );
  await flush();
  const persisted = saved(),
    messages = store.tree(root.id).messages;
  report.layoutPostsBeforeRestart = await evaluate('__layoutPosts');
  const port = app.server.address().port;
  app.stop();
  store.close();
  restarted = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { Store } from './server/store.mjs';
    import { createApp } from './server/app.mjs';
    const store = new Store(process.argv[1]);
    const app = createApp({ store, auth: {status:()=>({connected:true})}, provider: {models:async()=>[{model:'fixture',label:'Fixture',isDefault:true}]} });
    app.server.listen(Number(process.argv[2]), '127.0.0.1', () => process.send('ready'));
    process.on('SIGTERM', () => { app.stop(); store.close(); process.exit(0); });
  `,
      path,
      String(port),
    ],
    { cwd: resolve('.'), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  let restartError = '';
  restarted.stderr.on('data', (data) => {
    restartError += data;
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Restart timed out: ${restartError}`)), 10000);
    restarted.once('message', () => {
      clearTimeout(timer);
      resolve();
    });
    restarted.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    restarted.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Restart exited ${code}: ${restartError}`));
    });
  });
  store = new Store(path);
  await browser('reload');
  await wait(
    `document.querySelectorAll('.react-flow__node').length === 5 && document.querySelectorAll('.node-message').length === 7`,
  );
  const reopened = await boxes();
  clear(reopened);
  for (const [id, x, y] of persisted)
    assert.deepEqual(
      position(reopened[id]),
      { x, y },
      'shifted positions survive SQLite/app reopen',
    );
  assert.deepEqual(saved(), persisted);
  assert.deepEqual(store.tree(root.id).messages, messages);
  assert.deepEqual(store.tree(lower.id).branch, lower.branch);
  report.restartPositionsExact = true;
  report.freshServerProcess = restarted.pid !== process.pid;
  await browser('screenshot', resolve('.impeccable/review/node-growth-desktop.png'));
  await browser('set', 'viewport', '390', '844');
  await click('Fit tree');
  await browser('screenshot', resolve('.impeccable/review/node-growth-mobile.png'));
  assert.equal(await evaluate('document.documentElement.scrollWidth === innerWidth'), true);
  writeFileSync(
    'docs/verification/node-growth-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    'PASS: growing node pinned; covered subtree shifts; clear neighbours stay; drag defers then resolves; hidden boxes take no space; unfold clears overlaps; one-minute batch and idle; Fit; exact positions after SQLite/HTTP restart; mobile.',
  );
} catch (error) {
  report.error = error.message;
  writeFileSync(
    'docs/verification/node-growth-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  throw error;
} finally {
  finish?.();
  await browser('close').catch(() => {});
  if (app.server.listening) app.stop();
  if (restarted && restarted.exitCode === null && restarted.signalCode === null) {
    const exited = once(restarted, 'exit');
    restarted.kill('SIGTERM');
    await exited;
  }
  store.close();
}
