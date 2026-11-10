// Browser fixture for TreeTutor-vm4.3: Interrupted and Unavailable after restart, Cancel and Retry by keyboard without losing focus,
// regeneration as a new attempt. Synthetic providers; renders run for real in the bubblewrap sandbox. Needs `npm run build`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { sandboxRender } from '../server/videos.mjs';

const filename = fileURLToPath(import.meta.url);
const composition = `// Description: A box labelled Winner rises to the top of the tree.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
export const durationInFrames = 30;
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: 'white', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 20], [0, 1]) }}>Winner</AbsoluteFill>;
}`;

if (process.argv[2] === '--serve') {
  const dir = process.argv[3], store = new Store(join(dir, 'trees.sqlite'));
  const log = kind => appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ kind }) + '\n');
  let release = () => {};
  const provider = {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => { log(tree.instructions?.includes('Remotion') ? 'worker' : 'tutor'); emit({ type: 'item', item: 'a', text: composition }); emit({ type: 'status', status: 'completed' }); },
  };
  // Each render waits for the test, unless its job is canceled first.
  const videoRender = async (workspace, output, signal, onProgress) => {
    await new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
    return sandboxRender(workspace, output, signal, onProgress);
  };
  const app = createApp({ store, provider, dir, videoRender, auth: { status: () => ({ connected: true }) } });
  process.on('message', message => {
    if (message === 'render') release();
    if (message === 'stop') { app.stop(); store.close(); process.exit(0); }
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}` });
} else {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-recovery-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const tree = store.create('Tournament locks');
  const request = store.message(tree.id, 'user', 'Make a video of the winner rising.', 'completed');
  const reply = store.message(tree.id, 'assistant', 'Here is the idea.', 'completed');
  const input = JSON.stringify({ request: 'Make a video of the winner rising.', sources: { conversation: tree.id, requestMessage: request, replyMessage: reply } });
  // Left pending as if TreeTutor stopped mid-render; the server start marks it interrupted.
  const stopped = store.pendingArtifact(tree.id, reply, 'Winner rising', 'Planned.', 'video', input);
  const lost = store.pendingArtifact(tree.id, reply, 'Lost video', 'Planned.', 'video', input);
  store.finishVideo(tree.id, lost.id, lost.attempt, { description: 'A saved video whose file was deleted.', duration: 1 });
  store.close();
  writeFileSync(join(dir, 'calls.jsonl'), '');

  const run = promisify(execFile);
  const session = (await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'video-recovery'])).stdout.trim();
  const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
  const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
  const wait = (expression, timeout = '30000') => b('wait', '--fn', expression, '--timeout', timeout);
  const calls = () => readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line).kind);
  const checks = [];
  const pass = (name, details = true) => { checks.push({ name, pass: true, details }); console.log('PASS:', name); };
  const card = id => `document.querySelector('.focused-chat [data-artifact="${id}"]')`;
  const view = id => ev(`(()=>{const c=${card(id)};return {state:c.dataset.state,status:c.querySelector('[role=status]').textContent,button:c.querySelector('button')?.textContent??null,video:!!c.querySelector('video'),focused:c.contains(document.activeElement)&&document.activeElement.tagName==='BUTTON'}})()`);
  const server = fork(filename, ['--serve', dir], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const { origin } = await new Promise((resolve, reject) => { server.once('message', resolve); server.once('exit', code => reject(new Error(`server exited ${code}`))); });
  try {
    await b('open', origin);
    await b('set', 'viewport', '1280', '800');
    await b('wait', '[aria-label="Open Tournament locks"]');
    await b('find', 'role', 'button', 'click', '--name', 'Open Tournament locks', '--exact');
    await wait(`!!${card(stopped.id)} && !!${card(lost.id)}`);
    const restarted = { interrupted: await view(stopped.id), unavailable: await view(lost.id), providerCalls: calls() };
    assert.deepEqual(restarted.interrupted, { state: 'interrupted', status: 'Winner rising: Video generation interrupted when TreeTutor stopped.', button: 'Retry video', video: false, focused: false });
    assert.deepEqual(restarted.unavailable, { state: 'unavailable', status: 'Lost video: Video unavailable: its saved file is missing or unreadable.', button: 'Regenerate video', video: false, focused: false });
    assert.deepEqual(restarted.providerCalls, []);
    pass('after restart: unfinished job shows Interrupted with Retry, missing file shows Unavailable with Regenerate, no inference replayed', restarted);

    // Keyboard: Tab onto Retry, Enter retries, the same button becomes Cancel and keeps focus.
    await ev(`${card(stopped.id)}.querySelector('button').focus()`);
    await b('press', 'Enter');
    await wait(`${card(stopped.id)}.querySelector('button')?.textContent==='Cancel video'`);
    const retrying = await view(stopped.id);
    assert.deepEqual(retrying, { state: 'preparing', status: 'Winner rising: Preparing video…', button: 'Cancel video', video: false, focused: true });
    await wait(`${card(stopped.id)}.dataset.state==='rendering'`);
    pass('Retry by keyboard starts a new attempt; focus stays on the action, now Cancel', retrying);

    await b('press', 'Enter');
    await wait(`${card(stopped.id)}.dataset.state==='canceled'`);
    await wait(`${card(stopped.id)}.querySelector('button')?.textContent==='Retry video'`);
    const canceled = await view(stopped.id);
    assert.deepEqual(canceled, { state: 'canceled', status: 'Winner rising: Video generation canceled.', button: 'Retry video', video: false, focused: true });
    server.send('render'); // the canceled attempt's render gate is already rejected; nothing may publish
    await new Promise(r => setTimeout(r, 1500));
    assert.equal((await view(stopped.id)).state, 'canceled');
    pass('Cancel by keyboard shows Canceled, keeps focus on Retry, and stays canceled afterwards', canceled);

    const messages = await ev(`document.querySelectorAll('.focused-chat .astryx-chat-message').length`);
    await b('press', 'Enter');
    await wait(`${card(stopped.id)}.dataset.state==='rendering'`);
    server.send('render');
    await wait(`${card(stopped.id)}.dataset.state==='ready'`, '120000');
    await wait(`${card(stopped.id)}.querySelector('video')?.readyState>=1`);
    const ready = await ev(`(()=>{const c=${card(stopped.id)},v=c.querySelector('video');return {paused:v.paused,autoplay:v.autoplay,duration:Math.round(v.duration),description:c.querySelector('p, [id$=-description]')?.textContent,messages:document.querySelectorAll('.focused-chat .astryx-chat-message').length,focusInCard:c.contains(document.activeElement)}})()`);
    assert.equal(ready.paused, true);
    assert.equal(ready.autoplay, false);
    assert.equal(ready.duration, 1);
    assert.equal(ready.messages, messages);
    pass('second Retry renders for real and plays paused inline; no learner message added', ready);

    await b('find', 'role', 'button', 'click', '--name', 'Regenerate video', '--exact');
    await wait(`${card(lost.id)}.dataset.state==='rendering'`);
    server.send('render');
    await wait(`${card(lost.id)}.dataset.state==='ready'`, '120000');
    await wait(`${card(lost.id)}.querySelector('video')?.readyState>=1`);
    assert.ok(existsSync(join(dir, 'videos', `${lost.id}.mp4`)));
    assert.deepEqual(calls(), ['worker', 'worker', 'worker']);
    pass('Regenerate replaces the unavailable entry with a ready video; only isolated worker calls, no tutor calls', { providerCalls: calls() });
    await ev(`${card(lost.id)}.scrollIntoView({block:'center'})`);
    await b('screenshot', join(process.cwd(), '.impeccable/review/video-recovery.png'));

    writeFileSync('docs/verification/video-recovery-results.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence: 'Synthetic tutor and worker providers; real sandboxed Remotion renders, production build, HTTP, SQLite and headless Chrome. No native provider inference.', checks }, null, 2) + '\n');
  } finally { await b('close').catch(() => {}); server.send('stop'); }
}
