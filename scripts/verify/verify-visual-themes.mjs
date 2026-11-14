// TreeTutor-got.17: built UI, synthetic providers, an encoded fixture MP4; no live inference.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile, execFileSync } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { mediaPath } from '../../server/media/videos.mjs';
import { themeChoices } from '../../src/shell/appearance.ts';

const dir = mkdtempSync(join(tmpdir(), 'tt-visual-themes-'));
const store = new Store(join(dir, 'trees.sqlite'));
const tree = store.create('Visual themes');
store.message(tree.id, 'user', 'Show the bars.', 'completed');
const text = 'The bars show illustrative values. Use the step control to advance.';
const reply = store.message(tree.id, 'assistant', text, 'completed');
const visual = store.pendingArtifact(
  tree.id,
  reply,
  'Bar heights',
  'Three bars with a step control.',
  'visual',
  null,
  text.length,
);
store.finishArtifact(
  tree.id,
  visual.id,
  `<div id="chart"></div><script>
const svg = d3.select('#chart').append('svg').attr('viewBox', '0 0 400 120').attr('width', '100%').attr('role', 'img').attr('aria-label', 'Bars');
svg.selectAll('rect').data([3, 7, 5]).join('rect').attr('x', (d, i) => i * 140).attr('y', d => 120 - d * 15).attr('width', 110).attr('height', d => d * 15).attr('fill', 'var(--color-text-blue)');
const counter = document.createElement('button'); counter.textContent = 'Step 0'; counter.onclick = () => counter.textContent = 'Step 1'; document.querySelector('#chart').append(counter);
const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 12; canvas.setAttribute('aria-label', 'Current series ink'); document.querySelector('#chart').append(canvas);
const context = canvas.getContext('2d');
function draw() { context.fillStyle = getComputedStyle(svg.select('rect').node()).fill; context.fillRect(0, 0, 24, 12); }
draw(); addEventListener('treetutor-theme', draw);
const instance = Math.random();
let last = '';
setInterval(() => {
  const c = counter.getBoundingClientRect(), report = JSON.stringify({ color: getComputedStyle(document.body).color, series: getComputedStyle(svg.select('rect').node()).fill, canvas: Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3), step: counter.textContent, control: {x:c.x+c.width/2,y:c.y+c.height/2}, instance });
  if (report !== last) { last = report; parent.postMessage({ type: 'fixture-report', report }, '*'); }
}, 100);
</script>`,
);
const video = store.pendingArtifact(
  tree.id,
  reply,
  'Frozen colours',
  'A moss-coloured frame.',
  'video',
  '{}',
  text.length,
);
mkdirSync(join(dir, 'videos'));
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-i',
  'color=c=0x33432a:s=32x32:d=0.2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  mediaPath(dir, video.id),
]);
const baked = readFileSync(mediaPath(dir, video.id));
store.finishVideo(tree.id, video.id, video.attempt, {
  description: video.description,
  duration: 0.2,
});
const savedVisual = store.artifact(tree.id, visual.id),
  savedVideo = store.artifact(tree.id, video.id);
let calls = 0;
const app = createApp({
  store,
  dir,
  provider: {
    models: async () => [{ model: 'fixture', isDefault: true }],
    generate: async () => {
      calls++;
      throw new Error('Theme switching must not generate.');
    },
  },
  auth: { status: () => ({ connected: true }) },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const run = promisify(execFile),
  session = `visual-themes-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 }))
    .stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const pick = (name) => b('find', 'role', 'radio', 'click', '--name', name, '--exact');
const frame = `document.querySelector('figure.visual[data-artifact="${visual.id}"] iframe')`;
const matrix = [];
try {
  const init = join(dir, 'browser-init.js');
  writeFileSync(
    init,
    `addEventListener('message',e=>{if(e.data?.type==='fixture-report' && e.source===${frame}?.contentWindow)window.__visualReport=JSON.parse(e.data.report)})`,
  );
  await b('--init-script', init, 'open');
  await b('set', 'viewport', '1280', '900');
  await b('set', 'media', 'light', 'reduced-motion');
  await b('open', origin);
  await ev(`localStorage.clear(); localStorage.setItem('treetutor.appearance','system'); true`);
  await b('reload');
  await b('wait', '[aria-label="Open Visual themes"]');
  await click('Open Visual themes');
  await wait(frame);
  await ev(`${frame}.scrollIntoView({block:'center'}); true`);
  await wait(`${frame}?.dataset.ready && window.__visualReport`);
  const initial = await ev('window.__visualReport');
  const box = await ev(`(r=>({x:r.x,y:r.y}))(${frame}.getBoundingClientRect())`);
  await b(
    'mouse',
    'move',
    String(Math.round(box.x + initial.control.x)),
    String(Math.round(box.y + initial.control.y)),
  );
  await b('mouse', 'down');
  await b('mouse', 'up');
  await wait(`window.__visualReport.step==='Step 1'`);
  await ev(`window.__visualWindow=${frame}.contentWindow; true`);
  await b('screenshot', join(dir, 'paperback-light.png'));
  // System appearance and named themes each update the existing frame.
  await b('set', 'media', 'dark', 'reduced-motion');
  await wait(
    `window.__visualReport.color===getComputedStyle(document.querySelector('.reply-md')).color && window.__visualReport.color!==${JSON.stringify(initial.color)}`,
  );
  await click('Settings');
  await wait(`document.activeElement?.id==='settings-heading'`);
  for (const mode of ['light', 'dark']) {
    await pick(mode === 'light' ? 'Light' : 'Dark');
    for (const { id, label } of themeChoices) {
      await pick(label);
      const expected = await ev(
        `(() => { const p=document.createElement('i'); p.style.color='var(--color-text-blue)'; document.querySelector('#root').append(p); const series=getComputedStyle(p).color; p.remove(); return {color:getComputedStyle(document.querySelector('.reply-md')).color,series}; })()`,
      );
      await wait(
        `window.__visualReport.color===${JSON.stringify(expected.color)} && window.__visualReport.series===${JSON.stringify(expected.series)} && 'rgb('+window.__visualReport.canvas.join(', ')+')'===window.__visualReport.series`,
      );
      const current = await ev('window.__visualReport');
      assert.equal(current.instance, initial.instance, `${id} ${mode}: script never reruns`);
      assert.equal(current.step, 'Step 1', `${id} ${mode}: control state kept`);
      assert.equal(await ev(`window.__visualWindow===${frame}.contentWindow`), true);
      assert.deepEqual(store.artifact(tree.id, visual.id), savedVisual);
      assert.deepEqual(store.artifact(tree.id, video.id), savedVideo);
      const media = await fetch(`${origin}/api/videos/${video.id}/media`);
      assert.equal(media.status, 200);
      assert.deepEqual(
        Buffer.from(await media.arrayBuffer()),
        baked,
        'rendered MP4 keeps original colours',
      );
      matrix.push({
        theme: id,
        mode,
        color: current.color,
        series: current.series,
        canvas: current.canvas,
      });
      console.log(
        `PASS: ${id} ${mode}: SVG/canvas recolour; frame, controls, source and video bytes kept`,
      );
    }
  }
  assert.equal(calls, 0, 'switching themes starts no provider calls');
  await click('Return to learning tree');
  await ev(`${frame}.scrollIntoView({block:'center'}); true`);
  await b('screenshot', join(dir, 'graphite-dark.png'));
  await b('set', 'viewport', '390', '844');
  assert.equal(
    await ev('document.documentElement.scrollWidth<=innerWidth'),
    true,
    'narrow visual fits',
  );
  await b('screenshot', join(dir, 'graphite-narrow.png'));
  writeFileSync(
    join(dir, 'results.json'),
    JSON.stringify(
      {
        evidence: 'Built UI, synthetic providers, encoded fixture video; no live inference.',
        matrix,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: System appearance follows OS; no inference; narrow layout fits. Evidence: ${dir}`,
  );
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
