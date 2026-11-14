// Seeded store, synthetic providers, app server and agent-browser helpers for verify-states.mjs.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Store } from '../../../server/store.mjs';
import { createApp } from '../../../server/app.mjs';

const run = promisify(execFile),
  dir = mkdtempSync(join(tmpdir(), 'tt-states-'));
const session = (
  await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'states'])
).stdout.trim();
const b = async (...args) =>
  (
    await run('agent-browser', ['--session', session, ...args], {
      maxBuffer: 8 << 20,
      env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') },
    })
  ).stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const item = (name) => b('find', 'role', 'menuitem', 'click', '--name', name, '--exact');
const shots = [],
  checks = [];
const pass = (name, evidence) => {
  checks.push({ name, evidence });
  console.log('PASS:', name);
};
const shot = async (name) => {
  await wait(
    `document.fonts.status === 'loaded' && !document.documentElement.matches(':active-view-transition')`,
  );
  const file = `docs/verification/states-${name}.png`;
  await b('screenshot', file);
  shots.push(file);
};
const token = `const token = n => { const p = document.body.appendChild(document.createElement('i')); p.style.color = 'var(' + n + ')'; const v = getComputedStyle(p).color; p.remove(); return v; };`;
// Contrast of visible text against its actual composited background, including translucent failure fills.
const contrasts = async (selector) =>
  ev(`(() => {
 const rgba = v => { const c = document.createElement('canvas').getContext('2d', {willReadFrequently:true}); c.fillStyle=v; c.fillRect(0,0,1,1); return [...c.getImageData(0,0,1,1).data]; };
 const blend=(a,b)=>a.slice(0,3).map((v,i)=>v*a[3]/255+b[i]*(1-a[3]/255));
 const bg=n=>{const chain=[];for(let e=n;e;e=e.parentElement)chain.unshift(e);return chain.reduce((a,e)=>blend(rgba(getComputedStyle(e).backgroundColor),a),[255,255,255]);};
 const L=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
 return [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.checkVisibility()&&!e.closest('[hidden]')).map(e=>{const back=bg(e),a=L(blend(rgba(getComputedStyle(e).color),back)),d=L(back);return {text:e.textContent.trim().slice(0,55),ratio:(Math.max(a,d)+.05)/(Math.min(a,d)+.05)};});
})()`);
const trapped = async (selector) => {
  const inside = `document.querySelector(${JSON.stringify(selector)}).contains(document.activeElement)`;
  await wait(inside);
  for (const key of ['Shift+Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab']) {
    await b('press', key);
    assert.ok(await ev(inside), `${selector}: ${key} keeps focus in the dialog`);
  }
};
const store = new Store(join(dir, 'data.sqlite'));
// Toggled by the journey; an object because imported bindings are read-only.
const flags = { noModels: false, holdFirst: false };
let calls = 0,
  releaseFirst;
const provider = {
  models: async () =>
    flags.noModels
      ? []
      : [
          { model: 'fixture', label: 'Fixture model', isDefault: true, efforts: ['low', 'high'] },
          { model: 'second', label: 'Second model', efforts: ['low', 'high'] },
        ],
  generate: async (_tree, _input, emit) => {
    calls++;
    emit({ type: 'item', item: 'a', text: 'A saved fixture answer.' });
    if (flags.holdFirst)
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
    emit({ type: 'status', status: 'completed' });
  },
};
const app = createApp({
  store,
  dir,
  defaultProvider: 'claude',
  providers: { claude: provider },
  auth: { status: () => ({ connected: false }) },
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const open = async (mode, title) => {
  await ev(`localStorage.setItem('treetutor.appearance', '${mode}')`);
  await b('reload');
  await wait(
    `document.querySelector('.focused-chat h2') || document.querySelector('.react-flow__node')`,
  );
  if (
    await ev(`document.querySelector('.focused-chat h2')?.textContent !== ${JSON.stringify(title)}`)
  ) {
    if (
      await ev(
        `document.querySelector('.focused-chat')?.checkVisibility() && !!document.querySelector('.focused-chat h2')`,
      )
    )
      await click('Return to tree');
    await click(`Open ${title}`);
  }
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(title)} && document.querySelector('.model-picker:not([disabled])')`,
  );
};

export {
  run,
  dir,
  b,
  ev,
  wait,
  click,
  shots,
  checks,
  pass,
  shot,
  token,
  contrasts,
  trapped,
  store,
  flags,
  calls,
  releaseFirst,
  provider,
  app,
  origin,
  open,
};
