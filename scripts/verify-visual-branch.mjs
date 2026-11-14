// Focused built-UI check with isolated SQLite and a synthetic provider; no paid inference.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile),
  session = (
    await run('agent-browser', [
      'session',
      'id',
      '--scope',
      'worktree',
      '--prefix',
      'visual-branch',
    ])
  ).stdout.trim();
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 }))
    .stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-visual-branch-ui-')), 'trees.sqlite'));
const tree = store.create('Tournament rounds', 'codex', 'fixture');
store.message(tree.id, 'user', 'Explain tournament rounds.', 'completed');
const reply = store.message(
  tree.id,
  'assistant',
  'Winners advance in rounds.\n\nThe final decides the winner.',
  'completed',
);
const source = `<style>svg{display:block;width:100%}p{margin-block:var(--spacing-3)}button{font:inherit;color:var(--color-text-primary);background:transparent;border:thin solid var(--color-border);border-radius:var(--radius-element);padding:var(--spacing-2)}</style>
<svg viewBox="0 0 400 95" aria-label="Two semifinals feed the final"><g id="semifinal" data-visual-label="Semifinal" data-visual-explanation="Each semifinal sends one winner to the final."><rect x="8" y="8" width="170" height="65" rx="4" fill="var(--color-background-muted)"/><text x="20" y="45" fill="var(--color-text-primary)">Semifinal</text></g><path d="M195 40H380" stroke="var(--color-text-blue)" stroke-width="3"/></svg>
<p id="final" data-visual-label="Final" data-visual-explanation="The two semifinal winners meet here.">Final: one match decides the winner.</p>
<button id="dedicated" data-visual-label="Winner" data-visual-explanation="The final winner is the tournament winner.">Tournament winner</button>
<button id="step">Next round</button><p id="status" role="status">Round one</p>
<p id="invalid" data-visual-label="${'x'.repeat(121)}" data-visual-explanation="Invalid label">Invalid tag</p>
<script>document.getElementById('step').onclick=()=>document.getElementById('status').textContent='Round two';setTimeout(()=>{const p=document.createElement('p');p.id='dynamic';p.textContent='A late-added part';p.dataset.visualLabel='Late part';p.dataset.visualExplanation='A part added by the visual script.';document.getElementById('visual').append(p);},1000);</script>`;
const artifact = store.pendingArtifact(
  tree.id,
  reply,
  'Tournament structure',
  'Two semifinals lead to a final.',
  'visual',
  null,
  26,
);
store.finishArtifact(tree.id, artifact.id, source);
const calls = [];
// Opening the branch form starts compaction (no tree id); only tutor turns count as inference here.
const tutor = () => calls.filter((c) => c.tree.id).length;
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => {
      calls.push({ tree, text });
      emit({
        type: 'item',
        item: 'answer',
        text: tree.instructions
          ? 'The learner is studying tournament rounds.'
          : 'One winner advances from each semifinal.',
      });
      emit({ type: 'status', status: 'completed' });
    },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const report = {
  fixture: 'built UI, synthetic provider, isolated SQLite, agent-browser-owned Chromium',
  steps: [],
  captures: [],
};
const pass = (text) => {
  report.steps.push(text);
  console.log('PASS:', text);
};
const figure = `document.querySelector('.focused-chat figure[data-artifact="${artifact.id}"]')`;
const form = `document.querySelector('.branch-form')`;
const openParent = async () => {
  await b('wait', '[aria-label="Open Tournament rounds"]');
  await click('Open Tournament rounds');
  await wait(figure);
  await ev(`${figure}.scrollIntoView({block:'center'})`);
  await wait(`${figure}?.querySelector('iframe[data-ready]')`);
};
// Same browser/session as agent-browser; only inspect/focus its known opaque iframe when the CLI cannot address an OOPIF.
async function frameEval(expression, enlarged = false) {
  const socket = new WebSocket((await b('get', 'cdp-url')).trim());
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const result = JSON.parse(event.data),
      p = pending.get(result.id);
    if (p) {
      pending.delete(result.id);
      result.error ? p.reject(new Error(result.error.message)) : p.resolve(result.result);
    }
  };
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  const timer = setTimeout(() => {
    for (const p of pending.values()) p.reject(new Error('Frame inspection timed out.'));
    socket.close();
  }, 10000);
  try {
    const { targetInfos } = await call('Target.getTargets');
    const targets = targetInfos.filter(
      (t) => t.type === 'iframe' && t.url === origin + '/sandbox.html',
    );
    const target = enlarged ? targets.at(-1) : targets[0];
    assert.ok(target, 'known sandbox frame exists');
    const { sessionId } = await call('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    const { result, exceptionDetails } = await call(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    assert.ok(!exceptionDetails, JSON.stringify(exceptionDetails));
    return result.value;
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}
async function keyPart(id, key = 'Enter', enlarged = false) {
  await frameEval(`document.getElementById('${id}').focus(); true`, enlarged);
  await b('press', key);
}
const frameWait = (expression) =>
  frameEval(
    `new Promise((resolve,reject)=>{const start=Date.now(),timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true);}else if(Date.now()-start>5000){clearInterval(timer);reject(Error('Frame state timed out'));}},20);})`,
  );
async function pointerPart(id) {
  await ev(`${figure}.scrollIntoView({block:'center'});true`);
  const f = await ev(
    `(()=>{const r=${figure}.querySelector('iframe').getBoundingClientRect();return {x:r.x,y:r.y}})()`,
  );
  const p = await frameEval(
    `(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await b('mouse', 'move', String(Math.round(f.x + p.x)), String(Math.round(f.y + p.y)));
  await b('mouse', 'down', 'left');
  await b('mouse', 'up', 'left');
}
try {
  await b('set', 'viewport', '1280', '900');
  await b('set', 'media', 'light', 'reduced-motion');
  await b('open', origin);
  await openParent();
  await frameWait(`!!document.getElementById('dynamic')`);
  const tags = await frameEval(
    `['semifinal','final','dedicated','dynamic','invalid'].map(id=>{const e=document.getElementById(id);return {id,tab:e.tabIndex,role:e.getAttribute('role'),label:e.getAttribute('aria-label')}})`,
  );
  assert.deepEqual(
    tags.map((t) => t.tab),
    [0, 0, 0, 0, -1],
  );
  assert.equal(tags[0].role, 'button');
  assert.equal(tags[0].label, 'Ask about: Semifinal');
  await frameEval(`document.getElementById('semifinal').focus();true`);
  await b('press', 'Tab');
  assert.equal(
    await frameEval('document.activeElement.id'),
    'final',
    'SVG and HTML parts are in the normal tab order',
  );
  await b('press', 'Shift+Tab');
  await b('press', 'Enter');
  await wait(form);
  assert.equal(await ev(`document.activeElement.matches('.branch-form input')`), true);
  assert.equal(
    await ev(`document.getElementById('branch-passage').textContent`),
    'Visual: Tournament structure\nTwo semifinals lead to a final.\nPart: Semifinal\nEach semifinal sends one winner to the final.',
  );
  assert.equal(tutor(), 0, 'activation opens the prompt without a tutor call');
  await b('press', 'Escape');
  await wait(`!${form}`);
  assert.equal(await ev(`document.activeElement.tagName`), 'IFRAME');
  pass(
    'valid SVG/HTML/dynamic parts are labelled, tabbable and Enter-activatable; invalid tags ignored; Escape restores frame focus',
  );

  await keyPart('dedicated', 'Space');
  await wait(form);
  assert.ok(
    (await ev(`document.getElementById('branch-passage').textContent`)).includes('Part: Winner'),
  );
  await b('press', 'Escape');
  await wait(`!${form} && document.activeElement === ${figure}.querySelector('iframe')`);
  await keyPart('step');
  await frameWait(`document.getElementById('status').textContent === 'Round two'`);
  assert.equal(await frameEval(`document.getElementById('status').textContent`), 'Round two');
  assert.equal(await ev(`!!${form}`), false);
  pass(
    'native branch buttons activate once with Space; ordinary visual controls retain their own keyboard action',
  );

  // A valid-looking request from the app window is still an unknown frame; malformed requests from the known frame are ignored.
  const before = calls.length;
  await ev(
    `window.postMessage({type:'branch',label:'Forged',explanation:'Unknown frame'},'*');true`,
  );
  await frameEval(
    `[{type:'branch',label:'',explanation:'Empty label'},{type:'branch',label:'x'.repeat(121),explanation:'Long label'},{type:'branch',label:'Valid',explanation:'x'.repeat(281)},{type:'branch',label:'Valid',explanation:'Extra fields',action:'send'},{type:'navigate',url:'/api/state'}].forEach(m=>parent.postMessage(m,'*'));true`,
  );
  await b('snapshot', '-i');
  assert.equal(await ev(`!!${form}`), false);
  assert.equal(calls.length, before);
  pass('unknown-frame and malformed branch messages cause no popup, API call or navigation');

  await pointerPart('final');
  await wait(form);
  assert.ok(
    (await ev(`document.getElementById('branch-passage').textContent`)).includes('Part: Final'),
  );
  await b('press', 'Escape');
  await click('Enlarge visual: Tournament structure');
  await wait(`document.querySelectorAll('iframe.visual-frame[data-ready]').length===2`);
  await keyPart('final', 'Enter', true);
  await wait(form);
  assert.equal(
    await ev(`document.querySelectorAll('[role=dialog]').length`),
    0,
    'enlarged visual closes before opening the question',
  );
  assert.equal(await ev(`document.activeElement.matches('.branch-form input')`), true);
  await b('press', 'Escape');
  pass(
    'pointer activation and enlarged-frame keyboard activation open the same compact passage popup',
  );

  await keyPart('semifinal');
  await wait(form);
  await b('find', 'label', 'Question about this passage', 'fill', 'Why only one winner?');
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.focused-chat')?.textContent.includes('One winner advances from each semifinal.')`,
  );
  assert.equal(tutor(), 1, 'one child tutor turn');
  const child = store.list().find((t) => t.parent === tree.id);
  assert.ok(child);
  assert.equal(child.start, null);
  assert.equal(child.end, null);
  assert.equal(child.artifactId, artifact.id);
  assert.equal(await ev(`document.activeElement.getAttribute('aria-label')`), 'Your question');
  await click('Return to tree');
  await wait(`document.querySelector('.react-flow__edge')`);
  assert.equal(
    await ev(
      `document.querySelector('[data-source="${child.id}"]').closest('[data-message]').dataset.message`,
    ),
    reply,
  );
  await click('Reveal source passage for Why only one winner?');
  await wait(`${figure}?.querySelector('iframe[data-ready]')`);
  assert.equal(await frameEval(`document.querySelector('[data-visual-reveal]')?.id`), 'semifinal');
  assert.equal(await frameEval(`document.activeElement.id`), 'semifinal');
  assert.equal(
    await frameEval(`document.getElementById('semifinal').getAttribute('aria-label')`),
    'Open explored branch: Semifinal',
  );
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.focused-chat')?.textContent.includes('One winner advances from each semifinal.')`,
  );
  assert.equal(tutor(), 1, 'explored activation reopens the existing child');
  pass(
    'branch creation focuses the child, maps beside its source reply, reveals/focuses the part, and explored activation reopens without inference',
  );

  store.branch(
    store.tree(tree.id),
    {
      messageId: reply,
      artifactId: artifact.id,
      label: 'Late part',
      explanation: 'A part added by the visual script.',
      text: 'Visual: Tournament structure\nTwo semifinals lead to a final.\nPart: Late part\nA part added by the visual script.',
      question: 'What about late parts?',
    },
    'Existing context for a delayed part.',
  );
  await b('reload');
  await b('wait', '[aria-label="Open Tournament rounds"]');
  await click('Reveal source passage for What about late parts?');
  await wait(`${figure}?.querySelector('iframe[data-ready]')`);
  await frameWait(
    `document.querySelector('[data-visual-reveal]')?.id==='dynamic' && document.activeElement.id==='dynamic'`,
  );
  pass('map source reveal waits for a part added asynchronously, then focuses it once');
  await openParent();
  assert.equal(
    await frameEval(`document.getElementById('semifinal').hasAttribute('data-visual-explored')`),
    true,
  );
  assert.equal(tutor(), 1);
  const shots = join(process.cwd(), '.impeccable/review');
  mkdirSync(shots, { recursive: true });
  for (const [size, width] of [
    ['desktop', 1280],
    ['narrow', 390],
  ])
    for (const mode of ['light', 'dark']) {
      await b('set', 'viewport', String(width), '900');
      await ev(`localStorage.setItem('treetutor.appearance','${mode}');true`);
      await b('reload');
      await b('wait', '[aria-label="Open Tournament rounds"]');
      await openParent();
      await keyPart('final');
      await wait(form);
      const bounds = await ev(
        `(()=>{const r=${form}.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth}})()`,
      );
      assert.ok(
        bounds.left >= 0 &&
          bounds.right <= width + 1 &&
          bounds.top >= 0 &&
          bounds.bottom <= 900 &&
          !bounds.overflow,
        JSON.stringify(bounds),
      );
      assert.equal(
        await frameEval(
          `document.getElementById('semifinal').hasAttribute('data-visual-explored')`,
        ),
        true,
      );
      const file = `${shots}/visual-branch-${size}-${mode}.png`;
      await b('screenshot', file);
      assert.ok(existsSync(file), 'browser capture exists');
      report.captures.push(file);
      await b('press', 'Escape');
    }
  assert.equal(tutor(), 1);
  pass(
    'reload preserves explored state without inference; popup and visual fit desktop/narrow in light/dark with no overflow',
  );
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.error = error.message;
  throw error;
} finally {
  writeFileSync('docs/verification/visual-branch.json', JSON.stringify(report, null, 2) + '\n');
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
