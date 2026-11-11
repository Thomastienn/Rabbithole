import { test } from 'node:test';
import { fakeNarration } from './fake-narration.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { mediaPath } from '../server/videos.mjs';
import { layoutSaver } from '../src/layoutSave.ts';

const complete = async (tree, text, emit) => { emit({ type: 'item', item: 'a', text: 'Completed answer' }); emit({ type: 'status', status: 'completed' }); };
const until = async check => { for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('Fixture timed out'); };
async function fixture(provider = { generate: complete }, options = {}) {
  provider = { models: async () => [{ model: 'fixture-model', isDefault: true }], ...provider };
  const dir = mkdtempSync(join(tmpdir(), 'tt-chat-management-')), path = join(dir, 'trees.sqlite');
  const store = new Store(path);
  const app = createApp({ store, provider, dir, auth: { status: () => ({ connected: true }) }, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`, state = await (await fetch(origin + '/api/state')).json();
  const post = (id, action, body = {}, headers = {}) => fetch(`${origin}/api/trees/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state.csrf, ...headers }, body: JSON.stringify(body) });
  const reply = id => store.message(id, 'assistant', 'Roots exchange nutrients.', 'completed');
  const branch = parent => {
    const messageId = reply(parent.id);
    return store.branch(parent, { messageId, start: 0, end: 5, text: 'Roots', question: 'Branch question' }, 'Frozen context');
  };
  const root = store.create('Main chat'), child = branch(root), grandchild = branch(child), sibling = branch(root), other = store.create('Other chat');
  for (const t of [root, child, grandchild, sibling, other]) { reply(t.id); store.position(t.id, 100, 200); }
  store.layout(root.id, { folded: [child.id, sibling.id], selected: grandchild.id, panel: 'beside', viewport: { x: 10, y: 20, zoom: 0.8 } });
  const paths = [];
  const file = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); paths.push(path); };
  for (const t of [root, child, grandchild, sibling, other]) {
    const message = store.tree(t.id).messages.at(-1).id;
    const diagram = store.pendingArtifact(t.id, message, 'Diagram', 'Description');
    store.finishArtifact(t.id, diagram.id, 'flowchart LR\n A-->B');
    const video = store.pendingArtifact(t.id, message, 'Video', 'Description', 'video', '{}');
    store.finishVideo(t.id, video.id, video.attempt, { description: 'Ready video', duration: 1 });
    file(mediaPath(dir, video.id), `${t.id} media`);
    file(join(dir, 'video-work', video.id, video.attempt, 'Video.tsx'), `${t.id} source`);
    file(join(dir, 'video-work', video.id, 'old-attempt', 'Video.tsx'), `${t.id} old source`);
    file(join(dir, 'video-work', video.attempt, 'Video.tsx'), `${t.id} legacy source`);
  }
  return { dir, path, store, app, post, origin, root, child, grandchild, sibling, other, paths, close: () => { app.stop(); store.close(); } };
}
const snapshot = store => Object.fromEntries(['trees', 'messages', 'branches', 'artifacts'].map(table => [table, store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));

test('rename validates the bound, persists across restart, and manually named New chat never auto-retitles or reopens as unstarted', async () => {
  const env = await fixture();
  try {
    const blank = env.store.create();
    for (const title of ['', '  ', null, 10, 'x'.repeat(201)]) assert.equal((await env.post(blank.id, 'rename', { title })).status, 400);
    assert.equal((await env.post('missing', 'rename', { title: 'Title' })).status, 404);
    assert.equal((await env.post(blank.id, 'rename', { title: '  New chat  ' })).status, 200);
    assert.equal(env.store.unstarted(), undefined);
    await (await env.post(blank.id, 'messages', { text: 'First question changes nothing' })).text();
    assert.equal(env.store.tree(blank.id).title, 'New chat');
    const title = 'T'.repeat(200);
    assert.equal((await env.post(env.child.id, 'rename', { title })).status, 200);
    env.close();
    const restarted = new Store(env.path);
    try {
      assert.equal(restarted.tree(blank.id).title, 'New chat');
      assert.equal(restarted.tree(blank.id).title_renamed, 1);
      assert.equal(restarted.tree(env.child.id).title, title);
    } finally { restarted.close(); }
  } finally { if (env.app.server.listening) env.close(); }
});

test('delete a branch cascades only its descendants, cleans files and layout, and leaves parent history and sibling anchors unchanged', async () => {
  const env = await fixture();
  try {
    const before = snapshot(env.store), parent = env.store.tree(env.root.id), sibling = env.store.tree(env.sibling.id), other = env.store.tree(env.other.id);
    const response = await env.post(env.root.id, 'delete', { conversation: env.child.id });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: [env.child.id, env.grandchild.id], parent: env.root.id });
    assert.equal(env.store.tree(env.child.id), undefined);
    assert.equal(env.store.tree(env.grandchild.id), undefined);
    assert.deepEqual(env.store.tree(env.root.id), parent);
    assert.deepEqual(env.store.tree(env.sibling.id), sibling);
    assert.deepEqual(env.store.tree(env.other.id), other);
    assert.deepEqual(env.store.list().find(t => t.id === env.root.id).layout, { folded: [env.sibling.id], selected: env.root.id, panel: 'beside', viewport: { x: 10, y: 20, zoom: 0.8 } });
    const deleted = new Set([env.child.id, env.grandchild.id]), after = snapshot(env.store);
    for (const [table, key] of [['messages', 'tree'], ['branches', 'child'], ['artifacts', 'conversation']]) assert.deepEqual(after[table], before[table].filter(row => !deleted.has(row[key])));
    for (const path of env.paths) assert.equal(existsSync(path), path.endsWith('.mp4') || !deleted.has(readFileOwner(path, before)), path); // library keeps ready media
    assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal((await env.post(env.root.id, 'layout', { folded: [], selected: env.child.id, panel: 'beside' })).status, 400, 'stale selected IDs cannot be saved again');
    assert.equal((await env.post(env.root.id, 'layout', { folded: [env.child.id], selected: env.root.id, panel: 'beside' })).status, 400);
  } finally { env.close(); }
});

function readFileOwner(path, before) {
  // The fixture embeds artifact/attempt IDs in server-chosen paths, matching real storage ownership.
  return before.artifacts.find(a => a.kind === 'video' && (path.includes(a.id) || path.includes(a.attempt))).conversation;
}

test('delete a whole chat removes every owned row and private work file; another chat stays byte-identical', async () => {
  const env = await fixture();
  try {
    const other = env.store.tree(env.other.id), before = snapshot(env.store);
    const response = await env.post(env.root.id, 'delete', { conversation: env.root.id });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).deleted.length, 4);
    assert.deepEqual(env.store.list().map(t => t.id), [env.other.id]);
    assert.deepEqual(env.store.tree(env.other.id), other);
    for (const path of env.paths) assert.equal(existsSync(path), path.endsWith('.mp4') || readFileOwner(path, before) === env.other.id, path);
    for (const [table, key] of [['messages', 'tree'], ['artifacts', 'conversation']]) assert.ok(snapshot(env.store)[table].every(row => row[key] === env.other.id));
    assert.equal(snapshot(env.store).branches.length, 0);
    assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { env.close(); }
});

test('failure at commit rolls back the complete cascade, root layout and staged files, and does not stop active work', async () => {
  const turns = [];
  const env = await fixture({ generate: (tree, text, emit, save, signal) => new Promise(resolve => { emit({ type: 'delta', item: 'a', text: 'Partial' }); turns.push({ resolve, emit, signal }); }) });
  try {
    const response = await env.post(env.child.id, 'messages', { text: 'Running' });
    const before = snapshot(env.store), files = env.paths.map(path => readFileSync(path));
    env.store.db.exec(`CREATE TABLE deletion_guard (owner TEXT REFERENCES trees(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER fail_commit AFTER DELETE ON trees WHEN OLD.id='${env.child.id}' BEGIN INSERT INTO deletion_guard VALUES(OLD.id); END;`);
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id })).status, 500);
    assert.deepEqual(snapshot(env.store), before);
    env.paths.forEach((path, i) => assert.deepEqual(readFileSync(path), files[i]));
    assert.equal(turns[0].signal.aborted, false);
    assert.equal(env.app.active.has(env.child.id), true);
    assert.ok(readdirSync(join(env.dir, 'videos')).every(name => !name.includes('.deleting-')));
    turns[0].emit({ type: 'status', status: 'completed' }); turns[0].resolve();
    await response.text();
  } finally { env.close(); }
});

test('process exit before or after commit recovers staged artifact files according to the SQLite transaction', async () => {
  for (const committed of [false, true]) {
    const env = await fixture(), before = snapshot(env.store);
    const files = [env.child, env.grandchild].flatMap(t => env.store.tree(t.id).artifacts.filter(a => a.kind === 'video').flatMap(a => [mediaPath(env.dir, a.id), join(env.dir, 'video-work', a.id), join(env.dir, 'video-work', a.attempt)].map(path => [path, a.id])));
    env.close();
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { Store } from './server/store.mjs';
      import { renameSync } from 'node:fs';
      const [path, root, id, files, committed] = process.argv.slice(1), store = new Store(path);
      store.remove(root, id, () => {
        for (const [file, owner] of JSON.parse(files)) renameSync(file, file + '.deleting-' + owner);
        if (committed==='false') process.exit(42);
      });
      process.exit(43);
    `, env.path, env.root.id, env.child.id, JSON.stringify(files), String(committed)], { encoding: 'utf8' });
    assert.equal(child.status, committed ? 43 : 42, child.stderr);
    const recovered = new Store(env.path), app = createApp({ store: recovered, dir: env.dir, auth: { status: () => ({}) } });
    try {
      if (!committed) assert.deepEqual(snapshot(recovered), before);
      else assert.equal(recovered.tree(env.child.id), undefined);
      for (const [file, owner] of files) {
        assert.equal(existsSync(file), !committed);
        assert.equal(existsSync(file + '.deleting-' + owner), false);
      }
    } finally { app.stop(); recovered.close(); }
  }
});

test('deletion stops only owned active replies and ignores late deltas, thread saves, statuses and rejections', async () => {
  const turns = [];
  const env = await fixture({ generate: (tree, text, emit, save, signal) => new Promise((resolve, reject) => { emit({ type: 'delta', item: 'a', text: 'Partial' }); turns.push({ tree, emit, save, signal, resolve, reject }); }) });
  try {
    const streams = [];
    for (const t of [env.child, env.grandchild, env.sibling, env.root]) streams.push(await env.post(t.id, 'messages', { text: 'Running' }));
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id })).status, 200);
    for (const turn of turns.slice(0, 2)) {
      assert.equal(turn.signal.aborted, true);
      turn.emit({ type: 'item', item: 'a', text: 'Late text with ```treetutor-video' });
      turn.save('late-thread', 'late-model'); turn.emit({ type: 'status', status: 'completed' }); turn.reject(new Error('Late failure'));
    }
    for (const stream of streams.slice(0, 2)) assert.match(await stream.text(), /interrupted/);
    for (const turn of turns.slice(2)) { assert.equal(turn.signal.aborted, false); turn.emit({ type: 'status', status: 'completed' }); turn.resolve(); }
    for (const stream of streams.slice(2)) assert.match(await stream.text(), /completed/);
    assert.equal(env.store.tree(env.child.id), undefined); assert.equal(env.store.tree(env.grandchild.id), undefined);
    assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { env.close(); }
});

test('rename and delete enforce CSRF, origin, content type and root ownership with server-derived descendants', async () => {
  const env = await fixture();
  try {
    const before = snapshot(env.store);
    for (const action of ['rename', 'delete']) for (const headers of [{ 'X-TreeTutor-CSRF': '' }, { Origin: 'https://foreign.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Content-Type': 'text/plain' }]) {
      assert.equal((await env.post(env.root.id, action, { title: 'Wrong', conversation: env.root.id }, headers)).status, 403);
    }
    for (const [root, conversation] of [[env.root.id, env.other.id], [env.other.id, env.child.id], [env.child.id, env.grandchild.id], [env.root.id, 'missing']]) assert.equal((await env.post(root, 'delete', { conversation })).status, 404);
    assert.equal((await env.post(env.root.id, 'delete')).status, 404);
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id, count: 1 })).status, 409);
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id, title: 'Outdated title' })).status, 409);
    assert.deepEqual(snapshot(env.store), before);
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id, descendants: [env.other.id] })).status, 200);
    assert.ok(env.store.tree(env.other.id), 'client cannot expand the server-derived subtree');
  } finally { env.close(); }
});

test('a deleted parent cannot publish an in-flight compaction or model change', async () => {
  for (const action of ['branches', 'model']) {
    let release, signal;
    const provider = { models: () => new Promise(resolve => { release = () => resolve([{ model: 'fixture' }]); }), generate: (tree, text, emit, save, s) => new Promise(resolve => { signal = s; release = () => { emit({ type: 'item', item: 'a', text: 'Late summary' }); emit({ type: 'status', status: 'completed' }); resolve(); }; }) };
    const env = await fixture(provider);
    try {
      const messageId = env.store.tree(env.root.id).messages[0].id;
      const pending = env.post(env.root.id, action, action === 'model' ? { model: 'fixture' } : { messageId, start: 0, end: 5, text: 'Roots', question: 'Why?' });
      await until(() => release);
      assert.equal((await env.post(env.root.id, 'delete', { conversation: env.root.id })).status, 200);
      if (signal) assert.equal(signal.aborted, true);
      release(); assert.ok((await pending).status >= 400);
      assert.deepEqual(env.store.list().map(t => t.id), [env.other.id]);
    } finally { env.close(); }
  }
});

test('delete cancels a video worker that ignores abort, removes all work files and cannot publish late media', async () => {
  let worker;
  const directive = '\n```treetutor-video\n' + JSON.stringify({ title: 'Title', description: 'Description', intent: 'Show roots', excerpt: 'Roots' }) + '\n```';
  const env = await fixture({ generate: async (tree, text, emit, save, signal) => {
    if (tree.instructions?.includes('Remotion')) return new Promise(resolve => { worker = { emit, signal, resolve }; });
    emit({ type: 'item', item: 'a', text: 'Video follows.' + directive }); emit({ type: 'status', status: 'completed' });
  } });
  try {
    await (await env.post(env.child.id, 'messages', { text: 'Make a video' })).text();
    await until(() => worker);
    const artifact = env.store.tree(env.child.id).artifacts.at(-1);
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id })).status, 200);
    assert.equal(worker.signal.aborted, true);
    worker.emit({ type: 'item', item: 'a', text: '// Description: Late.\nexport default function Video() {}' });
    worker.emit({ type: 'status', status: 'completed' }); worker.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(env.store.artifact(env.child.id, artifact.id), undefined);
    assert.equal(existsSync(mediaPath(env.dir, artifact.id)), false);
    assert.equal(existsSync(join(env.dir, 'video-work', artifact.id)), false);
  } finally { env.close(); }
});

test('deleted dirty layouts and failed in-flight writes never requeue, while surviving branches retain their pending positions', async () => {
  const env = await fixture();
  let reject, count = 0;
  const saver = layoutSaver(async (id, batch) => { count++; if (count === 1) return new Promise((_, r) => { reject = r; }); const response = await env.post(id, 'layout', { ...batch.layout, positions: batch.positions }); if (!response.ok) throw new Error('Layout rejected'); }, () => {});
  try {
    saver.mark(env.root.id, { folded: [], selected: env.child.id, panel: 'beside' }, { [env.child.id]: { x: 300, y: 400 } });
    const inFlight = saver.flush();
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id })).status, 200);
    saver.discard(env.root.id);
    saver.mark(env.root.id, { folded: [], selected: env.root.id, panel: 'beside' }, { [env.sibling.id]: { x: 700, y: 800 } });
    reject(new Error('Late failed write')); await inFlight; await saver.flush();
    assert.equal(saver.pending().size, 0);
    const sibling = env.store.list().find(t => t.id === env.sibling.id);
    assert.equal(sibling.x, 700); assert.equal(sibling.y, 800);
  } finally { saver.dispose(); env.close(); }
});

test('delete stops an active video render and removes its partial files without interrupting a sibling render', async () => {
  const renders = [];
  const directive = '\n```treetutor-video\n' + JSON.stringify({ title: 'Video', description: 'Description', intent: 'Show roots', excerpt: 'Roots' }) + '\n```';
  const env = await fixture({ generate: async (tree, text, emit) => {
    emit({ type: 'item', item: 'a', text: tree.instructions?.includes('Remotion') ? '// Description: Roots.\n// Narration: "Roots grow."\nexport default function Video() { return null; }' : 'Video follows.' + directive });
    emit({ type: 'status', status: 'completed' });
  } }, { videoNarrate: fakeNarration, videoRender: (workspace, output, signal) => new Promise((resolve, reject) => {
    writeFileSync(output, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4096)]));
    renders.push({ workspace, output, signal, resolve });
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  try {
    for (const t of [env.child, env.sibling]) await (await env.post(t.id, 'messages', { text: 'Make a video' })).text();
    await until(() => renders.length === 2);
    const deleted = env.store.tree(env.child.id).artifacts.at(-1), kept = env.store.tree(env.sibling.id).artifacts.at(-1);
    const deletedRender = renders.find(r => r.workspace === join(env.dir, 'video-work', deleted.id, deleted.attempt));
    const keptRender = renders.find(r => r.workspace === join(env.dir, 'video-work', kept.id, kept.attempt));
    assert.equal((await env.post(env.root.id, 'delete', { conversation: env.child.id })).status, 200);
    assert.equal(deletedRender.signal.aborted, true);
    assert.equal(existsSync(join(env.dir, 'video-work', deleted.id)), false);
    assert.equal(existsSync(mediaPath(env.dir, deleted.id)), false);
    assert.equal(keptRender.signal.aborted, false);
    keptRender.resolve({ durationInFrames: 60, fps: 30 });
    await until(() => env.store.artifact(env.sibling.id, kept.id).status === 'ready');
    assert.ok(existsSync(mediaPath(env.dir, kept.id)));
  } finally { env.close(); }
});
