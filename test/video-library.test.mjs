import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { mediaPath } from '../server/videos.mjs';

const media = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2048, 7)]);
const provider = { models: async () => [{ model: 'fixture-model', isDefault: true }], generate: async () => { throw new Error('Library playback must not call a provider.'); } };

async function serve(path, dir) {
  const store = new Store(path), app = createApp({ store, provider, dir, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`, { csrf } = await (await fetch(origin + '/api/state')).json();
  return { store, get: (p, headers) => fetch(origin + p, { headers }), post: (p, body) => fetch(origin + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }), close: () => { app.stop(); store.close(); } };
}
const file = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };

test('existing ready videos migrate into a global library that survives source deletion and restart without provider calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-library-')), path = join(dir, 'trees.sqlite');
  // A pre-library database: ready, failed and missing-file videos saved by an older build.
  let store = new Store(path);
  const root = store.create('Private discussion title'), other = store.create('Other chat');
  const ids = {};
  for (const [name, tree, status] of [['kept', root, 'ready'], ['missing', root, 'ready'], ['failed', root, 'failed'], ['other', other, 'ready']]) {
    const message = store.message(tree.id, 'assistant', `SECRET DISCUSSION ${name}`, 'completed');
    const video = store.pendingArtifact(tree.id, message, `Video ${name}`, `About ${name}`, 'video', '{"excerpt":"PRIVATE INPUT"}');
    store.finishVideo(tree.id, video.id, video.attempt, { description: `About ${name}`, duration: 2 }, status === 'failed' ? 'Failed.' : null);
    ids[name] = video.id;
    if (name !== 'missing') file(mediaPath(dir, video.id), media);
    file(join(dir, 'video-work', video.id, video.attempt, 'Video.tsx'), 'PRIVATE SCRIPT');
  }
  store.record('video:one', 'video', { provider: 'codex', model: 'fixture-model' }, { input: 10, output: 5, cacheRead: 0 });
  store.db.exec('DROP TABLE videos');
  store.close();

  let env = await serve(path, dir);
  try {
    const usage = env.store.usageEvents();
    const list = await (await env.get('/api/videos')).json();
    assert.deepEqual(list.map(v => v.id).sort(), [ids.kept, ids.missing, ids.other].sort(), 'only ready videos migrate');
    assert.equal(list.find(v => v.id === ids.missing).available, false);
    assert.equal(list.find(v => v.id === ids.kept).available, undefined);
    assert.equal((await env.get(`/api/videos/${ids.missing}/media`)).status, 404);
    assert.equal((await env.get(`/api/videos/${ids.failed}/media`)).status, 404);
    assert.equal((await env.get('/api/videos/..%2Ftrees.sqlite/media')).status, 404);

    // Deleting the source chat keeps library media and routes, but no discussion text or private work.
    assert.equal((await env.post(`/api/trees/${root.id}/delete`, { conversation: root.id })).status, 200);
    assert.equal(env.store.tree(root.id), undefined);
    assert.equal(existsSync(join(dir, 'video-work', ids.kept)), false);
    assert.ok(existsSync(mediaPath(dir, ids.kept)));
    const after = await (await env.get('/api/videos')).json();
    assert.deepEqual(after.map(v => v.id).sort(), [ids.kept, ids.missing, ids.other].sort());
    assert.doesNotMatch(JSON.stringify(after) + JSON.stringify(env.store.db.prepare('SELECT * FROM videos').all()), /SECRET|PRIVATE|conversation|message/);
    const range = await env.get(`/api/videos/${ids.kept}/media`, { Range: 'bytes=4-11' });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), `bytes 4-11/${media.length}`);
    assert.equal(Buffer.from(await range.arrayBuffer()).toString(), 'ftypisom');
    assert.equal((await env.get(`/api/trees/${root.id}/artifacts/${ids.kept}/media`)).status, 404, 'the deleted conversation route is gone');
    assert.deepEqual(env.store.usageEvents(), usage, 'recorded usage is unchanged');
    env.close();

    // Reopen: same library, still playable; a file removed while stopped reads as unavailable.
    unlinkSync(mediaPath(dir, ids.other));
    env = await serve(path, dir);
    const reopened = await (await env.get('/api/videos')).json();
    assert.equal(reopened.length, 3);
    assert.equal(reopened.find(v => v.id === ids.other).available, false);
    const whole = await env.get(`/api/videos/${ids.kept}/media`);
    assert.equal(whole.status, 200);
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), media);
    assert.deepEqual(env.store.usageEvents(), usage);
  } finally { env.close(); }
});

test('a newly finished video joins the library in the same transaction as its ready row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-library-')), store = new Store(join(dir, 'trees.sqlite'));
  try {
    const tree = store.create('Chat'), message = store.message(tree.id, 'assistant', 'Reply', 'completed');
    const video = store.pendingArtifact(tree.id, message, 'New video', 'Draft', 'video', '{}');
    assert.deepEqual(store.library(), []);
    store.finishVideo(tree.id, video.id, 'stale-attempt', { description: 'Late', duration: 1 });
    assert.deepEqual(store.library(), [], 'a stale attempt cannot publish');
    store.finishVideo(tree.id, video.id, video.attempt, { description: 'Final', duration: 3 });
    assert.deepEqual(store.library(), [{ id: video.id, title: 'New video', description: 'Final', duration: 3, created: video.created }]);
  } finally { store.close(); }
});
