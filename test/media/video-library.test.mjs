import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  symlinkSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { mediaPath } from '../../server/media/videos.mjs';

const media = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(2048, 7),
]);
const provider = {
  models: async () => [{ model: 'fixture-model', isDefault: true }],
  generate: async () => {
    throw new Error('Library playback must not call a provider.');
  },
};

async function serve(path, dir, desktop) {
  const store = new Store(path),
    app = createApp({
      store,
      provider,
      dir,
      desktop,
      auth: { status: () => ({ connected: true }) },
    });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(origin + '/api/state')).json();
  return {
    store,
    get: (p, headers) => fetch(origin + p, { headers }),
    post: (p, body, token = csrf) =>
      fetch(origin + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': token },
        body: JSON.stringify(body),
      }),
    close: () => {
      app.stop();
      store.close();
    },
  };
}
const file = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

test('existing ready videos migrate into a global library that survives source deletion and restart without provider calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-library-')),
    path = join(dir, 'trees.sqlite');
  // A pre-library database: ready, failed and missing-file videos saved by an older build.
  let store = new Store(path);
  const root = store.create('Private discussion title', 'codex'),
    other = store.create('Other chat', 'codex');
  const ids = {};
  for (const [name, tree, status] of [
    ['kept', root, 'ready'],
    ['missing', root, 'ready'],
    ['failed', root, 'failed'],
    ['other', other, 'ready'],
  ]) {
    const message = store.message(tree.id, 'assistant', `SECRET DISCUSSION ${name}`, 'completed');
    const video = store.pendingArtifact(
      tree.id,
      message,
      `Video ${name}`,
      `About ${name}`,
      'video',
      '{"excerpt":"PRIVATE INPUT"}',
    );
    store.finishVideo(
      tree.id,
      video.id,
      video.attempt,
      { description: `About ${name}`, duration: 2 },
      status === 'failed' ? 'Failed.' : null,
    );
    ids[name] = video.id;
    if (name !== 'missing') file(mediaPath(dir, video.id), media);
    file(join(dir, 'video-work', video.id, video.attempt, 'Video.tsx'), 'PRIVATE SCRIPT');
  }
  store.record(
    'video:one',
    'video',
    { provider: 'codex', model: 'fixture-model' },
    { input: 10, output: 5, cacheRead: 0 },
  );
  store.db.exec('DROP TABLE videos');
  store.close();

  let env = await serve(path, dir);
  try {
    const usage = env.store.usageEvents();
    const list = await (await env.get('/api/videos')).json();
    assert.deepEqual(
      list.map((v) => v.id).sort(),
      [ids.kept, ids.missing, ids.other].sort(),
      'only ready videos migrate',
    );
    // A video saved as an MP4 counts as exported; one with neither MP4 nor cuts is unavailable.
    assert.equal(list.find((v) => v.id === ids.missing).available, false);
    assert.equal(list.find((v) => v.id === ids.missing).exported, false);
    assert.equal(list.find((v) => v.id === ids.kept).available, undefined);
    assert.equal(list.find((v) => v.id === ids.kept).exported, true);
    assert.equal((await env.get(`/api/videos/${ids.kept}/media`)).status, 200);
    assert.equal((await env.get(`/api/videos/${ids.missing}/media`)).status, 404);
    assert.equal((await env.get(`/api/videos/${ids.failed}/media`)).status, 404);
    assert.equal((await env.get('/api/videos/..%2Ftrees.sqlite/media')).status, 404);

    // Deleting the source chat keeps library media, production work and routes, but no discussion text.
    assert.equal(
      (await env.post(`/api/trees/${root.id}/delete`, { conversation: root.id })).status,
      200,
    );
    assert.equal(env.store.tree(root.id), undefined);
    assert.ok(existsSync(join(dir, 'video-work', ids.kept)));
    assert.ok(existsSync(mediaPath(dir, ids.kept)));
    const after = await (await env.get('/api/videos')).json();
    assert.deepEqual(after.map((v) => v.id).sort(), [ids.kept, ids.missing, ids.other].sort());
    assert.doesNotMatch(
      JSON.stringify(after) + JSON.stringify(env.store.db.prepare('SELECT * FROM videos').all()),
      /SECRET|PRIVATE|conversation|message/,
    );
    const range = await env.get(`/api/videos/${ids.kept}/media`, { Range: 'bytes=4-11' });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), `bytes 4-11/${media.length}`);
    assert.equal(Buffer.from(await range.arrayBuffer()).toString(), 'ftypisom');
    assert.equal(
      (await env.get(`/api/trees/${root.id}/artifacts/${ids.kept}/media`)).status,
      404,
      'the deleted conversation route is gone',
    );
    assert.deepEqual(env.store.usageEvents(), usage, 'recorded usage is unchanged');
    env.close();

    // Reopen: same library, still playable; a file removed while stopped reads as unavailable.
    unlinkSync(mediaPath(dir, ids.other));
    env = await serve(path, dir);
    const reopened = await (await env.get('/api/videos')).json();
    assert.equal(reopened.length, 3);
    assert.equal(reopened.find((v) => v.id === ids.other).available, false);
    const whole = await env.get(`/api/videos/${ids.kept}/media`);
    assert.equal(whole.status, 200);
    assert.deepEqual(Buffer.from(await whole.arrayBuffer()), media);
    assert.deepEqual(env.store.usageEvents(), usage);
  } finally {
    env.close();
  }
});

test('a newly finished video joins the library in the same transaction as its ready row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-library-')),
    store = new Store(join(dir, 'trees.sqlite'));
  try {
    const tree = store.create('Chat', 'codex'),
      message = store.message(tree.id, 'assistant', 'Reply', 'completed');
    const video = store.pendingArtifact(tree.id, message, 'New video', 'Draft', 'video', '{}');
    assert.deepEqual(store.library(), []);
    store.finishVideo(tree.id, video.id, 'stale-attempt', { description: 'Late', duration: 1 });
    assert.deepEqual(store.library(), [], 'a stale attempt cannot publish');
    store.finishVideo(tree.id, video.id, video.attempt, { description: 'Final', duration: 3 });
    assert.deepEqual(store.library(), [
      {
        id: video.id,
        title: 'New video',
        description: 'Final',
        duration: 3,
        created: video.created,
      },
    ]);
  } finally {
    store.close();
  }
});

test('library reveal and trash act only on server-owned media, keep failed entries and preserve usage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-library-')),
    path = join(dir, 'trees.sqlite'),
    calls = [];
  let fail = false;
  // Injected desktop boundary: records server-derived paths; the trash fixture moves the file aside like a real trash.
  const desktop = {
    reveal: async (p) => {
      calls.push(['reveal', p]);
      if (fail) throw new Error('no file manager');
    },
    trash: async (p) => {
      calls.push(['trash', p]);
      if (fail) throw new Error('trash unavailable');
      unlinkSync(p);
    },
  };
  const env = await serve(path, dir, desktop);
  try {
    const tree = env.store.create('Chat', 'codex'),
      ids = {};
    for (const name of ['kept', 'gone', 'missing', 'linked']) {
      const message = env.store.message(tree.id, 'assistant', 'Reply', 'completed');
      const video = env.store.pendingArtifact(
        tree.id,
        message,
        `Video ${name}`,
        'About',
        'video',
        '{}',
      );
      env.store.finishVideo(tree.id, video.id, video.attempt, {
        description: 'About',
        duration: 2,
      });
      ids[name] = video.id;
    }
    file(mediaPath(dir, ids.kept), media);
    file(mediaPath(dir, ids.gone), media);
    file(join(dir, 'outside.mp4'), media);
    symlinkSync(join(dir, 'outside.mp4'), mediaPath(dir, ids.linked));
    env.store.record(
      'video:one',
      'video',
      { provider: 'codex', model: 'fixture-model' },
      { input: 10, output: 5, cacheRead: 0 },
    );
    const usage = env.store.usageEvents();

    // Request protection and server-owned identity: no CSRF, unknown ids, traversal and client paths are refused.
    assert.equal((await env.post(`/api/videos/${ids.kept}/trash`, {}, 'wrong')).status, 403);
    assert.equal((await env.post('/api/videos/..%2Ftrees.sqlite/trash', {})).status, 404);
    assert.equal((await env.post(`/api/videos/${tree.id}/reveal`, {})).status, 404);
    assert.equal(
      (await env.post(`/api/videos/${ids.linked}/trash`, { path: join(dir, 'trees.sqlite') }))
        .status,
      409,
      'a symlink is not owned media',
    );
    assert.ok(existsSync(join(dir, 'outside.mp4')));
    assert.deepEqual(calls, []);

    assert.equal(
      (await env.post(`/api/videos/${ids.kept}/reveal`, { path: '/etc', command: 'rm -rf /' }))
        .status,
      200,
    );
    assert.deepEqual(calls.pop(), ['reveal', mediaPath(dir, ids.kept)]);
    assert.equal(
      (await env.post(`/api/videos/${ids.missing}/reveal`, {})).status,
      404,
      'a missing file is not revealed',
    );

    // A failed trash keeps the entry and the file; nothing is permanently deleted as a fallback.
    fail = true;
    assert.equal((await env.post(`/api/videos/${ids.kept}/reveal`, {})).status, 502);
    const failed = await env.post(`/api/videos/${ids.kept}/trash`, {});
    assert.equal(failed.status, 502);
    assert.match((await failed.json()).error, /Nothing was deleted/);
    assert.ok(existsSync(mediaPath(dir, ids.kept)));
    assert.ok(env.store.libraryVideo(ids.kept));
    fail = false;
    calls.length = 0;

    const ok = await env.post(`/api/videos/${ids.gone}/trash`, {});
    assert.deepEqual(await ok.json(), { trashed: true, missing: false });
    assert.deepEqual(calls.pop(), ['trash', mediaPath(dir, ids.gone)]);
    assert.equal(env.store.libraryVideo(ids.gone), undefined);
    assert.equal((await env.get(`/api/videos/${ids.gone}/media`)).status, 404);
    // The source conversation keeps the artifact, honestly unavailable with no silent regeneration.
    const artifact = await (await env.get(`/api/trees/${tree.id}/artifacts/${ids.gone}`)).json();
    assert.equal(artifact.status, 'ready');
    assert.equal(artifact.available, false);

    // An already-missing file only removes the entry, without calling the trash.
    assert.deepEqual(await (await env.post(`/api/videos/${ids.missing}/trash`, {})).json(), {
      trashed: false,
      missing: true,
    });
    assert.equal(calls.length, 0);
    const list = (await (await env.get('/api/videos')).json()).map((v) => v.id).sort();
    assert.deepEqual(list, [ids.kept, ids.linked].sort());
    assert.deepEqual(env.store.usageEvents(), usage, 'usage history survives trash');
    assert.deepEqual(readFileSync(mediaPath(dir, ids.kept)), media);
  } finally {
    env.close();
  }
});
