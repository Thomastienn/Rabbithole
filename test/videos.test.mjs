import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { tutorContext } from '../server/diagrams.mjs';
import { generateVideo, videoSource, mediaPath, SANDBOX } from '../server/videos.mjs';

const task = { title: 'Winners advance', description: 'Two winners meet in the final.', intent: 'Animate two winners advancing.', excerpt: 'A and B advance to the final.' };
const directive = '\n```treetutor-video\n' + JSON.stringify(task) + '\n```';
const composition = `// Description: Two labelled boxes slide together into a final box.
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
// PRIVATE_SOURCE_MARKER
export const durationInFrames = 30;
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: 'white', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 20], [0, 1]) }}>A + B → Final</AbsoluteFill>;
}`;
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4096, 1)]);
const fakeRender = async (workspace, output) => { writeFileSync(output, mp4); return { durationInFrames: 60, fps: 30 }; };
const complete = (emit, text) => { emit({ type: 'item', item: 'answer', text }); emit({ type: 'status', status: 'completed' }); };
const until = async check => { for (let i = 0; i < 200; i++) { const value = check(); if (value) return value; await new Promise(r => setTimeout(r, 25)); } throw new Error('timed out'); };

async function open(provider, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-videos-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) }, dir, videoRender: fakeRender, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  return {
    store, app, dir,
    get: path => fetch(origin + path),
    post: (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }),
    close: () => { app.stop(); store.close(); },
  };
}

test('explicit video request creates one job with frozen input, publishes owned media and exposes only metadata to the tutor', async () => {
  const tutor = [], workers = [];
  const provider = { generate: async (tree, text, emit) => {
    if (tree.instructions?.includes('Remotion')) { workers.push({ tree, text }); return complete(emit, composition); }
    tutor.push({ tree, text });
    if (text.startsWith('Compact')) return complete(emit, 'Compact summary.');
    complete(emit, /video|Explain/.test(text) ? 'Here is the idea.' + directive : 'Continuing.');
  } };
  const env = await open(provider);
  try {
    const parent = env.store.create('Parent');
    env.store.message(parent.id, 'user', 'UNRELATED SIBLING DISCUSSION', 'completed');
    const parentReply = env.store.message(parent.id, 'assistant', 'Peterson locks use a tournament tree.', 'completed');
    const child = env.store.branch(env.store.tree(parent.id), { messageId: parentReply, start: 0, end: 8, text: 'Peterson', question: 'How does Peterson fit?' }, 'Inherited snapshot.');

    // An ordinary explanation never starts a video, even if the tutor emits a block.
    await (await env.post(`/api/trees/${child.id}/messages`, { text: 'Explain winners.' })).text();
    assert.equal(env.store.tree(child.id).artifacts.length, 0);
    assert.equal(workers.length, 0);

    const request = 'Make a video explaining how Peterson fits into this tournament tree.';
    const stream = await (await env.post(`/api/trees/${child.id}/messages`, { text: request })).text();
    assert.ok(!stream.includes('treetutor-video'));
    const ready = await until(() => env.store.tree(child.id).artifacts.find(a => a.status === 'ready'));
    const saved = env.store.tree(child.id);
    assert.equal(saved.artifacts.length, 1);
    assert.equal(ready.kind, 'video');
    assert.equal(ready.source, null);
    assert.equal(ready.duration, 2);
    assert.equal(ready.description, 'Two labelled boxes slide together into a final box.');
    const [user, reply] = saved.messages.slice(-2);
    assert.equal(ready.message, reply.id);
    const input = JSON.parse(ready.input);
    assert.deepEqual(input, { request, intent: task.intent, excerpt: task.excerpt,
      inheritedContext: { snapshot: 'Inherited snapshot.', selectedPassage: 'Peterson', question: 'How does Peterson fit?' },
      sources: { conversation: child.id, requestMessage: user.id, replyMessage: reply.id, parentConversation: parent.id, parentMessage: parentReply } });

    // The worker receives only the frozen input, in a fresh session, with its own instructions.
    assert.equal(workers.length, 1);
    assert.equal(workers[0].text, ready.input);
    assert.deepEqual(Object.keys(workers[0].tree).sort(), ['instructions', 'model', 'provider', 'thread']);
    assert.equal(workers[0].tree.thread, null);
    assert.ok(!workers[0].text.includes('UNRELATED SIBLING DISCUSSION'));

    // Media is served same-origin only for its owning conversation; private output was moved out.
    const media = await env.get(`/api/trees/${child.id}/artifacts/${ready.id}/media`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), mp4);
    assert.equal((await env.get(`/api/trees/${parent.id}/artifacts/${ready.id}/media`)).status, 404);
    assert.deepEqual(readdirSync(join(env.dir, 'video-work', ready.attempt)).sort(), ['Video.tsx', 'index.tsx']);
    assert.ok(readFileSync(join(env.dir, 'video-work', ready.attempt, 'Video.tsx'), 'utf8').includes('PRIVATE_SOURCE_MARKER'));

    // Tutor history, provider-switch history and branch snapshots carry only id, kind, title and description.
    await (await env.post(`/api/trees/${child.id}/messages`, { text: 'Thanks, continue.' })).text();
    const fresh = env.store.tree(child.id);
    const branch = await env.post(`/api/trees/${child.id}/branches`, { messageId: reply.id, start: 0, end: 4, text: 'Here', question: 'Why?' });
    assert.equal(branch.status, 201);
    assert.ok(tutorContext(fresh).messages.some(m => m.text.endsWith('Ready artifacts (artifact metadata): ' + JSON.stringify([{ id: ready.id, kind: 'video', title: task.title, description: ready.description }]))));
    const histories = [JSON.stringify(tutor.at(-2).tree), JSON.stringify(tutorContext(fresh)), tutor.at(-1).text];
    for (const history of histories) {
      for (const field of [ready.id, task.title, ready.description]) assert.ok(history.includes(field), field);
      for (const secret of ['PRIVATE_SOURCE_MARKER', 'remotion', env.dir, 'video-work', ready.attempt, ready.input]) assert.ok(!history.includes(secret), secret);
    }
  } finally { env.close(); }
});

async function job(render, mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-job-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const tree = store.create('Video');
  const message = store.message(tree.id, 'assistant', 'Reply.', 'completed');
  const artifact = store.pendingArtifact(tree.id, message, 'Title', 'Planned.', 'video', '{"request":"Make a video."}');
  mutate?.(store, artifact);
  const provider = { generate: async (t, text, emit) => complete(emit, composition) };
  const phases = [];
  const result = await generateVideo({ provider, selection: {}, store, dir, artifact, signal: new AbortController().signal, render, onPhase: (...p) => phases.push(p) }).then(() => null, error => error.message);
  assert.ok(!existsSync(join(dir, 'video-work', artifact.attempt, 'out'))); // no leftover unpublished output
  return { result, row: store.artifact(tree.id, artifact.id), published: existsSync(mediaPath(dir, artifact.id)), dir, phases };
}

test('out-of-workspace output, unreadable media, lost ownership and a failed save publish nothing', async () => {
  const outside = join(mkdtempSync(join(tmpdir(), 'tt-outside-')), 'elsewhere.mp4');
  writeFileSync(outside, mp4);
  const cases = {
    'symlink out of workspace': async (ws, output) => { symlinkSync(outside, output); return { durationInFrames: 30, fps: 30 }; },
    'replaced out directory': async (ws, output) => { const { renameSync } = await import('node:fs'); renameSync(join(ws, 'out'), join(ws, 'old')); symlinkSync(dirname(outside), join(ws, 'out')); writeFileSync(join(dirname(outside), output.split('/').at(-1)), mp4); return { durationInFrames: 30, fps: 30 }; },
    'missing output': async () => ({ durationInFrames: 30, fps: 30 }),
    'unreadable media': async (ws, output) => { writeFileSync(output, Buffer.alloc(4096, 7)); return { durationInFrames: 30, fps: 30 }; },
    'render failure': async () => { throw new Error('Video rendering failed.'); },
  };
  for (const [name, render] of Object.entries(cases)) {
    const { result, row, published } = await job(render);
    assert.ok(result, name);
    assert.equal(row.status, 'pending', name); // the app marks it failed; nothing became ready
    assert.equal(published, false, name);
  }
  const lost = await job(fakeRender, store => store.db.prepare("UPDATE artifacts SET attempt='superseded'").run());
  assert.equal(lost.result, 'Video job no longer owns this output.');
  assert.equal(lost.published, false);
  const failedSave = await job(fakeRender, store => { store.finishVideo = () => { throw new Error('disk full /secret/path'); }; });
  assert.equal(failedSave.result, 'Video could not be saved.');
  assert.equal(failedSave.published, false);
  assert.notEqual(failedSave.row.status, 'ready');

  for (const bad of [composition.replace("from 'remotion'", "from '../../trees.sqlite'"), composition + "\nfetch('x');", composition + "\nconst m = import('fs');", composition.replace('// Description: ', '// '), composition + '\n<Img src="https://example.com/a.png" />'])
    assert.throws(() => videoSource(bad));
  assert.equal(videoSource('```tsx\n' + composition + '\n```').description, 'Two labelled boxes slide together into a final box.');
});

test('app marks a failed job failed without a playable result', async () => {
  const provider = { generate: async (tree, text, emit) => complete(emit, tree.id ? 'Sure.' + directive : composition) };
  const env = await open(provider, { videoRender: async () => { throw new Error('Video rendering failed.'); } });
  try {
    const tree = env.store.create('Video');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Please make an animation of this.' })).text();
    const failed = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'failed'));
    assert.equal(failed.error, 'Video rendering failed.');
    assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${failed.id}/media`)).status, 404);
  } finally { env.close(); }
});

test('running job exposes phase and reported progress to its own conversation, then serves seekable media', async () => {
  let gate, renderStarted;
  const started = new Promise(r => { renderStarted = r; });
  const videoRender = async (workspace, output, signal, onProgress) => {
    renderStarted();
    onProgress(0.4);
    await new Promise(r => { gate = r; });
    return fakeRender(workspace, output);
  };
  let release;
  const composing = new Promise(r => { release = r; });
  const provider = { generate: async (tree, text, emit) => {
    if (tree.instructions?.includes('Remotion')) { await composing; return complete(emit, composition); }
    complete(emit, 'Sure.' + directive);
  } };
  const env = await open(provider, { videoRender });
  try {
    const tree = env.store.create('Video'), other = env.store.create('Other');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of this.' })).text();
    const state = async () => (await env.get('/api/state')).json();
    const artifact = async id => (await (await env.get(`/api/trees/${id}`)).json()).artifacts[0];
    assert.deepEqual((await state()).videos, [tree.id]);
    assert.deepEqual((await state()).active, []);
    assert.equal((await artifact(tree.id)).phase, 'preparing');
    assert.equal((await artifact(tree.id)).progress, null);
    assert.equal(await artifact(other.id), undefined);
    release();
    await started;
    const rendering = await artifact(tree.id);
    assert.equal(rendering.phase, 'rendering');
    assert.equal(rendering.progress, 0.4);
    const previews = await (await env.get(`/api/previews?id=${tree.id}&id=${other.id}`)).json();
    assert.deepEqual(previews[tree.id].at(-1).artifacts, [{ id: rendering.id, kind: 'video', title: task.title, status: 'pending', phase: 'rendering', progress: 0.4 }]);
    assert.ok(!previews[other.id].some(m => m.artifacts));
    gate();
    await until(() => env.store.artifact(tree.id, rendering.id).status === 'ready');
    assert.deepEqual((await state()).videos, []);
    const ready = await artifact(tree.id);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.phase, undefined);
    const media = `/api/trees/${tree.id}/artifacts/${ready.id}/media`;
    const whole = await env.get(media);
    assert.equal(whole.headers.get('accept-ranges'), 'bytes');
    assert.equal(Buffer.from(await whole.arrayBuffer()).length, mp4.length);
    const part = await fetch(whole.url, { headers: { Range: 'bytes=4-11' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), `bytes 4-11/${mp4.length}`);
    assert.equal(Buffer.from(await part.arrayBuffer()).toString('latin1'), 'ftypisom');
    const tail = await fetch(whole.url, { headers: { Range: 'bytes=-10' } });
    assert.equal(Buffer.from(await tail.arrayBuffer()).length, 10);
    assert.equal((await fetch(whole.url, { headers: { Range: `bytes=${mp4.length}-` } })).status, 416);
  } finally { env.close(); }
});

const repo = fileURLToPath(new URL('..', import.meta.url));
const browser = join(repo, 'node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell');
const sandboxed = spawnSync('bwrap', ['--version']).status === 0 && existsSync(browser);

test('render sandbox hides home and app data, blocks network and confines writes to the workspace', { skip: !sandboxed && 'bwrap or Remotion browser missing' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-sandbox-'));
  const workspace = join(dir, 'video-work', 'attempt');
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(dir, 'trees.sqlite'), 'LEARNING DATA');
  const probe = `const fs = require('fs'); const r = {};
    const tryIt = (k, f) => { try { f(); r[k] = 'allowed'; } catch { r[k] = 'denied'; } };
    tryIt('appData', () => fs.readFileSync(${JSON.stringify(join(dir, 'trees.sqlite'))}));
    tryIt('home', () => fs.readdirSync(${JSON.stringify(join(homedir(), '.claude'))}));
    tryIt('repo', () => fs.readFileSync(${JSON.stringify(join(repo, 'package.json'))}));
    tryIt('writeOutside', () => fs.writeFileSync('/usr/x', ''));
    tryIt('writeWorkspace', () => fs.writeFileSync('ok', ''));
    r.env = Object.keys(process.env).sort().join(',');
    require('net').connect(443, '1.1.1.1').on('connect', () => { r.network = 'allowed'; done(); }).on('error', () => { r.network = 'denied'; done(); });
    function done() { console.log(JSON.stringify(r)); process.exit(0); }`;
  const run = spawnSync('bwrap', [...SANDBOX(workspace), process.execPath, '-e', probe], { encoding: 'utf8', env: {} });
  assert.deepEqual(JSON.parse(run.stdout), { appData: 'denied', home: 'denied', repo: 'denied', writeOutside: 'denied', writeWorkspace: 'allowed', env: 'HOME,PATH,PWD,TMPDIR', network: 'denied' });
});

test('one real short sandboxed Remotion render publishes a ready MP4', { skip: !sandboxed && 'bwrap or Remotion browser missing', timeout: 240000 }, async () => {
  const { result, row, published, dir, phases } = await job(undefined);
  assert.equal(result, null);
  // The real renderer reports progress in 5% steps, ending at 100%.
  assert.deepEqual(phases[0], ['rendering']);
  assert.ok(phases.length > 2 && phases.every(([phase]) => phase === 'rendering'));
  assert.deepEqual(phases.at(-1), ['rendering', 1]);
  assert.equal(row.status, 'ready');
  assert.equal(row.duration, 1);
  assert.equal(published, true);
  assert.equal(readFileSync(mediaPath(dir, row.id)).toString('latin1', 4, 8), 'ftyp');
});

test('cancel stops only its own job, late output cannot publish, and retry reuses the frozen input without a new message', async () => {
  const renders = [], workers = [];
  // Each render waits until the test releases it and ignores cancellation, like output arriving late.
  const videoRender = (workspace, output) => new Promise(done => renders.push(() => { writeFileSync(output, mp4); done({ durationInFrames: 30, fps: 30 }); }));
  const provider = { generate: async (tree, text, emit) => {
    if (!tree.id) { workers.push(text); return complete(emit, composition); }
    complete(emit, /video/.test(text) ? 'Sure.' + directive : 'Answer in another chat.');
  } };
  const env = await open(provider, { videoRender });
  try {
    const a = env.store.create('A'), b = env.store.create('B');
    await (await env.post(`/api/trees/${a.id}/messages`, { text: 'Make a video of A.' })).text();
    await (await env.post(`/api/trees/${b.id}/messages`, { text: 'Make a video of B.' })).text();
    await until(() => renders.length === 2);
    const jobA = env.store.tree(a.id).artifacts[0], jobB = env.store.tree(b.id).artifacts[0];
    const messages = env.store.tree(a.id).messages.length;

    // Cancel is scoped to the owning conversation; another chat stays usable while B runs.
    assert.equal((await env.post(`/api/trees/${b.id}/artifacts/${jobA.id}/cancel`)).status, 404);
    const canceled = await (await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/cancel`)).json();
    assert.equal(canceled.status, 'canceled');
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/cancel`)).status, 409);
    const other = env.store.create('Other');
    assert.match(await (await env.post(`/api/trees/${other.id}/messages`, { text: 'Hello' })).text(), /Answer in another chat/);
    assert.equal(env.store.artifact(b.id, jobB.id).status, 'pending');

    // Retry: same row, new attempt, same frozen input, no learner message added.
    const retried = await (await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).json();
    assert.equal(retried.status, 'pending');
    assert.notEqual(retried.attempt, jobA.attempt);
    assert.equal(retried.input, jobA.input);
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).status, 409); // already running
    await until(() => renders.length === 3);
    assert.deepEqual(workers.slice(-1), [jobA.input]);

    // The canceled attempt's late output arrives first and is ignored; the retry publishes.
    renders[0]();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(env.store.artifact(a.id, jobA.id).status, 'pending');
    assert.equal(existsSync(mediaPath(env.dir, jobA.id)), false);
    renders[2]();
    const ready = await until(() => env.store.artifact(a.id, jobA.id).status === 'ready' && env.store.artifact(a.id, jobA.id));
    assert.equal(ready.attempt, retried.attempt);
    assert.equal(env.store.tree(a.id).messages.length, messages);
    assert.equal(env.store.tree(a.id).artifacts.length, 1);
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).status, 409); // ready media needs no retry
    renders[1]();
    await until(() => env.store.artifact(b.id, jobB.id).status === 'ready');

    // A changed request is a new job.
    await (await env.post(`/api/trees/${a.id}/messages`, { text: 'Make a video of something else.' })).text();
    assert.equal(env.store.tree(a.id).artifacts.length, 2);
  } finally { env.close(); }
});

test('render, composition and save failures stay honest and retry the same request', async () => {
  let fail = true;
  const videoRender = async (ws, output) => { if (fail) throw new Error('Video rendering failed.'); return fakeRender(ws, output); };
  let compose = 0;
  const provider = { generate: async (tree, text, emit) => {
    if (tree.id) return complete(emit, 'Sure.' + directive);
    compose++;
    complete(emit, compose === 2 ? 'not a composition' : composition);
  } };
  const env = await open(provider, { videoRender });
  try {
    const tree = env.store.create('Video');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
    const { id } = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'failed'));
    assert.equal(env.store.artifact(tree.id, id).error, 'Video rendering failed.');
    fail = false;
    await env.post(`/api/trees/${tree.id}/artifacts/${id}/retry`);
    await until(() => env.store.artifact(tree.id, id).status === 'failed');
    assert.equal(env.store.artifact(tree.id, id).error, 'Video composition is missing its description.');
    const finish = env.store.finishVideo.bind(env.store);
    env.store.finishVideo = (c, i, at, result, error) => { if (!error) throw new Error('disk full'); return finish(c, i, at, result, error); };
    await env.post(`/api/trees/${tree.id}/artifacts/${id}/retry`);
    await until(() => env.store.artifact(tree.id, id).status === 'failed');
    assert.equal(env.store.artifact(tree.id, id).error, 'Video could not be saved.');
    assert.equal(existsSync(mediaPath(env.dir, id)), false);
    env.store.finishVideo = finish;
    await env.post(`/api/trees/${tree.id}/artifacts/${id}/retry`);
    await until(() => env.store.artifact(tree.id, id).status === 'ready');
    assert.deepEqual(env.store.tree(tree.id).messages.map(m => m.role), ['user', 'assistant']);
    // Generation errors and work never enter tutor history.
    const history = JSON.stringify(tutorContext(env.store.tree(tree.id)));
    for (const secret of ['rendering failed', 'could not be saved', 'PRIVATE_SOURCE_MARKER', 'not a composition']) assert.ok(!history.includes(secret), secret);
  } finally { env.close(); }
});

test('restart marks unfinished videos interrupted, keeps ready media and offers regeneration for missing files without inference', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-restart-'));
  const path = join(dir, 'trees.sqlite');
  // A database written before the job statuses existed is rebuilt in place.
  const old = new Store(path);
  old.db.exec(`PRAGMA foreign_keys=OFF; DROP TABLE artifacts; CREATE TABLE artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('mermaid','video')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')), title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL);`);
  const tree = old.create('Video');
  const reply = old.message(tree.id, 'assistant', 'Reply.', 'completed');
  const running = old.pendingArtifact(tree.id, reply, 'Running', 'Planned.', 'video', '{"request":"Make a video."}');
  const kept = old.pendingArtifact(tree.id, reply, 'Kept', 'Planned.', 'video', '{}');
  const lost = old.pendingArtifact(tree.id, reply, 'Lost', 'Planned.', 'video', '{}');
  for (const a of [kept, lost]) old.finishVideo(tree.id, a.id, a.attempt, { description: 'Shows boxes.', duration: 1 });
  mkdirSync(join(dir, 'videos'));
  writeFileSync(mediaPath(dir, kept.id), mp4);
  old.close();

  const calls = [];
  const store = new Store(path);
  const app = createApp({ store, provider: { generate: async (...args) => { calls.push(args); complete(args[2], composition); } }, auth: { status: () => ({ connected: true }) }, dir, videoRender: fakeRender });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const saved = await (await fetch(`${origin}/api/trees/${tree.id}`)).json();
    const by = Object.fromEntries(saved.artifacts.map(a => [a.title, a]));
    assert.equal(by.Running.status, 'interrupted');
    assert.equal(by.Kept.status, 'ready');
    assert.equal(by.Kept.available, undefined);
    assert.equal((await fetch(`${origin}/api/trees/${tree.id}/artifacts/${kept.id}/media`)).status, 200);
    assert.equal(by.Lost.status, 'ready');
    assert.equal(by.Lost.available, false);
    const rows = (await (await fetch(`${origin}/api/previews?id=${tree.id}`)).json())[tree.id].at(-1).artifacts;
    assert.deepEqual(rows.map(a => [a.title, a.status, a.available]), [['Running', 'interrupted', undefined], ['Kept', 'ready', undefined], ['Lost', 'ready', false]]);
    assert.equal(calls.length, 0); // reopening never replays inference
    const post = id => fetch(`${origin}/api/trees/${tree.id}/artifacts/${id}/retry`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: '{}' });
    assert.equal((await post(kept.id)).status, 409);
    assert.equal((await post(lost.id)).status, 200);
    assert.equal((await post(running.id)).status, 200);
    await until(() => store.tree(tree.id).artifacts.every(a => a.status === 'ready'));
    assert.equal(calls.length, 2);
    assert.equal(calls.find(c => c[1].includes('Make a video.'))?.[1], running.input);
    assert.ok(existsSync(mediaPath(dir, lost.id)));
  } finally { app.stop(); store.close(); }
});

test('stopping the app during a job leaves it interrupted on the next start', async () => {
  let started;
  const rendering = new Promise(r => { started = r; });
  const videoRender = (ws, output, signal) => new Promise((_, reject) => { started(); signal.addEventListener('abort', () => reject(signal.reason)); });
  const env = await open({ generate: async (tree, text, emit) => complete(emit, tree.id ? 'Sure.' + directive : composition) }, { videoRender });
  const tree = env.store.create('Video');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  await rendering;
  env.app.stop();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(env.store.tree(tree.id).artifacts[0].status, 'pending');
  env.store.close();
  const reopened = new Store(join(env.dir, 'trees.sqlite'));
  assert.equal(reopened.tree(tree.id).artifacts[0].status, 'interrupted');
  reopened.close();
});
