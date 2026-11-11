import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const filename = fileURLToPath(import.meta.url);
if (process.argv[2] === '--serve') {
  const dir = process.argv[3], store = new Store(join(dir, 'trees.sqlite'));
  let release;
  const provider = {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => {
      const worker = tree.instructions?.includes('one Mermaid diagram');
      appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ kind: worker ? 'worker' : tree.id ? 'tutor' : 'compaction' }) + '\n');
      if (worker) await new Promise(resolve => { release = resolve; });
      const task = { title: 'Streaming rounds', description: 'A winner advances from the round to the final.', intent: 'Show two rounds.', excerpt: 'Winners advance.' };
      const output = worker ? 'flowchart LR\n A[Round] --> B[Final]' : text === 'Diagram please' ? 'Winners advance.\n```treetutor-diagram\n' + JSON.stringify(task) + '\n```' : 'Fixture follow-up.';
      emit({ type: 'item', item: 'answer', text: output });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  process.on('message', message => {
    if (message === 'release') release?.();
    if (message === 'stop') { app.stop(); store.close(); process.exit(0); }
  });
  await new Promise(resolve => app.server.listen(Number(process.argv[4]), '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}`, pid: process.pid });
} else {
  const dir = mkdtempSync(join(tmpdir(), 'tt-diagram-browser-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const states = store.create('Diagram states'), other = store.create('Other conversation'), root = store.create('Diagram fixture');
  const text = 'repeat 😀 repeat 😀 end';
  store.message(root.id, 'user', 'Seeded rounds question', 'completed');
  const message = store.message(root.id, 'assistant', text, 'completed');
  store.message(root.id, 'assistant', 'A second reply below the diagrams.', 'completed');
  const add = (tree, msg, title, source, error) => {
    const artifact = store.pendingArtifact(tree, msg, title, `${title}: winners advance from one round to the next.`);
    return source || error ? store.finishArtifact(tree, artifact.id, source, error) : artifact;
  };
  const tall = add(root.id, message, 'Tournament rounds', 'flowchart TD\n' + Array.from({ length: 12 }, (_, i) => ` N${i}[Round ${i + 1}] --> N${i + 1}[Round ${i + 2}]`).join('\n'));
  const wide = add(root.id, message, 'Rounds across the page', 'flowchart LR\n' + Array.from({ length: 8 }, (_, i) => ` N${i}[Round ${i + 1}] --> N${i + 1}[Round ${i + 2}]`).join('\n'));
  const stateMessage = store.message(states.id, 'assistant', 'Saved artifact states.', 'completed');
  add(states.id, stateMessage, 'Pending example');
  add(states.id, stateMessage, 'Failed example', null, 'Diagram provider failed to generate a result.');
  add(states.id, stateMessage, 'Render error', 'not valid Mermaid');
  // Deliberately bypass generation validation to exercise the browser's persisted-source boundary.
  for (const [title, source] of [
    ['HTML example', 'flowchart TD\n A["<img src=https://example.test/probe onerror=window.__diagramAttacked++>"]'],
    ['Script example', 'flowchart TD\n A["<script>window.__diagramAttacked++</script>"]'],
    ['Link example', 'flowchart TD\n A[Open]\n click A href "https://example.test/probe"'],
    ['Config example', '%%{init: {"securityLevel":"loose","htmlLabels":true}}%%\nflowchart TD\n A --> B'],
  ]) add(states.id, stateMessage, title, source);
  const families = [
    ['Sequence', 'sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Hi'],
    ['Class', 'classDiagram\n Animal <|-- Duck\n Animal : +int age'],
    ['State', 'stateDiagram-v2\n [*] --> Learning\n Learning --> [*]'],
    ['Entity', 'erDiagram\n TEACHER ||--o{ LESSON : teaches'],
    ['Pie', 'pie\n "First round" : 4\n "Final" : 2'],
  ];
  const familyIds = families.map(([title, source]) => add(states.id, stateMessage, title, source).id);
  store.message(other.id, 'assistant', 'No diagram in this conversation.', 'completed');
  store.close();

  const run = promisify(execFile);
  const session = (await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'diagram-render'])).stdout.trim();
  const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
  const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
  const wait = expression => b('wait', '--fn', expression);
  const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
  async function openRoot(title) {
    if (!(await ev(`document.querySelector('[aria-label="Collapse learning trees"]')?.checkVisibility()`))) {
      await click('Map menu');
      await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
    }
    await click(title);
    await b('wait', `[aria-label="Open ${title}"]`);
    await click(`Open ${title}`);
    await wait(`document.querySelector('.focused-chat h2')?.textContent===${JSON.stringify(title)} && getComputedStyle(document.querySelector('.focused-chat')).display!=='none'`);
  }
  const calls = () => { try { return readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
  const card = id => `.diagram-card[data-artifact="${id}"]`;
  const ready = id => wait(`(()=>{const c=document.querySelector(${JSON.stringify(card(id))}),i=c?.querySelector('img');return c?.dataset.state==='ready' && i?.complete && i.naturalWidth>0})()`);
  const checks = [], processes = [];
  const pass = (name, details = true) => { checks.push({ name, pass: true, details }); console.log('PASS:', name); };
  let child, origin, port, stderr = '';
  async function start() {
    child = fork(filename, ['--serve', dir, String(port ?? 0)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    child.stderr.on('data', data => { stderr += data; });
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Fixture server startup timed out.')), 10000);
      child.once('message', message => { clearTimeout(timeout); resolve(message); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Fixture server exited ${code}: ${stderr}`)); });
    });
    origin = result.origin; port = new URL(origin).port; processes.push(result.pid);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Fixture server stop timed out.')); }, 10000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      child.send('stop');
    });
  }
  try {
    await start();
    const init = join(dir, 'browser-init.js');
    writeFileSync(init, "window.__diagramAttacked=0;window.__diagramViolations=[];addEventListener('securitypolicyviolation',e=>window.__diagramViolations.push(e.violatedDirective))");
    await b('--init-script', init, 'open');
    await b('set', 'viewport', '1280', '900');
    await b('set', 'media', 'light', 'reduced-motion');
    await b('open', origin);
    // Diagrams follow the app's Appearance; System lets the emulated OS scheme drive light/dark below.
    await b('eval', "localStorage.setItem('treetutor.appearance', 'system'); true");
    await b('reload');
    await b('wait', '[aria-label="Open Diagram fixture"]');
    await wait(`document.querySelectorAll('.node-message').length >= 2`);
    assert.equal(await ev(`document.querySelectorAll('.diagram-card').length`), 0);
    assert.equal(await ev(`performance.getEntriesByType('resource').some(e=>e.name.includes('/mermaid-'))`), false);
    assert.ok(await ev(`document.querySelector('.overview').textContent.includes('Diagram: Tournament rounds')`));
    assert.equal(calls(), 0);
    pass('map shows compact owned metadata; renderer remains unloaded');

    await click('Open Diagram fixture');
    await ready(tall.id); await ready(wide.id);
    await ev(`document.fonts.ready.then(()=>true)`);
    assert.equal(await ev(`document.querySelectorAll('.focused-chat .diagram-card').length`), 2);
    assert.equal(await ev(`document.querySelector('.passage section').textContent`), text);
    assert.equal(await ev(`document.querySelector(${JSON.stringify(card(tall.id))}).closest('.astryx-chat-message').querySelector('.passage section').textContent`), text);
    assert.equal(await ev(`document.querySelector(${JSON.stringify(card(tall.id) + ' img')}).alt`), tall.description);
    const svg = await ev(`decodeURIComponent(document.querySelector(${JSON.stringify(card(tall.id) + ' img')}).src.split(',').slice(1).join(','))`);
    assert.ok(svg.includes('Round'), 'SVG contains rendered round labels');
    assert.doesNotMatch(svg, /<foreignObject|<script|<a\s|<image/);
    pass('real Mermaid drawings appear only under the originating reply with text alternatives');

    await ev(`document.querySelector(${JSON.stringify(card(tall.id))}).focus()`);
    await b('press', 'Shift+Tab'); await b('press', 'Tab');
    assert.equal(await ev(`document.activeElement?.dataset.artifact`), tall.id);
    assert.equal(await ev(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');
    await b('press', 'Tab');
    assert.ok(await ev(`document.activeElement?.classList.contains('diagram-open')`));
    for (const key of ['Enter', 'Space']) {
      await b('press', key);
      await wait(`!!document.querySelector('dialog[open] [aria-pressed]')`);
      await b('press', 'Escape');
      await wait(`!document.querySelector('dialog[open]') && document.activeElement?.classList.contains('diagram-open')`);
    }
    await ev(`document.querySelector(${JSON.stringify(card(wide.id) + ' .diagram-open')}).click()`);
    await wait(`!!document.querySelector('dialog[open] [aria-pressed="false"]')`);
    await ev(`document.querySelector('dialog[open] [aria-pressed]').focus()`);
    await b('press', 'Enter');
    await wait(`!!document.querySelector('dialog[open] [aria-pressed="true"]')`);
    await b('press', 'ArrowRight');
    assert.ok(await ev(`[...document.querySelectorAll('.focused-chat .diagram-open img')].every(i=>i.width<=i.naturalWidth+0.5)`), 'desktop: small drawings stay at natural size');
    mkdirSync('.impeccable/review', { recursive: true });
    await b('screenshot', resolve('.impeccable/review/diagram-enlarged.png'));
    await b('press', 'Escape');
    if (await ev(`!!document.querySelector('dialog[open]')`)) await b('press', 'Escape');
    await wait(`!document.querySelector('dialog[open]')`);
    await ev(`document.querySelector(${JSON.stringify(card(tall.id) + ' .diagram-open')}).focus()`);
    await b('press', 'Tab');
    assert.equal(await ev(`document.activeElement.textContent.trim()`), 'Mermaid source');
    await b('press', 'Enter');
    assert.equal(await ev(`document.activeElement.getAttribute('aria-expanded')`), 'true');
    await b('press', 'Space');
    assert.equal(await ev(`document.activeElement.getAttribute('aria-expanded')`), 'false');
    pass('keyboard reaches card, visible focus, enlarge by Enter/Space/click with zoom and pan, Esc returns focus, source disclosure');

    mkdirSync('.impeccable/review', { recursive: true });
    await ev(`document.querySelector(${JSON.stringify(card(tall.id))}).scrollIntoView({block:'start'})`);
    await b('screenshot', resolve('.impeccable/review/diagram-desktop.png'));
    const light = await ev(`({background:getComputedStyle(document.querySelector('.diagram-card')).backgroundColor,text:getComputedStyle(document.querySelector('.diagram-card')).color,url:document.querySelector('.diagram-card img').src})`);
    await b('set', 'media', 'dark', 'reduced-motion');
    await wait(`document.querySelector('.diagram-card img')?.src !== ${JSON.stringify(light.url)}`);
    await ready(tall.id);
    const dark = await ev(`({background:getComputedStyle(document.querySelector('.diagram-card')).backgroundColor,text:getComputedStyle(document.querySelector('.diagram-card')).color})`);
    assert.notEqual(dark.background, light.background); assert.notEqual(dark.text, light.text);
    await b('screenshot', resolve('.impeccable/review/diagram-dark.png'));
    await b('set', 'viewport', '390', '844');
    await ready(wide.id);
    assert.ok(await ev(`document.documentElement.scrollWidth<=innerWidth`));
    // Fit: no card scrolls sideways and no drawing renders wider than its natural size.
    assert.ok(await ev(`[...document.querySelectorAll('.focused-chat .diagram-card')].every(c=>c.scrollWidth<=c.clientWidth+1)`));
    assert.ok(await ev(`[...document.querySelectorAll('.focused-chat .diagram-open img')].every(i=>i.width<=i.naturalWidth+0.5)`));
    const [w, h, nw, nh] = await ev(`(i=>[i.width,i.height,i.naturalWidth,i.naturalHeight])(document.querySelector(${JSON.stringify(card(wide.id) + ' img')}))`);
    assert.ok(w < nw && Math.abs(w * nh / nw - h) <= 1, `wide drawing scales down keeping aspect ratio: ${[w, h, nw, nh]}`);
    await ev(`document.querySelector(${JSON.stringify(card(wide.id))}).scrollIntoView({block:'center'})`);
    await b('screenshot', resolve('.impeccable/review/diagram-narrow.png'));
    pass('light/dark tokens rerender drawings; narrow layouts contain wide drawings', { light: { background: light.background, text: light.text }, dark });
    await b('set', 'viewport', '1280', '900'); await b('set', 'media', 'light', 'reduced-motion');
    await ready(tall.id); await ready(wide.id);

    await ev(`document.querySelector('.passage section').scrollIntoView({block:'center'})`);
    // Diagrams settling can re-scroll the chat log under the pointer; re-measure and retry the drag.
    for (let attempt = 0; attempt < 3; attempt++) {
      const points = await ev(`(()=>{document.querySelector('.passage section').scrollIntoView({block:'center'});const n=document.createTreeWalker(document.querySelector('.passage section .reply-md'),NodeFilter.SHOW_TEXT).nextNode(),a=document.createRange(),z=document.createRange();a.setStart(n,10);a.setEnd(n,11);z.setStart(n,17);z.setEnd(n,19);const first=a.getBoundingClientRect(),last=z.getBoundingClientRect();return [first.left+1,first.top+first.height/2,last.right-1,last.top+last.height/2]})()`);
      await b('mouse', 'move', String(Math.round(points[0])), String(Math.round(points[1])));
      await b('mouse', 'down', 'left');
      await b('mouse', 'move', String(Math.round(points[2])), String(Math.round(points[3])), '--steps', '12');
      await b('mouse', 'up', 'left');
      if (await ev(`getSelection().toString()`) === 'repeat 😀') break;
    }
    assert.equal(await ev(`getSelection().toString()`), 'repeat 😀', 'mouse drag must select the visible reply');
    // Mouse selection opens the anchored passage prompt directly; keyboard selection retains its Ask button.
    await b('wait', '.branch-form input');
    await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Why repeated?');
    await click('Create focused chat');
    await wait(`document.querySelector('.focused-chat h2')?.textContent==='Why repeated?'`);
    await wait(`document.querySelector('.focused-chat').textContent.includes('Fixture follow-up.')`);
    assert.equal(await ev(`document.querySelectorAll('.focused-chat .diagram-card').length`), 0);
    let db = new Store(join(dir, 'trees.sqlite'));
    const branch = db.tree(db.list().find(t => t.parent === root.id).id).branch;
    db.close();
    assert.deepEqual([branch.messageId, branch.start, branch.end, branch.text], [message, 10, 19, 'repeat 😀']);
    await click('Return to parent conversation'); await ready(tall.id);
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Select passage in tutor reply 1').focus()`);
    await b('press', 'Enter');
    await wait(`document.activeElement?.tagName==='TEXTAREA'`);
    assert.equal(await ev(`document.activeElement.value`), text);
    await b('press', 'Home'); await b('press', 'Shift+ArrowRight'); await b('press', 'Escape');
    pass('reply selection retains repeated-emoji UTF-16 anchors and keyboard text; child has no inherited drawing', branch);

    await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Diagram please'); await b('press', 'Enter');
    await wait(`document.querySelector('.diagram-card[data-state="pending"]')?.textContent.includes('Creating diagram')`);
    child.send('release');
    await wait(`[...document.querySelectorAll('.diagram-card')].some(c=>c.textContent.includes('Streaming rounds') && c.dataset.state==='ready' && c.querySelector('img')?.naturalWidth>0)`);
    assert.equal(calls(), 4);
    pass('pending and ready SSE events update the originating card with no reload');

    await click('Return to tree'); await openRoot('Diagram states');
    await wait(`[...document.querySelectorAll('.diagram-card')].some(c=>c.textContent.includes('Render error') && c.dataset.state==='failed')`);
    for (const id of familyIds) await ready(id);
    // A diagram left pending when the server started is recovered as interrupted (see diagram-recovery.md).
    assert.equal(await ev(`document.querySelectorAll('.diagram-card[data-state="failed"]').length`), 7);
    assert.equal(await ev(`document.querySelectorAll('.diagram-card[data-state="pending"]').length`), 0);
    const failures = await ev(`[...document.querySelectorAll('.diagram-card[data-state="failed"]')].map(c=>({title:c.querySelector('h3').textContent,description:!!c.querySelector('[id$="-description"]')?.textContent,source:c.querySelector('pre')?.textContent,expanded:c.querySelector('button')?.getAttribute('aria-expanded')}))`);
    assert.ok(failures.every(f => f.description && (f.title === 'Failed example' || f.title === 'Pending example' || (f.source && f.expanded === 'true'))));
    assert.equal(await ev(`document.querySelectorAll('.diagram-card a,.diagram-card script,.diagram-card iframe,.diagram-card foreignObject').length`), 0);
    assert.equal(await ev(`window.__diagramAttacked`), 0);
    assert.equal(await ev(`performance.getEntriesByType('resource').filter(e=>e.name.includes('example.test')).length`), 0);
    assert.equal(await ev(`location.origin`), origin);
    assert.deepEqual(await ev(`window.__diagramViolations`), []);
    pass('five additional Mermaid families render; generation/render failures and unsafe persisted sources retain text fallback', failures);

    await click('Return to tree'); await openRoot('Other conversation');
    assert.equal(await ev(`document.querySelectorAll('.diagram-card').length`), 0);
    await click('Return to tree'); await openRoot('Diagram fixture'); await ready(tall.id);
    const baseline = await (await fetch(origin + `/api/trees/${root.id}`)).json();
    const before = calls();
    await b('reload');
    await b('wait', '[aria-label="Open Diagram fixture"]'); await click('Open Diagram fixture'); await ready(tall.id);
    assert.equal(calls(), before);
    pass('reopen and browser reload restore saved artifacts without provider requests');
    await stop(); await start();
    assert.notEqual(processes[0], processes[1]);
    await b('reload');
    await b('wait', '[aria-label="Open Diagram fixture"]'); await click('Open Diagram fixture'); await ready(tall.id);
    const restored = await (await fetch(origin + `/api/trees/${root.id}`)).json();
    assert.deepEqual(restored.artifacts, baseline.artifacts);
    assert.deepEqual(restored.messages, baseline.messages);
    assert.equal(calls(), before);
    assert.deepEqual(await ev(`window.__diagramViolations`), []);
    pass('actual server-process and SQLite restart preserve identical artifacts with zero extra inference', { processes, providerCalls: before, restoredArtifacts: restored.artifacts.length });
    const policy = (await fetch(origin)).headers.get('Content-Security-Policy');
    assert.match(policy, /script-src 'self';/); assert.doesNotMatch(policy, /script-src[^;]*unsafe/);
    pass('original CSP renders without policy violations or unsafe script sources', policy);
    const sources = ['src/DiagramCard.tsx', 'src/artifacts.ts', 'src/diagramSource.ts', 'src/mermaid.ts', 'src/ChatPage.tsx', 'src/TreeOverview.tsx', 'src/turn.ts', 'src/layout.ts', 'server/store.mjs', 'server/diagrams.mjs', 'server/app.mjs', 'scripts/verify-diagram-rendering.mjs', 'test/artifact-render.test.mjs', 'tsconfig.json', 'package.json', 'package-lock.json', 'docs/diagram-artifacts.md', 'dist/index.html'];
    writeFileSync('docs/verification/diagram-rendering-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence: 'Synthetic providers and seeded artifacts; real Chromium, production build, HTTP/SSE, SQLite and separate server process restart. No native media inference or isolation/recovery claim.', fixtureDirectory: dir, checks, screenshots: ['diagram-desktop.png', 'diagram-dark.png', 'diagram-narrow.png'].map(name => `.impeccable/review/${name}`), sourceHashes: Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])) }, null, 2) + '\n');
  } catch (error) {
    console.error(await b('snapshot', '-c').catch(() => 'Browser snapshot unavailable.'));
    console.error(await b('errors').catch(() => 'Browser errors unavailable.'));
    console.error(stderr);
    throw error;
  } finally { await b('close').catch(() => {}); await stop(); }
}
