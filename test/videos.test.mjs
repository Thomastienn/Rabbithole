import { test } from 'node:test';
import { fakeNarration } from './fake-narration.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { RenderInternals } from '@remotion/renderer';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { tutorContext } from '../server/diagrams.mjs';
import { generateVideo, videoSource, mediaPath, SANDBOX } from '../server/videos.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { OpenAI } from '../server/openai.mjs';
import { fakeOpenAI, streamReply } from './fake-openai.mjs';

const task = { title: 'Winners advance', description: 'Two winners meet in the final.', intent: 'Animate two winners advancing.', excerpt: 'A and B advance to the final.' };
const directive = '\n```treetutor-video\n' + JSON.stringify(task) + '\n```';
const composition = `// Description: Two labelled boxes slide together into a final box.
// Narration: "Winners advance."
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
// PRIVATE_SOURCE_MARKER
export const durationInFrames = 30;
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: 'white', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 20], [0, 1]) }}>A + B → Final</AbsoluteFill>;
}`;
const spatial = `// Description: A lit cube rotates in 3D space.
// Narration: "A cube turns."
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: '#102030' }}><ThreeCanvas width={640} height={360} camera={{ position: [0, 0, 4] }}>
    <ambientLight intensity={0.5} /><directionalLight position={[2, 2, 3]} />
    <mesh rotation={[frame / 20, frame / 15, 0]}><boxGeometry args={[1.4, 1.4, 1.4]} /><meshStandardMaterial color="orange" /></mesh>
  </ThreeCanvas></AbsoluteFill>;
}`;
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4096, 1)]);
const fakeRender = async (workspace, output) => { writeFileSync(output, mp4); return { durationInFrames: 60, fps: 30 }; };
const complete = (emit, text) => { emit({ type: 'item', item: 'answer', text }); emit({ type: 'status', status: 'completed' }); };
const until = async check => { for (let i = 0; i < 200; i++) { const value = await check(); if (value) return value; await new Promise(r => setTimeout(r, 25)); } throw new Error('timed out'); };

async function open(provider, options = {}) {
  provider = { models: async () => [{ model: 'fixture-model', isDefault: true }], ...provider };
  const dir = mkdtempSync(join(tmpdir(), 'tt-videos-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) }, dir, videoRender: fakeRender, videoNarrate: fakeNarration, ...options });
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
  const tutor = [], workers = [], suggestions = [];
  const provider = { generate: async (tree, text, emit) => {
    if (tree.instructions?.includes('Remotion')) { workers.push({ tree, text }); return complete(emit, composition); }
    if (text.startsWith('Mark every term')) { suggestions.push(text); return complete(emit, '{"suggestions":[]}'); }
    tutor.push({ tree, text });
    if (text.startsWith('Compact')) return complete(emit, 'Compact summary.');
    complete(emit, text.startsWith('Thanks') ? 'Continuing.' : 'Here is the idea.' + directive);
  } };
  const env = await open(provider, { suggestions: true });
  env.store.saveSuggestionSettings({ enabled: true, model: { provider: 'codex', model: 'fixture-model' }, effort: null });
  try {
    const parent = env.store.create('Parent');
    env.store.message(parent.id, 'user', 'UNRELATED SIBLING DISCUSSION', 'completed');
    const parentReply = env.store.message(parent.id, 'assistant', 'Peterson locks use a tournament tree.', 'completed');
    const child = env.store.branch(env.store.tree(parent.id), { messageId: parentReply, start: 0, end: 8, text: 'Peterson', question: 'How does Peterson fit?' }, 'Inherited snapshot.');
    env.store.saveChatSettings({ provider: 'codex', model: 'fixture-model', effort: null });
    env.store.model(child.id, 'conversation-only-model');

    // An ordinary explanation never starts a video, even if the tutor emits a block.
    for (const text of ['Explain winners.', 'Explain video encoding.', 'How does animation work?', "Don’t make a video; explain it."]) {
      await (await env.post(`/api/trees/${child.id}/messages`, { text })).text();
    }
    assert.equal(env.store.tree(child.id).artifacts.length, 4);
    assert.ok(env.store.tree(child.id).artifacts.every(a => a.kind === 'video' && a.status === 'failed' && /learner did not ask/.test(a.error)), 'unsolicited requests stay visible without starting generation');
    assert.equal(workers.length, 0);

    const request = 'Make a video explaining how Peterson fits into this tournament tree.';
    const stream = await (await env.post(`/api/trees/${child.id}/messages`, { text: request })).text();
    assert.ok(!stream.includes('treetutor-video'));
    const ready = await until(() => env.store.tree(child.id).artifacts.find(a => a.status === 'ready'));
    const saved = env.store.tree(child.id);
    assert.equal(saved.artifacts.length, 5);
    assert.equal(ready.kind, 'video');
    assert.equal(ready.source, null);
    assert.equal(ready.duration, 2);
    assert.equal(ready.description, 'Two labelled boxes slide together into a final box.');
    const [user, reply] = saved.messages.slice(-2);
    assert.equal(ready.message, reply.id);
    const input = JSON.parse(ready.input);
    assert.deepEqual(input, { selection: { provider: 'codex', model: 'fixture-model', effort: null }, request, intent: task.intent, excerpt: task.excerpt,
      inheritedContext: { snapshot: 'Inherited snapshot.', selectedPassage: 'Peterson', question: 'How does Peterson fit?' },
      sources: { conversation: child.id, requestMessage: user.id, replyMessage: reply.id, parentConversation: parent.id, parentMessage: parentReply } });

    // The worker receives only the frozen input, in a fresh session, with its own instructions.
    assert.equal(workers.length, 1);
    assert.equal(workers[0].text, ready.input);
    assert.deepEqual(Object.keys(workers[0].tree).sort(), ['effort', 'instructions', 'model', 'provider', 'thread']);
    assert.equal(workers[0].tree.thread, null);
    assert.match(workers[0].tree.instructions, /2D for ordinary explanations[\s\S]*3D whenever the subject involves spatial relationships[\s\S]*When the learner or intent asks for 2D or 3D, follow it/);
    assert.match(workers[0].tree.instructions, /"@remotion\/three"/);
    assert.equal(workers[0].tree.model, 'fixture-model', 'smart follows the global default rather than the conversation override');
    assert.ok(!workers[0].text.includes('UNRELATED SIBLING DISCUSSION'));

    // Media is served same-origin only for its owning conversation; private output was moved out.
    const media = await env.get(`/api/trees/${child.id}/artifacts/${ready.id}/media`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), mp4);
    assert.equal((await env.get(`/api/trees/${parent.id}/artifacts/${ready.id}/media`)).status, 404);
    assert.deepEqual(readdirSync(join(env.dir, 'video-work', ready.id, ready.attempt)).sort(), ['Video.tsx', 'index.tsx', 'kit.tsx', 'narration.json', 'public']);
    assert.ok(readFileSync(join(env.dir, 'video-work', ready.id, ready.attempt, 'Video.tsx'), 'utf8').includes('PRIVATE_SOURCE_MARKER'));

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
    assert.ok(suggestions.some(text => text.includes('Continuing.')));
    for (const history of suggestions) for (const secret of ['PRIVATE_SOURCE_MARKER', 'Remotion', 'video-work', ready.attempt, ready.input]) assert.ok(!history.includes(secret), secret);
  } finally { env.close(); }
});

test('video HTTP requests route smart model and effort through the real Claude/Codex adapters in fresh sessions', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-adapters-')), traffic = [];
  const launch = (command, args, options) => {
    const call = { command, args, input: [] }; traffic.push(call);
    const child = spawn(process.execPath, ['test/protocol-fixture.mjs', ...(command === 'claude' ? args : [])], { ...options, cwd: process.cwd() });
    if (command === 'codex') {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = data => { call.input.push(JSON.parse(data)); return write(data); };
    } else {
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = text => { call.text = text; return end(text); };
    }
    return child;
  };
  const providers = { claude: new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}')),
    codex: new Codex({ token: async () => 'fixture-token' }, dir, launch) };
  const env = await open(null, { providers });
  t.after(async () => { await env.app.stop(); env.store.close(); });
  for (const [provider, model] of [['claude', 'sonnet'], ['codex', 'fixture-model']]) {
    assert.equal((await env.post('/api/settings/smart', { model: { provider, model }, followEffort: false, effort: 'high' })).status, 200);
    const tree = env.store.create('Video adapters', 'codex', 'fixture-model', 'low');
    const stream = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video fixture request' })).text();
    const ready = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'ready'));
    const input = JSON.parse(ready.input);
    assert.deepEqual(input.selection, { provider, model, effort: 'high' });
    assert.ok(!stream.includes('PRIVATE_VIDEO') && !stream.includes('selection') && !stream.includes('attempt'));
    if (provider === 'claude') {
      const worker = traffic.filter(c => c.command === 'claude').at(-1);
      assert.equal(worker.args[worker.args.indexOf('--model') + 1], model);
      assert.equal(worker.args[worker.args.indexOf('--effort') + 1], 'high');
      assert.ok(worker.args.includes('--session-id') && !worker.args.includes('--resume'));
      assert.equal(worker.args[worker.args.indexOf('--tools') + 1], '');
      assert.equal(worker.text, ready.input);
    } else {
      const requests = traffic.flatMap(c => c.input), worker = requests.findLast(c => c.method === 'thread/start');
      assert.equal(worker.params.model, model);
      assert.match(worker.params.baseInstructions, /Privately develop an educational script and visual plan/);
      assert.equal(requests.findLast(c => c.method === 'turn/start').params.effort, 'high');
      assert.equal(requests.findLast(c => c.method === 'turn/start').params.input[0].text, ready.input);
    }
    assert.equal(env.store.tree(tree.id).effort, 'low', 'worker effort never overwrites chat');
    assert.ok(!JSON.stringify(tutorContext(env.store.tree(tree.id))).includes('PRIVATE_VIDEO'));
    assert.deepEqual(env.store.usageEvents().events.filter(e => e.task === 'video').at(-1).provider, provider);
  }
});

test('custom smart worker freezes inputs across Settings changes and explicit Retry, hides production, and never falls back', async t => {
  const fake = await fakeOpenAI(t), endpoint = new OpenAI(mkdtempSync(join(tmpdir(), 'tt-video-endpoint-')));
  fake.models[0].supported_reasoning_efforts = ['low', 'high'];
  const tutor = { models: async () => [{ model: 'chat-model', isDefault: true, efforts: ['low', 'high'] }], generate: async (tree, text, emit) => {
    assert.ok(tree.id, 'the chat provider must never receive a video worker');
    complete(emit, 'Here is the idea.' + directive);
  } };
  let release, upstream;
  fake.reply = (_req, res, body) => { upstream = body; release = () => streamReply(res, [composition]); };
  const env = await open(tutor, { endpoint });
  t.after(async () => { await env.app.stop(); env.store.close(); });
  await env.post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'video-smart-fixture' });
  await env.post('/api/settings/chat', { provider: 'codex', model: 'chat-model', effort: 'low' });
  assert.equal((await env.post('/api/settings/smart', { model: { provider: 'openai', model: 'local-tutor' }, followEffort: false, effort: 'high' })).status, 200);
  assert.equal(fake.calls.filter(c => c.body).length, 0, 'configuring roles makes no inference call');
  const tree = env.store.create('Frozen', 'codex', 'chat-model', 'low');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of this.' })).text();
  await until(() => upstream);
  const original = env.store.tree(tree.id).artifacts[0], input = JSON.parse(original.input);
  assert.deepEqual(input.selection, { provider: 'openai', model: 'local-tutor', effort: 'high' });
  assert.equal(upstream.model, 'local-tutor'); assert.equal(upstream.reasoning_effort, 'high');
  assert.deepEqual(upstream.messages.map(m => m.role), ['system', 'user']);
  assert.equal(upstream.messages[1].content, original.input);
  assert.equal((await env.post('/api/settings/smart', { model: null, followEffort: true })).status, 200);
  await env.post('/api/settings/chat', { provider: 'codex', model: 'chat-model', effort: 'high' });
  assert.equal(env.store.artifact(tree.id, original.id).input, original.input);
  // Finishing uses the frozen selection; private work stays outside every public representation.
  release();
  await until(() => env.store.artifact(tree.id, original.id).status === 'ready');
  assert.equal(fake.calls.filter(c => c.body).length, 1);
  for (const path of [`/api/trees/${tree.id}`, `/api/trees/${tree.id}/artifacts/${original.id}`, `/api/previews?id=${tree.id}`]) {
    const visible = await (await env.get(path)).text();
    for (const secret of ['PRIVATE_SOURCE_MARKER', original.input, original.attempt, 'video-work', 'phase', 'progress']) assert.ok(!visible.includes(secret), secret);
  }
  // A separate failed attempt stays failed until explicit Retry and keeps the original smart pin.
  await env.post('/api/settings/smart', { model: { provider: 'openai', model: 'local-tutor' }, followEffort: false, effort: 'high' });
  fake.reply = (_req, res) => streamReply(res, ['invalid PRIVATE_SCRIPT']);
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video again.' })).text();
  const failed = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'failed'));
  const count = fake.calls.filter(c => c.body).length;
  await new Promise(r => setTimeout(r, 80));
  assert.equal(fake.calls.filter(c => c.body).length, count);
  await env.post('/api/settings/smart', { model: null, followEffort: true });
  fake.reply = (_req, res) => streamReply(res, [composition]);
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  await until(() => env.store.artifact(tree.id, failed.id).status === 'ready');
  assert.equal(fake.calls.filter(c => c.body).at(-1).body.reasoning_effort, 'high');
  assert.equal(fake.calls.filter(c => c.body).length, count + 1);
  // A cleared endpoint is an explicit failure, even though chat remains connected and Settings now follow it.
  env.store.cancelVideo(tree.id, env.store.pendingArtifact(tree.id, failed.message, 'Offline', 'Offline', 'video', failed.input).id);
  const offline = env.store.tree(tree.id).artifacts.at(-1);
  await env.post('/api/settings/endpoint/clear');
  await env.post(`/api/trees/${tree.id}/artifacts/${offline.id}/retry`);
  await until(() => env.store.artifact(tree.id, offline.id).status === 'failed');
  assert.equal(fake.calls.filter(c => c.body).length, count + 1);
});

async function job(render, mutate, source = composition) {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-job-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const tree = store.create('Video');
  const message = store.message(tree.id, 'assistant', 'Reply.', 'completed');
  const artifact = store.pendingArtifact(tree.id, message, 'Title', 'Planned.', 'video', '{"request":"Make a video."}');
  mutate?.(store, artifact, dir);
  const provider = { generate: async (t, text, emit) => complete(emit, source) };
  const phases = [];
  const result = await generateVideo({ provider, selection: {}, store, dir, artifact, signal: new AbortController().signal, render, narrate: fakeNarration, onPhase: (...p) => phases.push(p) }).then(() => null, error => error.message);
  assert.ok(!existsSync(join(dir, 'video-work', artifact.id, artifact.attempt, 'out'))); // no leftover unpublished output
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

  // Queue cancellation at the publication boundary; if still pending, a new attempt owns different ready media.
  let replacement;
  const newerMedia = Buffer.concat([mp4, Buffer.from('new attempt')]);
  const racing = await job(fakeRender, (store, artifact, dir) => {
    const lookup = store.artifact.bind(store);
    let queued = false;
    store.artifact = (...args) => {
      const row = lookup(...args);
      if (!queued && row?.status === 'pending') {
        queued = true;
        queueMicrotask(() => {
          if (lookup(...args)?.status !== 'pending') return;
          store.cancelVideo(...args); replacement = store.retryVideo(...args);
          mkdirSync(join(dir, 'videos'), { recursive: true });
          writeFileSync(mediaPath(dir, artifact.id), newerMedia);
          store.finishVideo(...args, replacement.attempt, { description: 'New attempt.', duration: 1 });
        });
      }
      return row;
    };
  });
  assert.equal(racing.row.status, 'ready');
  assert.deepEqual(readFileSync(mediaPath(racing.dir, racing.row.id)), replacement ? newerMedia : mp4, 'a superseded attempt must never overwrite newer ready media');

  for (const bad of [composition.replace("from 'remotion'", "from '../../trees.sqlite'"), composition + "\nfetch('x');", composition + "\nconst m = import('fs');", composition.replace('// Description: ', '// '), composition + '\n<Img src="https://example.com/a.png" />',
    spatial.replace("from '@remotion/three'", "from '@react-three/drei'"), spatial + "\nnew TextureLoader().load('x.png');", spatial + "\nuseLoader(GLTFLoader, 'm.glb');"])
    assert.throws(() => videoSource(bad));
  assert.equal(videoSource(spatial + "\nimport * as THREE from 'three';\nimport { useThree } from '@react-three/fiber';").description, 'A lit cube rotates in 3D space.');
  assert.equal(videoSource('```tsx\n' + composition + '\n```').description, 'Two labelled boxes slide together into a final box.');
  const [description, narration, ...code] = composition.split('\n');
  assert.ok(!videoSource([description, narration, '```tsx', ...code, '```'].join('\n')).source.includes('`'), 'a fence after the header lines is not compiled as code');
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

test('failed or timed-out script calls stay final; only explicit Retry calls again and late script output is ignored', async () => {
  for (const timeout of [false, true]) {
    let calls = 0, renders = 0, late;
    const env = await open({ generate: async (tree, text, emit) => {
      if (tree.id) return complete(emit, 'Here.' + directive);
      if (++calls === 1) {
        if (timeout) await new Promise(r => { late = () => { complete(emit, composition); r(); }; });
        else emit({ type: 'status', status: 'failed' });
        return;
      }
      complete(emit, composition);
    } }, { videoTimeout: timeout ? 50 : 1000, videoRender: async (...args) => { renders++; return fakeRender(...args); } });
    try {
      const tree = env.store.create('Script failure');
      await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
      const failed = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'failed'));
      await new Promise(r => setTimeout(r, 80));
      assert.equal(calls, 1); assert.equal(renders, 0);
      assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${failed.id}/media`)).status, 404);
      await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
      await until(() => env.store.artifact(tree.id, failed.id).status === 'ready');
      late?.(); await new Promise(r => setImmediate(r));
      assert.equal(calls, 2); assert.equal(renders, 1);
      assert.equal(env.store.artifact(tree.id, failed.id).status, 'ready');
    } finally { env.close(); }
  }
});

test('cancel during smart capability lookup prevents inference, including a late successful lookup', async () => {
  let release, calls = 0;
  const env = await open({ models: () => new Promise(r => { release = () => r([{ model: 'smart-model', isDefault: true }]); }), generate: async (tree, text, emit) => {
    if (!tree.id) calls++;
    complete(emit, 'Here.' + directive);
  } });
  try {
    env.store.saveSmartSettings({ model: { provider: 'codex', model: 'smart-model' }, followEffort: false, effort: null });
    const tree = env.store.create('Cancel lookup', 'codex', 'chat-model');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
    await until(() => release);
    const job = env.store.tree(tree.id).artifacts[0];
    await env.post(`/api/trees/${tree.id}/artifacts/${job.id}/cancel`);
    release(); await new Promise(r => setTimeout(r, 30));
    assert.equal(calls, 0);
    assert.equal(env.store.artifact(tree.id, job.id).status, 'canceled');
    assert.equal(existsSync(mediaPath(env.dir, job.id)), false);
  } finally { env.close(); }
});

test('inline video exposes bounded live progress and its position, keeps inputs private, then serves seekable media', async () => {
  let gate, renderStarted;
  const started = new Promise(r => { renderStarted = r; });
  let progress;
  const videoRender = async (workspace, output, signal, onProgress) => {
    progress = onProgress;
    renderStarted();
    onProgress(0.4);
    await new Promise(r => { gate = r; });
    return fakeRender(workspace, output);
  };
  let release;
  const composing = new Promise(r => { release = r; });
  const provider = { generate: async (tree, text, emit) => {
    if (tree.instructions?.includes('Remotion')) { await composing; return complete(emit, composition); }
    complete(emit, 'Before.\n' + directive + '\n\nAfter.');
  } };
  const env = await open(provider, { videoRender });
  try {
    const tree = env.store.create('Video'), other = env.store.create('Other');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of this.' })).text();
    const state = async () => (await env.get('/api/state')).json();
    const artifact = async id => (await (await env.get(`/api/trees/${id}`)).json()).artifacts[0];
    assert.deepEqual((await state()).videos, [tree.id]);
    assert.deepEqual((await state()).active, []);
    const pending = await artifact(tree.id);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.position, 8);
    assert.equal(pending.phase, 'creating');
    for (const key of ['progress', 'input', 'attempt']) assert.equal(pending[key], undefined);
    const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
    assert.equal(saved.messages.at(-1).text, 'Before.\n\n\nAfter.');
    assert.equal(await artifact(other.id), undefined);
    release();
    await started;
    const rendering = await artifact(tree.id);
    assert.equal(rendering.status, 'pending');
    assert.equal(rendering.phase, 'rendering');
    assert.equal(rendering.progress, 0.4);
    assert.equal(rendering.position, pending.position);
    for (const key of ['input', 'attempt']) assert.equal(rendering[key], undefined);
    const own = `/api/trees/${tree.id}/artifacts/${rendering.id}`;
    assert.equal((await (await env.get(own)).json()).progress, 0.4);
    assert.equal((await env.get(`/api/trees/${other.id}/artifacts/${rendering.id}`)).status, 404);
    progress(3);
    assert.equal((await artifact(tree.id)).progress, 1);
    progress(-1);
    assert.equal((await artifact(tree.id)).progress, 0);
    progress(NaN);
    assert.equal((await artifact(tree.id)).progress, undefined);
    const previews = await (await env.get(`/api/previews?id=${tree.id}&id=${other.id}`)).json();
    assert.deepEqual(previews[tree.id].at(-1).artifacts, [{ id: rendering.id, kind: 'video', title: task.title, status: 'pending' }]);
    assert.ok(!previews[other.id].some(m => m.artifacts));
    gate();
    await until(() => env.store.artifact(tree.id, rendering.id).status === 'ready');
    await until(async () => !(await state()).videos.length);
    assert.deepEqual((await state()).videos, []);
    const ready = await artifact(tree.id);
    assert.equal(ready.status, 'ready');
    assert.equal(ready.phase, undefined);
    assert.equal(ready.progress, undefined);
    assert.equal(ready.position, pending.position);
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
  const workspace = join(dir, 'video-work', 'artifact', 'attempt');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(join(workspace, 'public'));
  writeFileSync(join(workspace, 'public', 'narration.mp3'), 'OWNED AUDIO');
  writeFileSync(join(workspace, 'narration.json'), '{}');
  writeFileSync(join(dir, 'trees.sqlite'), 'LEARNING DATA');
  const probe = `const fs = require('fs'); const r = {};
    const tryIt = (k, f) => { try { f(); r[k] = 'allowed'; } catch { r[k] = 'denied'; } };
    tryIt('appData', () => fs.readFileSync(${JSON.stringify(join(dir, 'trees.sqlite'))}));
    tryIt('home', () => fs.readdirSync(${JSON.stringify(join(homedir(), '.claude'))}));
    tryIt('repo', () => fs.readFileSync(${JSON.stringify(join(repo, 'package.json'))}));
    tryIt('writeOutside', () => fs.writeFileSync('/usr/x', ''));
    tryIt('writeWorkspace', () => fs.writeFileSync('ok', ''));
    r.audio = fs.readFileSync('public/narration.mp3', 'utf8');
    tryIt('mutateAudio', () => fs.writeFileSync('public/narration.mp3', 'changed'));
    tryIt('mutateTiming', () => fs.writeFileSync('narration.json', 'changed'));
    r.env = Object.keys(process.env).sort().join(',');
    require('net').connect(443, '1.1.1.1').on('connect', () => { r.network = 'allowed'; done(); }).on('error', () => { r.network = 'denied'; done(); });
    function done() { console.log(JSON.stringify(r)); process.exit(0); }`;
  const run = spawnSync('bwrap', [...SANDBOX(workspace), process.execPath, '-e', probe], { encoding: 'utf8', env: {} });
  assert.deepEqual(JSON.parse(run.stdout), { appData: 'denied', home: 'denied', repo: 'denied', writeOutside: 'denied', writeWorkspace: 'allowed', audio: 'OWNED AUDIO', mutateAudio: 'denied', mutateTiming: 'denied', env: 'HOME,PATH,PWD,TMPDIR', network: 'denied' });
});

test('one real short sandboxed Remotion render publishes a ready MP4', { skip: !sandboxed && 'bwrap or Remotion browser missing', timeout: 240000 }, async () => {
  const { result, row, published, dir, phases } = await job(undefined);
  assert.equal(result, null);
  // The real renderer reports progress in 5% steps, ending at 100%.
  assert.deepEqual(phases[0], ['rendering']);
  assert.ok(phases.length > 2 && phases.every(([phase]) => phase === 'rendering'));
  assert.deepEqual(phases.at(-1), ['rendering', 1]);
  assert.equal(row.status, 'ready');
  assert.equal(row.duration, 2);
  assert.equal(published, true);
  assert.equal(readFileSync(mediaPath(dir, row.id)).toString('latin1', 4, 8), 'ftyp');
});

test('one real short sandboxed Three.js scene renders through the same isolated Remotion path', { skip: !sandboxed && 'bwrap or Remotion browser missing', timeout: 240000 }, async () => {
  const { result, row, dir } = await job(undefined, undefined, spatial);
  assert.equal(result, null);
  assert.equal(row.status, 'ready');
  // A non-blank WebGL frame: the orange cube is drawn, not just the background.
  const ffmpeg = RenderInternals.getExecutablePath({ type: 'ffmpeg', indent: false, logLevel: 'error', binariesDirectory: null });
  const png = execFileSync(ffmpeg, ['-v', 'error', '-ss', '1', '-i', mediaPath(dir, row.id), '-frames:v', '1', '-vf', 'crop=2:2:320:180,format=rgb24', '-f', 'image2pipe', '-c:v', 'png', '-']);
  const idat = png.indexOf('IDAT'), [, r, g, b] = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  assert.ok(r > 120 && b < 80, `expected cube colour at the centre, got ${[r, g, b]}`);
});

test('cancel stops only its own job, late output cannot publish, and retry reuses the frozen input without a new message', async () => {
  const renders = [], workers = [], progress = [];
  // Each render waits until the test releases it and ignores cancellation, like output arriving late.
  const videoRender = (workspace, output, signal, onProgress) => {
    progress.push(onProgress);
    return new Promise(done => renders.push(() => { writeFileSync(output, mp4); done({ durationInFrames: 60, fps: 30 }); }));
  };
  const provider = { generate: async (tree, text, emit) => {
    if (!tree.id) { workers.push(text); return complete(emit, composition); }
    complete(emit, /video/.test(text) ? 'Sure.' + directive : 'Answer in another chat.');
  } };
  const env = await open(provider, { videoRender });
  try {
    const a = env.store.create('A'), b = env.store.create('B');
    await (await env.post(`/api/trees/${a.id}/messages`, { text: 'Make a video of A.' })).text();
    await until(() => renders.length === 1); // Jobs are detached; renders[0] must be A's.
    await (await env.post(`/api/trees/${b.id}/messages`, { text: 'Make a video of B.' })).text();
    await until(() => renders.length === 2);
    const jobA = env.store.tree(a.id).artifacts[0], jobB = env.store.tree(b.id).artifacts[0];
    const messages = env.store.tree(a.id).messages.length;

    // Cancel is scoped to the owning conversation; another chat stays usable while B runs.
    assert.equal((await env.post(`/api/trees/${b.id}/artifacts/${jobA.id}/cancel`)).status, 404);
    const canceled = await (await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/cancel`)).json();
    assert.equal(canceled.status, 'canceled');
    assert.equal(canceled.position, jobA.position);
    assert.equal(canceled.phase, undefined);
    assert.equal(canceled.progress, undefined);
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/cancel`)).status, 409);
    const other = env.store.create('Other');
    assert.match(await (await env.post(`/api/trees/${other.id}/messages`, { text: 'Hello' })).text(), /Answer in another chat/);
    assert.equal(env.store.artifact(b.id, jobB.id).status, 'pending');

    // Retry: same row, new attempt, same frozen input, no learner message added.
    const response = await (await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).json();
    assert.equal(response.input, undefined);
    assert.equal(response.attempt, undefined);
    assert.equal(response.position, jobA.position);
    assert.equal(response.phase, 'creating');
    assert.equal(response.progress, undefined);
    const retried = env.store.artifact(a.id, jobA.id);
    assert.equal(retried.status, 'pending');
    assert.notEqual(retried.attempt, jobA.attempt);
    assert.equal(retried.input, jobA.input);
    assert.equal((await env.post(`/api/trees/${a.id}/artifacts/${jobA.id}/retry`)).status, 409); // already running
    await until(() => renders.length === 3);
    assert.deepEqual(workers.slice(-1), [jobA.input]);
    progress[2](0.5);
    progress[0](0.9); // The canceled attempt cannot overwrite the new attempt's progress.
    assert.equal((await (await env.get(`/api/trees/${a.id}/artifacts/${jobA.id}`)).json()).progress, 0.5);
    assert.equal((await (await env.get(`/api/trees/${b.id}/artifacts/${jobB.id}`)).json()).progress, undefined);

    // The canceled attempt's late output arrives first and is ignored; the retry publishes.
    renders[0]();
    await new Promise(r => setTimeout(r, 100));
    assert.equal(env.store.artifact(a.id, jobA.id).status, 'pending');
    assert.equal(existsSync(mediaPath(env.dir, jobA.id)), false);
    renders[2]();
    const ready = await until(() => env.store.artifact(a.id, jobA.id).status === 'ready' && env.store.artifact(a.id, jobA.id));
    assert.equal(ready.attempt, retried.attempt);
    assert.equal(ready.position, jobA.position);
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
  old.db.exec(`PRAGMA user_version=0; PRAGMA foreign_keys=OFF; DROP TABLE artifacts; CREATE TABLE artifacts (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES trees(id), message TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('mermaid','video')), status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')), title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, error TEXT, created INTEGER NOT NULL, input TEXT, attempt TEXT, duration REAL, position INTEGER);`);
  const tree = old.create('Video');
  const reply = old.message(tree.id, 'assistant', 'Reply.', 'completed');
  const running = old.pendingArtifact(tree.id, reply, 'Running', 'Planned.', 'video', '{"request":"Make a video."}', 3);
  const kept = old.pendingArtifact(tree.id, reply, 'Kept', 'Planned.', 'video', '{}');
  const lost = old.pendingArtifact(tree.id, reply, 'Lost', 'Planned.', 'video', '{}');
  for (const a of [kept, lost]) old.finishVideo(tree.id, a.id, a.attempt, { description: 'Shows boxes.', duration: 1 });
  mkdirSync(join(dir, 'videos'));
  writeFileSync(mediaPath(dir, kept.id), mp4);
  old.close();

  const calls = [];
  const store = new Store(path);
  const app = createApp({ store, provider: { models: async () => [{ model: 'fixture-model', isDefault: true }], generate: async (...args) => { calls.push(args); complete(args[2], composition); } }, auth: { status: () => ({ connected: true }) }, dir, videoRender: fakeRender, videoNarrate: fakeNarration });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const saved = await (await fetch(`${origin}/api/trees/${tree.id}`)).json();
    const by = Object.fromEntries(saved.artifacts.map(a => [a.title, a]));
    assert.equal(by.Running.status, 'interrupted');
    assert.equal(by.Running.position, 3);
    assert.equal(by.Running.phase, undefined);
    assert.equal(by.Running.progress, undefined);
    assert.equal(by.Kept.status, 'ready');
    assert.equal(by.Kept.position, null);
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
    assert.equal(JSON.parse(calls.find(c => c[1].includes('Make a video.'))?.[1]).request, JSON.parse(running.input).request);
    assert.ok(existsSync(mediaPath(dir, lost.id)));
    assert.equal(store.artifact(tree.id, running.id).position, 3);
  } finally { app.stop(); store.close(); }
});

test('stopping the app during a job marks it interrupted before exit and keeps it interrupted on restart', async () => {
  let started;
  const rendering = new Promise(r => { started = r; });
  const videoRender = (ws, output, signal) => new Promise((_, reject) => { started(); signal.addEventListener('abort', () => reject(signal.reason)); });
  const env = await open({ generate: async (tree, text, emit) => complete(emit, tree.id ? 'Sure.' + directive : composition) }, { videoRender });
  const tree = env.store.create('Video');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  await rendering;
  await env.app.stop();
  assert.equal(env.store.tree(tree.id).artifacts[0].status, 'interrupted');
  env.store.close();
  const reopened = new Store(join(env.dir, 'trees.sqlite'));
  assert.equal(reopened.tree(tree.id).artifacts[0].status, 'interrupted');
  reopened.close();
});

test('narration stages measured audio, returned timings and subtitles without exposing production or adding model calls', async t => {
  let calls = 0, speech = 0, captured;
  const env = await open({ generate: async (tree, text, emit) => {
    if (!tree.id) calls++;
    complete(emit, tree.id ? 'Watch.' + directive : composition);
  } }, { videoNarrate: async (script, signal) => {
    speech++; assert.equal(script, 'Winners advance.'); assert.equal(signal.aborted, false);
    return { ...await fakeNarration(), duration: 999 }; // Ignore the client's estimated duration.
  }, videoRender: async (workspace, output) => {
    captured = JSON.parse(readFileSync(join(workspace, 'narration.json')));
    assert.equal(captured.durationInFrames, 60);
    assert.equal(captured.sentences[0].endFrame, 54);
    assert.match(readFileSync(join(workspace, 'index.tsx'), 'utf8'), /durationInFrames=\{timing.durationInFrames\}/);
    return fakeRender(workspace, output);
  } });
  t.after(async () => { await env.app.stop(); env.store.close(); });
  const tree = env.store.create('Narration');
  const stream = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a narrated video.' })).text();
  const ready = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'ready'));
  const workspace = join(env.dir, 'video-work', ready.id, ready.attempt);
  assert.deepEqual(JSON.parse(readFileSync(join(workspace, 'public', 'timing.json'))).captions, captured.captions);
  assert.match(readFileSync(join(workspace, 'public', 'captions.vtt'), 'utf8'), /00:00:00.000 --> 00:00:01.800\nWinners advance\./);
  assert.equal(readFileSync(join(workspace, 'public', 'narration.mp3')).length, (await fakeNarration()).audio.length);
  assert.ok(!stream.includes('Narration:'));
  const publicData = await (await env.get(`/api/trees/${tree.id}`)).text();
  for (const secret of ['Narration:', 'startFrame', 'sentenceBoundaries', 'narration.mp3', ready.attempt]) assert.ok(!publicData.includes(secret));
  assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${ready.id}/media`)).status, 200);
  assert.equal(calls, 1); assert.equal(speech, 1);
});

test('TTS failure and invalid returned timing stay final until explicit Retry; cancel rejects late speech and preserves attempt ownership', async t => {
  let calls = 0, speech = 0, renders = 0, release, mode = 'failure';
  const env = await open({ generate: async (tree, text, emit) => { if (!tree.id) calls++; complete(emit, tree.id ? 'Watch.' + directive : composition); } }, {
    videoNarrate: async () => {
      speech++;
      if (mode === 'failure') throw new Error('Video narration failed.');
      if (mode === 'late') return new Promise(r => { release = async () => r(await fakeNarration()); });
      if (mode === 'invalid') return { ...await fakeNarration(), wordBoundaries: [{ offset: -1, duration: 1, text: 'bad' }] };
      return fakeNarration();
    }, videoRender: async (...args) => { renders++; return fakeRender(...args); },
  });
  t.after(async () => { await env.app.stop(); env.store.close(); });
  const tree = env.store.create('Failure');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  const failed = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'failed'));
  await new Promise(r => setTimeout(r, 80));
  assert.equal(speech, 1); assert.equal(calls, 1); assert.equal(renders, 0);
  mode = 'invalid';
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  await until(() => env.store.artifact(tree.id, failed.id).status === 'failed');
  assert.equal(speech, 2); assert.equal(renders, 0);
  mode = 'late';
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  await until(() => release);
  const old = env.store.artifact(tree.id, failed.id);
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/cancel`);
  assert.equal(env.store.artifact(tree.id, failed.id).status, 'canceled');
  mode = 'ready';
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  const ready = await until(() => { const a = env.store.artifact(tree.id, failed.id); return a.status === 'ready' && a; });
  await release(); await new Promise(r => setTimeout(r, 50));
  assert.notEqual(ready.attempt, old.attempt); assert.equal(ready.input, old.input);
  assert.equal(env.store.artifact(tree.id, failed.id).attempt, ready.attempt);
  assert.equal(calls, 4); assert.equal(speech, 4); assert.equal(renders, 1);
  assert.equal(existsSync(join(env.dir, 'video-work', failed.id, old.attempt, 'public')), false);
});

test('duration follows measured narration beyond two minutes rather than the generated source duration export', async t => {
  const ffmpeg = RenderInternals.getExecutablePath({ type: 'ffmpeg', indent: false, logLevel: 'error', binariesDirectory: null });
  const tone = execFileSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '125', '-b:a', '48k', '-f', 'mp3', 'pipe:1'], { maxBuffer: 1024 * 1024 });
  const env = await open({ generate: async (tree, text, emit) => complete(emit, tree.id ? 'Watch.' + directive : composition) }, {
    videoNarrate: async () => ({ ...await fakeNarration(), audio: tone }),
    videoRender: async (workspace, output) => {
      const timing = JSON.parse(readFileSync(join(workspace, 'narration.json')));
      assert.ok(timing.durationInFrames > 120 * 30);
      writeFileSync(output, mp4); return { durationInFrames: timing.durationInFrames, fps: 30 };
    },
  });
  t.after(async () => { await env.app.stop(); env.store.close(); });
  const tree = env.store.create('Longer');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a longer video, about two minutes ten seconds.' })).text();
  const ready = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'ready'));
  assert.ok(ready.duration > 120);
});

test('a malformed video block the learner asked for becomes a visible failed video with a reason, and Retry runs it from the stored request', async () => {
  const workers = [];
  let block;
  const provider = { generate: async (tree, text, emit) => {
    if (!tree.id) { workers.push(JSON.parse(text)); return complete(emit, composition); }
    complete(emit, 'Sure.\n```treetutor-video\n' + block);
  } };
  const env = await open(provider);
  try {
    // Regression replay: tutors have sent a stray key plus a missing field, which used to be dropped silently.
    const request = 'Make a video of how Earth orbits the Sun.';
    for (const [value, reason, expected = {}, closed = true] of [
      [JSON.stringify({ title: 'Orbits', description: 'Earth orbits.', excerpt: 'Earth', style: 'fun' }), /missing intent/, { excerpt: 'Earth' }],
      ['{"title": "Orbits",', /not valid JSON/],
      [JSON.stringify({ ...task, intent: '  ' }), /missing intent/, { excerpt: task.excerpt }],
      [JSON.stringify({ ...task, description: 12 }), /missing description/, { intent: task.intent, excerpt: task.excerpt }],
      ['null', /not a JSON object/],
      ['[]', /not a JSON object/],
      [JSON.stringify(task), /cut off before it closed/, {}, false],
    ]) {
      block = value + (closed ? '\n```' : '');
      const tree = env.store.create('Bad video');
      const stream = await (await env.post(`/api/trees/${tree.id}/messages`, { text: request })).text();
      assert.ok(!stream.includes('treetutor-video'));
      const [failed] = (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts;
      assert.equal(failed.kind, 'video');
      assert.equal(failed.status, 'failed');
      assert.match(failed.error, /^Video request could not be read: /);
      assert.match(failed.error, reason);
      assert.equal(failed.input, undefined);
      assert.equal(failed.position, 'Sure.'.length);
      assert.equal(workers.length, 0, 'a rejected request never starts by itself');
      assert.equal((await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`)).status, 200);
      await until(() => env.store.artifact(tree.id, failed.id).status === 'ready');
      const sent = workers.pop();
      assert.equal(sent.request, request);
      assert.equal(sent.intent, expected.intent ?? request, 'readable fields survive; missing intent falls back to the learner request');
      assert.equal(sent.excerpt, expected.excerpt ?? '');
      assert.equal(env.store.tree(tree.id).messages.length, 2);
    }
    // Valid tolerant slip: unknown keys and long fields still start the job directly.
    block = JSON.stringify({ ...task, style: 'fun', intent: 'i'.repeat(17000) }) + '\n```';
    const tree = env.store.create('Slip');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of the final.' })).text();
    await until(() => env.store.tree(tree.id).artifacts[0]?.status === 'ready');
    assert.equal(workers.pop().intent, 'i'.repeat(600));
  } finally { env.close(); }
});

test('mixed and duplicate video blocks each leave a failed artifact of their own kind without starting workers', async () => {
  let blocks;
  let workers = 0;
  const env = await open({ generate: async (tree, text, emit) => {
    if (!tree.id) { workers++; return complete(emit, composition); }
    complete(emit, 'Visible answer.' + blocks);
  } });
  try {
    for (const kinds of [['diagram', 'video'], ['video', 'video']]) {
      blocks = kinds.map(kind => `\n\`\`\`treetutor-${kind}\n${JSON.stringify(task)}\n\`\`\``).join('');
      const tree = env.store.create('Multiple requests');
      const stream = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of winners advancing.' })).text();
      const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
      assert.equal(saved.messages.at(-1).text, 'Visible answer.');
      assert.doesNotMatch(stream, /treetutor-(diagram|video)/);
      assert.deepEqual(saved.artifacts.map(a => [a.kind, a.status]), kinds.map(kind => [kind === 'diagram' ? 'mermaid' : kind, 'failed']));
      assert.ok(saved.artifacts.every(a => a.error && a.input === undefined));
    }
    assert.equal(workers, 0);
  } finally { env.close(); }
});

test('provider failure and learner Stop preserve request failures without starting media work', async () => {
  let mode, kind, entered;
  let workers = 0;
  const env = await open({ generate: async (tree, text, emit, save, signal) => {
    if (!tree.id) { workers++; return complete(emit, composition); }
    emit({ type: 'item', item: 'answer', text: `Saved text.\n\`\`\`treetutor-${kind}\n${JSON.stringify(task)}\n\`\`\`` });
    entered?.();
    if (mode === 'throw') throw new Error('private provider failure');
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  } });
  try {
    for (mode of ['throw', 'stop']) for (kind of ['diagram', 'video']) {
      const tree = env.store.create('Interrupted requests');
      const ready = new Promise(resolve => { entered = resolve; });
      const response = env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of winners advancing.' }).then(r => r.text());
      await ready;
      if (mode === 'stop') assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
      await response;
      const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
      assert.deepEqual(saved.artifacts.map(a => [a.kind, a.status, a.error]), [[kind === 'diagram' ? 'mermaid' : kind, 'failed', 'Tutor reply did not complete.']]);
      assert.equal(saved.messages.at(-1).text, 'Saved text.');
    }
    assert.equal(workers, 0);
  } finally { env.close(); }
});

test('deleting a conversation while its request block is streaming cannot recreate its artifacts', async () => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const env = await open({ generate: async (tree, text, emit, save, signal) => {
    emit({ type: 'item', item: 'answer', text: 'Saved text.' + directive });
    entered();
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  } });
  try {
    const tree = env.store.create('Delete requests');
    const response = env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of winners advancing.' }).then(r => r.text());
    await started;
    assert.equal((await env.post(`/api/trees/${tree.id}/delete`, { conversation: tree.id })).status, 200);
    await response;
    assert.equal((await env.get(`/api/trees/${tree.id}`)).status, 404);
    assert.deepEqual((await (await env.get('/api/state')).json()).active, []);
  } finally { env.close(); }
});

test('Try a different version gives a ready video a new job; the chat shows only the newest and the library keeps both', async () => {
  const workers = []; let release, held = false;
  const env = await open({ generate: async (tree, text, emit) => {
    if (tree.instructions?.includes('Remotion')) { workers.push({ tree, text }); if (held) await new Promise(r => { release = r; }); return complete(emit, composition); }
    complete(emit, 'Here is the idea.' + directive);
  } });
  try {
    const tree = env.store.create('Videos');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of the winners advancing.' })).text();
    const first = await until(() => env.store.tree(tree.id).artifacts.find(a => a.status === 'ready'));
    const url = `/api/trees/${tree.id}/artifacts/${first.id}/regenerate`;
    assert.equal((await env.post(`/api/trees/${env.store.create('Foreign').id}/artifacts/${first.id}/regenerate`)).status, 404);
    held = true;
    const response = await env.post(url, { input: 'UNTRUSTED' });
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.notEqual(next.id, first.id); assert.equal(next.status, 'pending'); assert.equal(next.input, undefined);
    assert.equal(next.message, first.message); assert.equal(next.position, first.position);
    await until(() => workers.length === 2);
    assert.equal((await env.post(`/api/trees/${tree.id}/artifacts/${next.id}/regenerate`)).status, 409, 'one generation at a time');
    assert.equal((await env.post(url)).status, 404, 'the previous id is no longer in the chat');
    // The previous video stays playable in the library while the new one is made.
    assert.deepEqual((await (await env.get('/api/videos')).json()).map(v => v.id), [first.id]);
    assert.equal((await env.get(`/api/videos/${first.id}/media`)).status, 200);
    release();
    await until(() => env.store.tree(tree.id).artifacts.find(a => a.id === next.id && a.status === 'ready'));
    const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
    assert.deepEqual(saved.artifacts.map(a => a.id), [next.id], 'the chat shows only the newest');
    assert.deepEqual((await (await env.get('/api/videos')).json()).map(v => v.id).sort(), [first.id, next.id].sort());
    assert.equal((await env.get(`/api/videos/${first.id}/media`)).status, 200);
    assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${next.id}/media`)).status, 200);
    const [a, b] = workers.map(w => JSON.parse(w.text));
    assert.deepEqual({ ...b, differentVersion: undefined }, { ...a, differentVersion: undefined }, 'same frozen request and selection');
    assert.equal(b.differentVersion, true);
    assert.match(workers[1].tree.instructions, /different approach than the previous version/);
    assert.doesNotMatch(workers[1].text, /UNTRUSTED/); assert.equal(workers[1].tree.thread, null);
  } finally { release?.(); env.close(); }
});
