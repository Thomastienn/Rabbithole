// Browser fixture for TreeTutor-zhf.2: rejected tutor request blocks show as failed diagram/video cards with a reason and
// an explicit Retry that reruns from the stored request, by keyboard, in both appearances. Synthetic provider. Needs `npm run build`.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const task = { title: 'Winners advance', description: 'Two winners meet in the final.', intent: 'Show two winners meeting.', excerpt: 'A and B advance.' };
const blocks = {
  diagram: 'Winners advance in rounds.\n```treetutor-diagram\n' + JSON.stringify(task) + '\n```\n```treetutor-diagram\n{"title": "Broken",\n```',
  video: 'Sure.\n```treetutor-video\n' + JSON.stringify({ title: 'Orbits', description: 'Earth orbits.', excerpt: 'Earth', style: 'fun' }) + '\n```',
};
let workerOutput = 'not mermaid <script>';
const calls = [];
const provider = {
  models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
  generate: async (tree, text, emit) => {
    calls.push(tree.instructions?.includes('Remotion') ? 'video' : tree.id ? 'tutor' : 'diagram');
    const out = tree.id ? (/video/i.test(text) ? blocks.video : blocks.diagram) : tree.instructions?.includes('Remotion') ? '' : workerOutput;
    emit({ type: 'item', item: 'a', text: out }); emit({ type: 'status', status: 'completed' });
  },
};
const dir = mkdtempSync(join(tmpdir(), 'tt-request-failures-'));
const store = new Store(join(dir, 'trees.sqlite'));
const app = createApp({ store, provider, dir, auth: { status: () => ({ connected: true }) } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const { csrf } = await (await fetch(`${origin}/api/state`)).json();
const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }).then(r => r.text());
const tree = store.create('Request slips');
await post(`/api/trees/${tree.id}/messages`, { text: 'How do tournaments work?' });
await post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of Earth orbiting the Sun.' });
const [worked, rejected, video] = store.tree(tree.id).artifacts;
assert.deepEqual([worked.status, rejected.status, video.status], ['failed', 'failed', 'failed']);
workerOutput = 'flowchart TD\n  A[Winner A] --> C[Final]\n  B[Winner B] --> C';

const run = promisify(execFile);
const session = (await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'request-failures'])).stdout.trim();
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression, timeout = '30000') => b('wait', '--fn', expression, '--timeout', timeout);
const card = id => `document.querySelector('.focused-chat [data-artifact="${id}"]')`;
const view = id => ev(`(()=>{const c=${card(id)};return {status:[...c.querySelectorAll('[role=status]')].map(s=>s.textContent).join(' | '),button:c.querySelector('button')?.textContent??null}})()`);
const checks = [], shots = join(process.cwd(), '.impeccable/review');
mkdirSync(shots, { recursive: true });
const pass = (name, details = true) => { checks.push({ name, pass: true, details }); console.log('PASS:', name); };
try {
  const initialCalls = calls.length;
  await b('open', origin);
  await b('set', 'viewport', '1280', '800');
  const openTree = async () => {
    await b('wait', '[aria-label="Open Request slips"]');
    await b('find', 'role', 'button', 'click', '--name', 'Open Request slips', '--exact');
    await wait(`!!${card(video.id)}`);
  };
  await openTree();
  const before = { worked: await view(worked.id), rejected: await view(rejected.id), video: await view(video.id) };
  assert.match(before.worked.status, /Diagram unavailable\. Unsafe diagram source|Diagram unavailable\./);
  assert.match(before.rejected.status, /Diagram request could not be read: the request was not valid JSON\./);
  assert.equal(before.rejected.button, 'Retry diagram');
  assert.match(before.video.status, /Video request could not be read: the request is missing intent\./);
  assert.equal(before.video.button, 'Retry video');
  pass('rejected diagram and video blocks show failed cards with the reason and Retry', before);
  const captures = [];
  for (const [width, size] of [[1280, 'desktop'], [390, 'narrow']]) for (const mode of ['light', 'dark']) {
    await b('set', 'viewport', String(width), '800');
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); location.reload(); true`);
    await openTree();
    await ev(`${card(video.id)}.scrollIntoView({block:'center',behavior:'instant'}); true`);
    await wait(`(()=>{const r=${card(video.id)}.querySelector('.video-stage').getBoundingClientRect();return r.top>=document.querySelector('.focused-chat .chat-header').getBoundingClientRect().bottom&&r.bottom<=document.querySelector('.focused-chat .astryx-chat-composer').getBoundingClientRect().top})()`);
    const bounds = await ev(`(()=>{const c=${card(video.id)}, stage=c.querySelector('.video-stage').getBoundingClientRect();return [c.querySelector('[role=status]'),...c.querySelectorAll('button')].every(e=>{const r=e.getBoundingClientRect();return r.top>=stage.top&&r.bottom<=stage.bottom&&r.left>=stage.left&&r.right<=stage.right})})()`);
    assert.equal(bounds, true, 'failure reason and Retry fit inside the inline video status');
    const file = `request-failures-${size}-${mode}.png`;
    await b('screenshot', join(shots, file));
    captures.push(file);
  }
  await b('set', 'viewport', '1280', '800');
  await ev(`localStorage.removeItem('treetutor.appearance'); true`);
  pass('failed cards fit desktop and narrow viewports in light and dark appearances', captures);
  assert.equal(calls.length, initialCalls, 'opening and reloading failed requests never retries a worker');
  pass('opening and reloading failed cards never retries generation');

  // Keyboard: focus Retry diagram, Enter reruns from the stored request; focus stays on the action while pending.
  const before_calls = calls.length;
  await ev(`${card(rejected.id)}.querySelector('button').focus(); true`);
  await b('press', 'Enter');
  await wait(`${card(rejected.id)}.dataset.state==='ready'`);
  const after = { state: await ev(`${card(rejected.id)}.dataset.state`), focusInCard: await ev(`${card(rejected.id)}.contains(document.activeElement)`), workerCalls: calls.slice(before_calls) };
  assert.deepEqual(after.workerCalls, ['diagram']);
  assert.equal(after.focusInCard, true, 'focus stays on the diagram card after its Retry button goes away');
  assert.equal(await ev(`document.querySelectorAll('.focused-chat .astryx-chat-message').length`), 4, 'Retry adds no learner message');
  pass('Retry diagram by keyboard reruns one worker from the stored request and renders the diagram', after);
  const video_calls = calls.length;
  await ev(`${card(video.id)}.querySelector('button').focus(); true`);
  await b('press', 'Enter');
  for (let i = 0; i < 200 && (store.artifact(tree.id, video.id).status !== 'failed' || calls.length === video_calls); i++) await new Promise(r => setTimeout(r, 50));
  await wait(`${card(video.id)}.dataset.state==='failed'`);
  assert.deepEqual(calls.slice(video_calls), ['video'], 'Retry video runs the video worker once from the stored request');
  assert.equal(await ev(`${card(video.id)}.contains(document.activeElement)`), true, 'Retry video preserves keyboard focus');
  assert.match((await view(video.id)).status, /^Orbits: Video composition is missing its description\./, 'the safe server-authored validation reason stays visible');
  pass('Retry video by keyboard reruns the video worker from the stored request', calls.slice(video_calls));
} finally {
  await b('close').catch(() => {});
  app.stop(); store.close();
}
writeFileSync(join(process.cwd(), 'docs/verification/request-failures.json'), JSON.stringify({ issue: 'TreeTutor-zhf.2', evidence: 'fixture provider, built UI, agent-browser', checks }, null, 2) + '\n');
