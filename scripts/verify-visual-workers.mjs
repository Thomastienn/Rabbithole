// Focused built-UI check. Add --check-yourself for predict/reveal. Native: TREETUTOR_LIVE_VISUAL=1 node scripts/verify-visual-workers.mjs --check-yourself --live codex
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { Auth } from '../server/auth.mjs';
import lockfile from 'proper-lockfile';

const live = process.argv.includes('--live'), providerName = live ? process.argv.at(-1) : 'claude';
const prediction = process.argv.includes('--check-yourself');
const evidenceName = prediction ? (live ? 'check-yourself-native-' + providerName : 'check-yourself') : (live ? 'visual-native-' + providerName : 'visual-workers');
if (live) assert.ok(process.env.TREETUTOR_LIVE_VISUAL === '1' && ['claude', 'codex'].includes(providerName), 'Native smoke requires TREETUTOR_LIVE_VISUAL=1 and --live claude|codex. No provider fallback.');
process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-visual-workers-')), store = new Store(join(dir, 'trees.sqlite'));
const task = prediction
  ? { title: 'Predict the search interval', description: 'Search for 12 in 2, 4, 6, 8, 10, 12, 14. The midpoint is 8. Which half remains?', intent: 'A predict-then-reveal check: ask which half remains; reveal the right half with a brief reason.', excerpt: 'Keep 10, 12, 14 because target 12 is greater than midpoint 8.' }
  : { title: 'Winners advance', description: 'Two winners meet in the final.', intent: 'Show two winners meeting.', excerpt: 'Winners advance.' };
const block = title => '\n```treetutor-visual\n' + JSON.stringify({ ...task, title }) + '\n```';
const source = prediction
  ? `<style>p{margin-block:var(--spacing-3)}summary{font-family:Archivo,sans-serif;cursor:pointer;color:var(--color-accent)}summary:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}code{white-space:normal}</style><p>Search for 12: <code>2, 4, 6, <strong>8</strong>, 10, 12, 14</code></p><p>The midpoint is 8. Which half remains?</p><details><summary>Reveal answer</summary><p id="prediction-result" data-visual-label="Remaining half" data-visual-explanation="The right half remains because 12 is greater than 8.">Keep the right half: <code>10, 12, 14</code>.</p><p>Because 12 is greater than 8, the midpoint and all smaller values can be ruled out.</p></details>`
  : `<style>svg{display:block;width:100%;color:var(--color-text-primary)}button{font:inherit;color:var(--color-text-primary);background:transparent;border:1px solid var(--color-border)}button:focus-visible{outline:2px solid var(--color-accent)}</style><svg viewBox="0 0 400 100" role="img" aria-label="Two winners advancing to the final"><text x="8" y="40" fill="currentColor">Winner A → Final ← Winner B</text></svg><button type="button" id="step">Next round</button><p role="status" id="result">Round one</p><script>document.getElementById('step').onclick=()=>document.getElementById('result').textContent='Final round';</script>`;
let good = false, chatRelease, holdWorkers = false;
const workerReleases = [], workerCalls = [], launches = [];
const complete = (emit, text) => { emit({ type: 'item', item: 'a', text }); emit({ type: 'status', status: 'completed' }); };
const models = async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true, efforts: ['low'] }];
const tutor = { models, generate: async (_tree, text, emit) => {
  if (text === 'More steps') {
    emit({ type: 'item', item: 'a', text: 'Read this while the visuals generate.' + Array.from({ length: 5 }, (_, i) => block('Step ' + i)).join('') + '\n\nReading continues below the visuals.' });
    await new Promise(r => { chatRelease = r; });
  } else complete(emit, (prediction ? 'Compare the target with the midpoint.' : 'Winners advance in rounds.') + block(task.title) + (prediction ? '\n\nContinue whenever you like.' : '\n\nThe final decides the winner.'));
} };
const launch = (command, args, options) => {
  const record = { args, apiKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY'].filter(k => k in options.env), requests: [] };
  launches.push(record);
  const child = spawn(command, args, options);
  if (command === 'codex') {
    const write = child.stdin.write.bind(child.stdin);
    child.stdin.write = text => {
      const { method, params } = JSON.parse(text);
      if (method === 'thread/start' || method === 'thread/resume') record.requests.push({ method, worker: params.baseInstructions?.startsWith('You create one self-contained visual'), model: params.model, sandbox: params.sandbox, approvalPolicy: params.approvalPolicy });
      if (method === 'turn/start') record.requests.push({ method, model: params.model, effort: params.effort });
      return write(text);
    };
  }
  return child;
};
let release;
const authDir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
if (live && providerName === 'codex') release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
const smart = live ? providerName === 'claude' ? new Claude(dir, launch) : new Codex(new Auth(authDir), dir, launch) : { models, generate: async (_tree, text, emit, _save, signal) => {
  workerCalls.push({ request: JSON.parse(text).request, signal });
  if (holdWorkers) await new Promise(r => workerReleases.push(r));
  complete(emit, good ? source : '<script>const = broken;</script>');
} };
const app = createApp({ store, providers: live ? { [providerName]: smart } : { openai: tutor, claude: smart }, defaultProvider: live ? providerName : 'claude', visualTimeout: live ? 120000 : 60000, auth: { status: () => ({ connected: false }) } });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`, { csrf } = await (await fetch(origin + '/api/state')).json();
const post = (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
const run = promisify(execFile), session = (await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', evidenceName])).stdout.trim();
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 << 20 })).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', expression, '--timeout', '30000');
const checks = [], shots = join(process.cwd(), '.impeccable/review'); mkdirSync(shots, { recursive: true });
const pass = (name, detail) => { checks.push({ name, pass: true, ...(detail && { detail }) }); console.log('PASS:', name); };
let tree, artifact;
const report = { checkedAt: new Date().toISOString(), issue: prediction ? 'TreeTutor-zjq' : 'TreeTutor-zhf.5', evidence: live ? `Real native ${providerName} tutor and smart worker, built UI, agent-browser; isolated temporary data. No fixtures for inference.` : 'Synthetic providers, isolated temporary SQLite, built UI, agent-browser.', checks };
try {
  const model = live ? providerName === 'claude' ? 'haiku' : (await smart.models()).find(m => m.isDefault)?.model : 'fixture';
  assert.equal((await post('/api/settings/smart', { model: { provider: live ? providerName : 'claude', model }, followEffort: false, effort: 'low' })).status, 200);
  tree = store.create('Visual workers', live ? providerName : 'openai', model, live ? 'low' : null);
  const start = Date.now();
  const question = prediction ? 'Teach me binary search with one optional predict-then-reveal visual. Search for 12 in the sorted list 2, 4, 6, 8, 10, 12, 14 with midpoint 8; ask which half remains. Keep surrounding prose brief and do not spoil the answer outside the reveal. Place the visual between two short paragraphs.' : 'Explain how four players become one winner in a single elimination tournament. Include exactly one small interactive visual with a Next round button, placed between two short paragraphs. Keep the prose brief.';
  const stream = await (await post(`/api/trees/${tree.id}/messages`, { text: live ? question : prediction ? 'Help me check binary search.' : 'How do tournaments work?' })).text();
  report.elapsedMs = Date.now() - start;
  if (live) report.errors = stream.split('\n\n').filter(x => x.includes('"type":"error"')).map(x=>JSON.parse(x.slice(6)).error);
  artifact = store.tree(tree.id).artifacts[0];
  assert.ok(artifact && artifact.kind === 'visual', 'the tutor requested a visual');
  assert.equal(artifact.status, live ? 'ready' : 'failed', artifact.error);
  if (live) {
    assert.equal(store.tree(tree.id).messages.at(-1).status, 'completed');
    assert.equal(store.tree(tree.id).artifacts.length, 1);
    const workers = launches.filter(l => l.args.includes('--system-prompt') && l.args[l.args.indexOf('--system-prompt') + 1].startsWith('You create one self-contained visual'));
    if (providerName === 'claude') {
      assert.ok(workers.length >= 1 && workers.length <= 2);
      for (const l of workers) {
        const arg = flag => l.args[l.args.indexOf(flag) + 1];
        assert.equal(arg('--tools'), ''); assert.equal(arg('--max-turns'), '1'); assert.equal(arg('--effort'), 'low'); assert.equal(arg('--model'), 'haiku');
        assert.equal(arg('--mcp-config'), '{"mcpServers":{}}'); assert.equal(arg('--setting-sources'), ''); assert.ok(l.args.includes('--strict-mcp-config') && l.args.includes('--disable-slash-commands') && !l.args.includes('--resume')); assert.equal(l.apiKeys.length, 0);
      }
    } else {
      assert.equal(launches.length, 1);
      for (const f of ['shell_tool','apply_patch_freeform','js_repl','code_mode','apps','skills']) assert.ok(launches[0].args.includes(`features.${f}=false`));
      assert.ok(launches[0].args.includes('web_search="disabled"'));
      const threads = launches[0].requests.filter(r => r.worker);
      assert.ok(threads.length >= 1 && threads.length <= 2);
      assert.ok(threads.every(r => r.method === 'thread/start' && r.model === model && r.sandbox === 'read-only' && r.approvalPolicy === 'never'));
      assert.ok(launches[0].requests.filter(r => r.method === 'turn/start').every(r => r.effort === 'low'));
      assert.equal(launches[0].apiKeys.length, 0);
    }
    report.native = { provider: providerName, model, effort: 'low', workerCalls: store.usageEvents().events.filter(e => e.task === 'diagram').length, launches: launches.length, permissions: launches.flatMap(l => l.requests), sourceSha256: createHash('sha256').update(artifact.source).digest('hex'), usage: store.usageEvents().events.filter(e => e.task === 'diagram') };
    pass('native tutor requests a visual and isolated smart worker returns a validated fragment', report.native);
  } else assert.equal(workerCalls.length, 2, 'one automatic invalid-output retry');
  const usageBeforeUI = store.usageEvents().events.length;
  await b('set', 'viewport', '1280', '900'); await b('open', origin);
  await b('wait', '[aria-label="Open Visual workers"]');
  await b('find', 'role', 'button', 'click', '--name', 'Open Visual workers', '--exact');
  const figure = `document.querySelector('.focused-chat figure.visual[data-artifact="${artifact.id}"]')`;
  await wait(`!!${figure}`);
  if (!live) {
    assert.match(await ev(`${figure}.textContent`), /Visual unavailable.*invalid JavaScript/s);
    good = true; holdWorkers = true;
    await ev(`${figure}.querySelector('button').focus(); true`); await b('press', 'Enter');
    await wait(`${figure}.dataset.state==='pending'`);
    assert.ok(await ev(`!!${figure}.querySelector('.visual-shimmer')`));
    assert.equal(workerCalls.length, 3); workerReleases.shift()(); holdWorkers = false;
    await wait(`${figure}.dataset.state==='ready' && !!${figure}.querySelector('iframe[data-ready]')`);
    assert.ok(await ev(`${figure}.contains(document.activeElement)`), 'keyboard focus stays with the visual after Retry');
    assert.equal(store.tree(tree.id).messages.length, 2);
    pass('failed visual explains its reason; keyboard Retry preserves focus and shows a pending shimmer before rendering');
  } else await wait(`!!${figure}.querySelector('iframe[data-ready]')`);
  artifact = store.tree(tree.id).artifacts[0];
  const layout = await ev(`(()=>{const f=${figure},i=f.querySelector('iframe'),r=i.getBoundingClientRect();return {before:f.previousElementSibling?.textContent,after:f.nextElementSibling?.textContent,width:r.width,column:f.parentElement.getBoundingClientRect().width,height:r.height,label:i.title,sandbox:i.getAttribute('sandbox'),border:getComputedStyle(i).borderTopWidth,bg:getComputedStyle(i).backgroundColor}})()`);
  if (live) assert.ok(layout.before); else assert.equal(layout.before, prediction ? 'Compare the target with the midpoint.' : 'Winners advance in rounds.');
  assert.ok(layout.after, 'prose follows the inline visual'); assert.equal(layout.width, layout.column); assert.ok(layout.height > 30); assert.equal(layout.border, '0px'); assert.equal(layout.bg, 'rgba(0, 0, 0, 0)'); assert.equal(layout.label, artifact.description); assert.equal(layout.sandbox, 'allow-scripts');
  pass('worker result renders at its recorded position with full width, auto-height, transparent frame and accessible description', layout);
  // Agent-browser owns the browser. Inspect its opaque iframe through CDP because `frame` cannot select OOPIFs.
  const frameEval = async (expression, accessibility = false) => {
    const socket = new WebSocket((await b('get', 'cdp-url')).trim());
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const result = JSON.parse(event.data), request = pending.get(result.id);
      if (request) { pending.delete(result.id); result.error ? request.reject(new Error(result.error.message)) : request.resolve(result.result); }
    };
    const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
    const timer = setTimeout(() => { for (const request of pending.values()) request.reject(new Error('Frame inspection timed out.')); socket.close(); }, 10000);
    try {
      const { targetInfos } = await call('Target.getTargets');
      const target = targetInfos.find(t => t.type === 'iframe' && t.url === origin + '/sandbox.html');
      assert.ok(target, 'the isolated visual has its own browser target');
      const { sessionId } = await call('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      if (accessibility) {
        const { nodes } = await call('Accessibility.getFullAXTree', {}, sessionId);
        return nodes.filter(n => !n.ignored).map(n => n.name?.value ?? '').join('\n');
      }
      const { result, exceptionDetails } = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      assert.ok(!exceptionDetails, exceptionDetails?.text);
      return result.value;
    } finally { clearTimeout(timer); socket.close(); }
  };
  const probe = () => frameEval(`({text:document.getElementById('visual').innerText,color:getComputedStyle(document.body).color,drawn:document.querySelectorAll('#visual svg *,#visual canvas,#visual button,#visual summary').length,overflow:document.body.scrollWidth>innerWidth})`);
  const rendered = await probe();
  assert.ok(rendered.drawn > 0); report.rendered = rendered;
  const focusControl = () => frameEval(prediction ? `(()=>{const s=document.querySelector('#visual details > summary');if(!s || s.textContent.trim()!=='Reveal answer')throw Error('Reveal answer summary missing');s.focus();return document.activeElement===s;})()` : `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Next round');if(!b)throw Error('Next round is missing');b.focus();return document.activeElement===b;})()`);
  if (prediction) {
    assert.equal(await frameEval(`document.querySelector('#visual details')?.open`), false);
    assert.doesNotMatch(rendered.text + artifact.title + artifact.description + store.tree(tree.id).messages.at(-1).text, /right half|keep (?:only )?10|greater than 8/i, 'answer stays out of initial content and metadata');
    report.closedAccessibility = await frameEval('', true);
    assert.match(report.closedAccessibility, /Reveal answer/);
    assert.doesNotMatch(report.closedAccessibility, /right half|greater than 8/i);
  }
  await focusControl();
  await b('press', 'Enter');
  assert.notEqual((await probe()).text, rendered.text, 'visual control works by keyboard');
  if (prediction) {
    assert.equal(await frameEval(`document.querySelector('#visual details').open`), true);
    assert.match((await probe()).text, /right|10[\s,]+12[\s,]+14/i);
    report.revealed = (await probe()).text;
    assert.match(report.revealed, /12 is greater than 8/i, 'the revealed explanation justifies the correct half');
    report.openAccessibility = await frameEval('', true);
    assert.match(report.openAccessibility, /12 is greater than 8/i);
    await b('press', 'Space');
    assert.equal(await frameEval(`document.querySelector('#visual details').open`), false);
    assert.equal(await ev(`!!document.querySelector('.branch-form')`), false);
    pass('question starts visible; answer and explanation stay hidden until Enter; Space closes without branching');
  }
  pass('sandbox contains rendered visual content and working local interaction', { drawn: rendered.drawn });
  for (const [width, size] of [[1280, 'desktop'], [390, 'narrow']]) for (const mode of ['light', 'dark']) {
    await b('set', 'viewport', String(width), '900');
    await ev(`localStorage.setItem('treetutor.appearance','${mode}');location.reload();true`);
    await b('wait', '[aria-label="Open Visual workers"]');
    await b('find', 'role', 'button', 'click', '--name', 'Open Visual workers', '--exact');
    await wait(`!!${figure}?.querySelector('iframe[data-ready]')`);
    await ev(`${figure}.scrollIntoView({block:'center'});true`);
    const appColor = await ev(`getComputedStyle(${figure}).color`);
    const inspected = await probe();
    assert.equal(inspected.color, appColor);
    assert.ok(!inspected.overflow, `${size} ${mode}: no visual overflow`);
    const screenshot = join(shots, `${evidenceName}-${size}-${mode}.png`);
    await b('screenshot', screenshot);
    assert.ok(existsSync(screenshot), 'browser screenshot was saved');
    if (prediction) {
      assert.equal(await frameEval(`document.querySelector('#visual details').open`), false, 'reopening resets the reveal');
      const height = await ev(`${figure}.querySelector('iframe').offsetHeight`);
      await focusControl(); await b('press', 'Enter');
      await wait(`${figure}.querySelector('iframe').offsetHeight > ${height}`);
      const expanded = await probe(); assert.ok(!expanded.overflow);
      await b('screenshot', join(shots, `${evidenceName}-${size}-${mode}-revealed.png`));
    }
  }
  pass('rendered visual follows both appearances and fits desktop and narrow reading columns');
  if (prediction) {
    assert.equal(store.usageEvents().events.length, usageBeforeUI + (live ? 0 : 1), 'revealing, closing and reloading make no inference calls');
    assert.equal(store.tree(tree.id).messages.length, 2);
    assert.equal(store.tree(tree.id).artifacts[0].source, artifact.source);
    pass('reveal and reload preserve source/messages, reset hidden state and make no inference calls');
    if (live) {
      for (const text of ['What is 2 + 2? Answer briefly.', 'Explain binary search briefly in plain text. No quizzes or visuals; give me a direct explanation.']) {
        const direct = store.create('Direct explanation', providerName, model, 'low');
        await (await post(`/api/trees/${direct.id}/messages`, { text })).text();
        const result = store.tree(direct.id);
        assert.equal(result.messages.at(-1).status, 'completed'); assert.ok(result.messages.at(-1).text.trim());
        assert.equal(result.artifacts.length, 0, text);
        assert.doesNotMatch(result.messages.at(-1).text, /reveal answer|predict|check yourself|quiz\s*:/i);
        (report.directReplies ??= []).push({ question: text, reply: result.messages.at(-1).text });
      }
      pass('native tutor keeps short factual answers and explicit quiz opt-outs direct and text-only');
    }
  }
  if (!live) {
    const count = workerCalls.length; assert.equal(count, 3, 'reload never regenerates');
    holdWorkers = true;
    await b('find', 'label', 'Your question', 'fill', 'More steps'); await b('press', 'Enter');
    await wait(`document.querySelectorAll('.focused-chat figure.visual[data-state=pending]').length===5`);
    assert.equal(workerCalls.length, count + 3, 'three workers start; two wait');
    assert.ok(await ev(`document.querySelector('.focused-chat').textContent.includes('Reading continues below the visuals.')`));
    await b('find', 'role', 'button', 'click', '--name', 'Stop', '--exact');
    await wait(`document.querySelectorAll('.focused-chat figure.visual[data-state=pending]').length===0`);
    assert.equal(store.tree(tree.id).artifacts.filter(a => a.status === 'canceled').length, 5);
    assert.ok(workerCalls.slice(count).every(c => c.signal.aborted));
    workerReleases.splice(0).forEach(r => r()); chatRelease?.();
    assert.equal(workerCalls.length, count + 3);
    pass('streamed placeholders coexist with continuing prose; learner Stop removes all five and aborts workers without draining the queue');
  }
  if (prediction && !live) {
    store.branch(store.tree(tree.id), { messageId: artifact.message, artifactId: artifact.id, label: 'Remaining half', explanation: 'The right half remains because 12 is greater than 8.', text: 'Visual: Predict the search interval\nPart: Remaining half\nThe right half remains because 12 is greater than 8.', question: 'Why that half?' }, 'The learner is checking binary search.');
    await b('reload'); await b('wait', '[aria-label="Open Visual workers"]');
    await b('find', 'role', 'button', 'click', '--name', 'Reveal source passage for Why that half?', '--exact');
    await wait(`!!${figure}?.querySelector('iframe[data-ready]')`);
    const revealed = await frameEval(`({open:document.querySelector('#visual details').open,focus:document.activeElement.id})`);
    assert.equal(revealed.open, true, 'source reveal must open the answer containing the branched part');
    assert.equal(revealed.focus, 'prediction-result');
    assert.equal(workerCalls.length, 6, 'source reveal makes no inference call');
    pass('revealing a saved branch source opens the containing answer and focuses the exact part without inference');
  }
  report.pass = true;
} catch (error) { report.pass = false; report.error = error.message; throw error; }
finally {
  chatRelease?.(); workerReleases.forEach(r => r());
  await b('close').catch(() => {}); await app.stop(); store.close(); await release?.();
  writeFileSync(`docs/verification/${evidenceName}.json`, JSON.stringify(report, null, 2) + '\n');
}
