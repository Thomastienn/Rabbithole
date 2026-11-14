// Focused UI check: fixture visuals render inline in the built UI, inside the sandbox, in light and dark. No paid inference.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const dir = mkdtempSync(join(tmpdir(), 'tt-visual-sandbox-'));
const store = new Store(join(dir, 'trees.sqlite'));
const tree = store.create('Visual fixture');
const text =
  'Intro paragraph about the bars.\n\nMiddle paragraph after the chart.\n\nClosing paragraph.';
store.message(tree.id, 'user', 'Show me the bars', 'completed');
const reply = store.message(tree.id, 'assistant', text, 'completed');
const visual = (title, description, source, position) => {
  const a = store.pendingArtifact(tree.id, reply, title, description, 'visual', null, position);
  return source ? store.finishArtifact(tree.id, a.id, source) : a;
};
// Test instrumentation: visuals report what they observe with a message type the app must ignore.
const good = visual(
  'Bar heights',
  'Three bars of heights 3, 7 and 5.',
  `<div id="chart"></div><p>Bars grow with the value.</p><script>
const svg = d3.select('#chart').append('svg').attr('viewBox', '0 0 400 120').attr('width', '100%').attr('role', 'img').attr('aria-label', 'Bars');
svg.selectAll('rect').data([3, 7, 5]).join('rect').attr('x', (d, i) => i * 140).attr('y', d => 120 - d * 15).attr('width', 110).attr('height', d => d * 15).attr('fill', 'var(--color-text-blue)');
let last = '';
setInterval(() => {
  const s = getComputedStyle(document.body), r = JSON.stringify({ color: s.color, background: s.backgroundColor, root: getComputedStyle(document.documentElement).backgroundColor, font: s.fontFamily, libs: [typeof mermaid, typeof THREE, typeof katex, typeof d3].join() });
  if (r !== last) { last = r; parent.postMessage({ type: 'report', who: 'good', data: r }, '*'); }
}, 100);
</script>`,
  text.indexOf('Middle'),
);
const pending = visual('Coming soon', 'A visual still generating.', null, text.indexOf('Closing'));
const hostile = visual(
  'Hostile',
  'A visual that tries to escape its sandbox.',
  `<p>Hostile fixture</p><script>
(async () => {
  const r = {};
  try { await fetch('/api/state'); r.fetch = 'open'; } catch { r.fetch = 'blocked'; }
  try { await fetch('https://example.com/'); r.remote = 'open'; } catch { r.remote = 'blocked'; }
  try { r.storage = String(localStorage.length); } catch { r.storage = 'blocked'; }
  try { r.parentStorage = String(parent.localStorage.length); } catch { r.parentStorage = 'blocked'; }
  try { r.parentDom = parent.document.title; } catch { r.parentDom = 'blocked'; }
  try { r.cookie = document.cookie || 'empty'; } catch { r.cookie = 'blocked'; }
  r.image = await new Promise(done => { const i = new Image(); i.onload = () => done('loaded'); i.onerror = () => done('blocked'); i.src = 'https://example.com/probe.png'; });
  r.frame = await new Promise(done => { const f = document.createElement('iframe'); f.onload = () => { try { done(f.contentDocument ? 'loaded' : 'blocked'); } catch { done('blocked'); } }; setTimeout(() => done('blocked'), 1500); f.src = '/'; document.body.append(f); });
  parent.postMessage({ type: 'height', height: 77777, extra: 1 }, '*');
  parent.postMessage({ type: 'height', height: 'tall' }, '*');
  parent.postMessage({ type: 'branch', label: 'x'.repeat(500), explanation: 'too long' }, '*');
  parent.postMessage({ type: 'navigate', url: '/api/state' }, '*');
  parent.postMessage({ type: 'report', who: 'hostile', data: JSON.stringify(r) }, '*');
  try { top.location.href = '/api/state'; } catch {}
})();
</script>`,
  text.length,
);
const legacy = store.finishArtifact(
  tree.id,
  store.pendingArtifact(tree.id, reply, 'Legacy diagram', 'An old Mermaid diagram.').id,
  'flowchart TD\n A[Old] --> B[Still renders]',
);
const app = createApp({
  store,
  provider: {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: async () => {
      throw new Error('No inference in this check.');
    },
  },
  auth: { status: () => ({ connected: true }) },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;

const run = promisify(execFile);
const session = `visual-sandbox-${process.pid}`;
// Emulate a mouse so the hover-only reveal can be checked (headless Chrome reports hover: none).
const b = async (...args) =>
  (
    await run('agent-browser', ['--session', session, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        AGENT_BROWSER_ARGS:
          '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
      },
    })
  ).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const figure = (id) => `document.querySelector('figure.visual[data-artifact="${id}"]')`;
const report = (who) =>
  ev(
    `(()=>{const r=window.__frameMessages.filter(m=>m?.type==='report'&&m.who==='${who}').at(-1);return r?JSON.parse(r.data):null})()`,
  );
const pass = (name) => console.log('PASS:', name);
try {
  // Headers: the app CSP only gains framing of the sandbox page; the sandbox page has its own locked-down policy.
  const main = (await fetch(origin)).headers.get('content-security-policy');
  assert.equal(
    main,
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src ${origin}/sandbox.html; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  );
  const sandbox = (await fetch(origin + '/sandbox.html')).headers.get('content-security-policy');
  for (const rule of [
    "default-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    `frame-ancestors ${origin}`,
  ])
    assert.ok(sandbox.includes(rule), rule);
  assert.equal((await fetch(origin + '/api/state', { headers: { Origin: 'null' } })).status, 403);
  pass(
    'app CSP only adds sandbox framing; sandbox CSP forbids network and frames; opaque origins cannot reach the API',
  );

  const init = join(dir, 'browser-init.js');
  writeFileSync(
    init,
    "window.__frameMessages=[];addEventListener('message',e=>window.__frameMessages.push(e.data))",
  );
  await b('--init-script', init, 'open');
  await b('set', 'viewport', '1280', '900');
  await b('set', 'media', 'light', 'reduced-motion');
  await b('open', origin);
  await b('eval', "localStorage.setItem('treetutor.appearance', 'system'); true");
  await b('reload');
  await b('wait', '[aria-label="Open Visual fixture"]');
  await wait(`document.querySelector('.overview').textContent.includes('Visual: Bar heights')`);
  assert.equal(await ev(`document.querySelectorAll('iframe').length`), 0);
  assert.equal(
    await ev(`performance.getEntriesByType('resource').some(e=>e.name.includes('sandbox'))`),
    false,
  );
  pass('map preview lists the visual by title and never loads the sandbox');

  await b('focus', '[aria-label="Open Visual fixture"]');
  await b('press', 'Enter');
  await wait(`!!${figure(good.id)}`);
  // Chromium defers off-screen frame work; visit both ready visuals before checking their reports.
  await ev(`${figure(good.id)}.scrollIntoView({ block: 'center' }); true`);
  await wait(`${figure(good.id)}.querySelector('iframe')?.dataset.ready`);
  await ev(`${figure(hostile.id)}.scrollIntoView({ block: 'center' }); true`);
  await wait(
    `document.querySelectorAll('.focused-chat iframe.visual-frame[data-ready]').length===2`,
  ).catch(async (error) => {
    console.error(
      await ev(
        `JSON.stringify({frames:[...document.querySelectorAll('iframe')].map(f=>[f.src,f.dataset.ready,f.style.height]),messages:window.__frameMessages.slice(0,20)})`,
      ),
    );
    console.error(
      await b('console').catch((e) => e.message),
      await b('errors').catch((e) => e.message),
    );
    throw error;
  });
  await wait(
    `document.querySelector('.diagram-card[data-artifact="${legacy.id}"]')?.dataset.state==='ready'`,
  );
  const placement =
    await ev(`(()=>{const f=${figure(good.id)},p=${figure(pending.id)},h=${figure(hostile.id)},md=f.closest('.reply-md'),i=f.querySelector('iframe');
    return {before:f.previousElementSibling?.textContent,after:f.nextElementSibling?.textContent,pendingAfter:p.nextElementSibling?.textContent,hostileLast:md.lastElementChild===h,
      width:Math.round(f.getBoundingClientRect().width),column:Math.round(md.getBoundingClientRect().width),height:i.getBoundingClientRect().height,sandbox:i.getAttribute('sandbox'),label:i.title,
      border:getComputedStyle(i).borderTopWidth,bg:getComputedStyle(i).backgroundColor,cardAfterReply:!!document.querySelector('.diagram-card[data-artifact="${legacy.id}"]').closest('.reply-md')}})()`);
  assert.equal(placement.before, 'Intro paragraph about the bars.');
  assert.equal(placement.after, 'Middle paragraph after the chart.');
  assert.equal(placement.pendingAfter, 'Closing paragraph.');
  assert.ok(placement.hostileLast);
  assert.equal(placement.width, placement.column);
  assert.ok(placement.height > 60 && placement.height < 400, `auto height ${placement.height}`);
  assert.equal(placement.sandbox, 'allow-scripts');
  assert.equal(placement.label, 'Three bars of heights 3, 7 and 5.');
  assert.equal(placement.border, '0px');
  assert.equal(placement.bg, 'rgba(0, 0, 0, 0)');
  assert.equal(placement.cardAfterReply, false);
  pass(
    'visuals render inline at their recorded positions, full column width, borderless, auto-height; legacy Mermaid card stays after the reply',
  );

  const shimmer = await ev(
    `(()=>{const p=${figure(pending.id)},s=p.querySelector('.visual-shimmer');return {frames:p.querySelectorAll('iframe').length,height:s?.getBoundingClientRect().height,status:p.querySelector('[role=status]')?.textContent}})()`,
  );
  assert.equal(shimmer.frames, 0);
  assert.ok(shimmer.height > 30, `shimmer ${shimmer.height}`);
  assert.equal(shimmer.status, 'Creating visual: Coming soon');
  pass('pending visual holds its place with a shimmer and announces itself');

  const appColor = async () => ev(`getComputedStyle(document.querySelector('.reply-md')).color`);
  await wait(`!!window.__frameMessages.some(m=>m?.who==='good')`);
  const light = await report('good');
  assert.equal(light.color, await appColor());
  assert.equal(light.background, 'rgba(0, 0, 0, 0)');
  assert.equal(light.root, 'rgba(0, 0, 0, 0)');
  assert.ok(light.font.includes('Archivo'));
  assert.equal(light.libs, 'object,object,object,object');
  await b('screenshot', join(dir, 'visual-light.png'));
  await b('set', 'media', 'dark', 'reduced-motion');
  await wait(
    `(()=>{const r=window.__frameMessages.filter(m=>m?.who==='good').at(-1);return r && JSON.parse(r.data).color===getComputedStyle(document.querySelector('.reply-md')).color && JSON.parse(r.data).color!==${JSON.stringify(light.color)}})()`,
  );
  const dark = await report('good');
  assert.equal(dark.background, 'rgba(0, 0, 0, 0)');
  await b('screenshot', join(dir, 'visual-dark.png'));
  pass(
    `visual follows theme tokens and fonts in light (${light.color}) and dark (${dark.color}), transparent; mermaid, three, KaTeX and d3 preloaded`,
  );

  await wait(`!!window.__frameMessages.some(m=>m?.who==='hostile')`);
  const escape = await report('hostile');
  assert.deepEqual(escape, {
    fetch: 'blocked',
    remote: 'blocked',
    storage: 'blocked',
    parentStorage: 'blocked',
    parentDom: 'blocked',
    cookie: 'blocked',
    image: 'blocked',
    frame: 'blocked',
  });
  const after = await ev(
    `({url:location.href,height:${figure(hostile.id)}.querySelector('iframe').getBoundingClientRect().height,trees:document.querySelectorAll('[aria-label^="Open "]').length,dialogs:document.querySelectorAll('dialog[open]').length})`,
  );
  assert.equal(after.url, origin + '/');
  assert.ok(after.height < 400, `hostile height ${after.height}`);
  assert.equal(after.dialogs, 0);
  pass(
    `hostile visual cannot fetch, read storage, DOM or cookies, load remote media or frames, navigate the app, or resize/act through malformed messages (${JSON.stringify(escape)})`,
  );

  await b('mouse', 'move', '5', '5');
  await ev(`document.activeElement?.blur(), true`);
  await wait(`getComputedStyle(${figure(good.id)}.querySelector('.visual-actions')).opacity==='0'`);
  const hidden = await ev(
    `getComputedStyle(${figure(good.id)}.querySelector('.visual-actions')).opacity`,
  );
  // Pointer over the visual itself (inside the cross-origin frame) reveals the parent's controls.
  const box = await ev(
    `(${figure(good.id)}.scrollIntoView({block:'center'}),(r=>({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}))(${figure(good.id)}.querySelector('iframe').getBoundingClientRect()))`,
  );
  await b('mouse', 'move', String(box.x - 10), String(box.y - 10));
  await b('mouse', 'move', String(box.x), String(box.y));
  await wait(
    `getComputedStyle(${figure(good.id)}.querySelector('.visual-actions')).opacity==='1'`,
  ).catch(async (error) => {
    console.error(
      await ev(
        `({box:${JSON.stringify(box)},target:document.elementFromPoint(${box.x},${box.y})?.outerHTML.slice(0,300),hover:${figure(good.id)}.matches(':hover'),focus:document.activeElement?.outerHTML.slice(0,200)})`,
      ),
    );
    throw error;
  });
  await b('mouse', 'move', '5', '5');
  await ev(`${figure(good.id)}.querySelector('.visual-enlarge').focus(), true`);
  await wait(`getComputedStyle(${figure(good.id)}.querySelector('.visual-actions')).opacity==='1'`);
  assert.equal(hidden, '0');
  await click('Enlarge visual: Bar heights');
  await wait(`!!document.querySelector('dialog[open] iframe.visual-frame[data-ready]')`);
  await b('press', 'Escape');
  await wait(`!document.querySelector('dialog[open]')`);
  pass('enlarge appears only on hover or focus and opens the visual large; Escape closes it');
  console.log(`Screenshots: ${join(dir, 'visual-light.png')} ${join(dir, 'visual-dark.png')}`);
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
