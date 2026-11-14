import { until, observeProvider } from '../support/events.mjs';
import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const auth = {
  status: () => ({ connected: false }),
  start: () => 'https://auth.openai.com/',
  callback: async () => {
    throw new Error('denied');
  },
};
const dir = mkdtempSync(join(tmpdir(), 'treetutor-tests-'));
async function open(path, generate) {
  const store = new Store(path);
  const app = createApp({ store, auth, provider: observeProvider({ generate }) });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const state = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state.csrf },
      body: JSON.stringify(body),
    });
  return {
    store,
    app,
    origin,
    post,
    close: () => {
      app.stop();
      store.close();
    },
  };
}
const complete = async (tree, question, emit, saveThread) => {
  saveThread(`thread-${tree.id}`);
  emit({ type: 'delta', item: 'a', text: 'Partial ' });
  emit({ type: 'item', item: 'a', text: `Answer: ${question}` });
  emit({ type: 'status', status: 'completed' });
};

test('server shutdown ends concurrent reply streams as interrupted and saves pending-job recovery before restart', async () => {
  const path = join(dir, 'shutdown.sqlite');
  const env = await open(path, async (tree, text, emit, saveThread, signal) => {
    emit({ type: 'delta', item: 'reply', text: `Partial ${text}` });
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  });
  try {
    const a = await (await env.post('/api/trees', {})).json();
    const ar = await env.post(`/api/trees/${a.id}/messages`, { text: 'first' });
    const b = await (await env.post('/api/trees', {})).json();
    const br = await env.post(`/api/trees/${b.id}/messages`, { text: 'second' });
    const message = env.store.tree(a.id).messages.at(-1).id;
    const job = env.store.pendingArtifact(a.id, message, 'Video', 'Saved job', 'video', '{}');
    await env.app.stop();
    for (const response of [ar, br])
      assert.match(await response.text(), /"type":"done","status":"interrupted"/);
    assert.equal(env.app.active.size, 0);
    assert.equal(env.store.artifact(a.id, job.id).status, 'interrupted');
    for (const [tree, partial] of [
      [a, 'first'],
      [b, 'second'],
    ]) {
      const reply = env.store.tree(tree.id).messages.at(-1);
      assert.equal(reply.status, 'interrupted');
      assert.equal(reply.text, `Partial ${partial}`);
    }
    const reopened = new Store(path);
    try {
      assert.deepEqual(reopened.tree(a.id), env.store.tree(a.id));
    } finally {
      reopened.close();
    }
  } finally {
    env.close();
  }
});

test('two trees stream independent replies, preserve originals, resume saved thread after restart', async () => {
  const path = join(dir, 'isolation.sqlite');
  let env = await open(path, complete);
  const trees = [];
  for (const text of ['Alpha original\nline two', 'Beta original']) {
    const tree = await (await env.post('/api/trees', {})).json();
    trees.push(tree);
    const stream = await env.post(`/api/trees/${tree.id}/messages`, { text });
    assert.match(stream.headers.get('content-type'), /event-stream/);
    const events = await stream.text();
    assert.match(events, /Partial/);
    assert.match(events, /"status":"completed"/);
  }
  assert.equal(env.app.server.address().address, '127.0.0.1');
  const [a, b] = trees;
  env.close();
  let resumed;
  env = await open(path, async (...args) => {
    resumed = args[0].thread;
    return complete(...args);
  });
  try {
    const aSaved = env.store.tree(a.id),
      bSaved = env.store.tree(b.id);
    assert.equal(aSaved.messages[0].text, 'Alpha original\nline two');
    assert.equal(bSaved.messages[0].text, 'Beta original');
    assert.equal(aSaved.messages[1].text, 'Answer: Alpha original\nline two');
    assert.equal(bSaved.messages.length, 2);
    await (await env.post(`/api/trees/${a.id}/messages`, { text: 'Continue' })).text();
    assert.equal(resumed, `thread-${a.id}`);
  } finally {
    env.close();
  }
});

test('provider failure preserves partial text and history, allows next request', async () => {
  let fail = true;
  const env = await open(join(dir, 'failure.sqlite'), async (...args) => {
    if (!fail) return complete(...args);
    args[2]({ type: 'delta', item: 'a', text: 'Saved partial' });
    throw new Error('Synthetic provider failure');
  });
  try {
    const tree = await (await env.post('/api/trees', {})).json();
    const events = await (
      await env.post(`/api/trees/${tree.id}/messages`, { text: 'Original' })
    ).text();
    assert.match(events, /Synthetic provider failure/);
    let saved = env.store.tree(tree.id);
    assert.equal(saved.messages[0].text, 'Original');
    assert.equal(saved.messages[1].text, 'Saved partial');
    assert.equal(saved.messages[1].status, 'failed');
    fail = false;
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Try again' })).text();
    saved = env.store.tree(tree.id);
    assert.equal(saved.messages.length, 4);
    assert.equal(saved.messages[3].status, 'completed');
  } finally {
    env.close();
  }
});

test('restart marks persisted unfinished replies interrupted', () => {
  const path = join(dir, 'interrupted.sqlite');
  let store = new Store(path);
  const tree = store.create('Interrupted');
  store.message(tree.id, 'assistant', 'Checkpoint', 'streaming');
  store.close();
  store = new Store(path);
  assert.deepEqual(
    store.tree(tree.id).messages.map((m) => [m.text, m.status]),
    [['Checkpoint', 'interrupted']],
  );
  store.close();
});

test('rejects foreign origins, Host rebinding, missing CSRF, malformed JSON and unknown trees', async () => {
  const env = await open(join(dir, 'boundary.sqlite'), complete);
  try {
    for (const headers of [
      { Origin: 'https://foreign.example' },
      { 'Sec-Fetch-Site': 'cross-site' },
    ]) {
      assert.equal(
        (await fetch(`${env.origin}/api/state`, { headers })).status,
        403,
        JSON.stringify(headers),
      );
    }
    assert.equal(
      (
        await fetch(`${env.origin}/api/trees`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    const rebound = await new Promise((resolve) => {
      http.get(`${env.origin}/api/state`, { headers: { Host: 'foreign.example' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
    });
    assert.equal(rebound, 403);
    assert.equal((await env.post('/api/trees/missing/messages', { text: 'Question' })).status, 404);
    assert.equal((await fetch(`${env.origin}/api/trees/missing`)).status, 404);
    assert.equal(
      (
        await fetch(`${env.origin}/auth/callback?state=fake`, {
          headers: { 'Sec-Fetch-Site': 'cross-site' },
        })
      ).status,
      400,
    );
    // The app may frame only the sandbox page; the sandbox page forbids network and frames, and its opaque origin cannot reach the API.
    const policy = (path) =>
      fetch(env.origin + path).then((r) => r.headers.get('Content-Security-Policy'));
    assert.match(
      await policy('/'),
      new RegExp(
        `frame-src ${env.origin}/sandbox.html ${env.origin}/player.html;.*frame-ancestors 'none'`,
      ),
    );
    // The live video player has the visual sandbox's policy; media arrives only as blobs the app hands over.
    for (const path of ['/sandbox.html', '/player.html']) {
      const sandbox = await policy(path);
      for (const rule of [
        "default-src 'none'",
        "connect-src 'none'",
        "frame-src 'none'",
        "worker-src 'none'",
        `frame-ancestors ${env.origin}`,
      ])
        assert.ok(sandbox.includes(rule), `${path} ${rule}`);
      assert.equal(sandbox.includes('media-src blob:'), path === '/player.html');
      assert.doesNotMatch(sandbox, /unsafe-eval|https?:\/\/(?!127\.0\.0\.1)/);
    }
    assert.equal(
      (await fetch(`${env.origin}/api/state`, { headers: { Origin: 'null' } })).status,
      403,
    );
    assert.equal(statSync(join(dir, 'boundary.sqlite')).mode & 0o777, 0o600, 'private SQLite save');
    assert.equal(env.store.list().length, 0);
  } finally {
    env.close();
  }
});

test('concurrent trees remain usable; stop targets only one active tree', async () => {
  const started = new Map();
  const env = await open(
    join(dir, 'concurrency.sqlite'),
    async (tree, text, emit, save, signal) => {
      emit({ type: 'delta', item: tree.id, text });
      await new Promise((resolve) => {
        started.set(tree.id, resolve);
        signal.addEventListener('abort', resolve);
      });
      emit({ type: 'status', status: signal.aborted ? 'interrupted' : 'completed' });
    },
  );
  try {
    const a = await (await env.post('/api/trees', {})).json();
    const ar = await env.post(`/api/trees/${a.id}/messages`, { text: 'A only' });
    const b = await (await env.post('/api/trees', {})).json();
    const br = await env.post(`/api/trees/${b.id}/messages`, { text: 'B only' });
    assert.equal(
      (await env.post(`/api/trees/${a.id}/messages`, { text: 'Duplicate' })).status,
      409,
    );
    assert.equal((await fetch(`${env.origin}/api/state`)).status, 200);
    await env.post(`/api/trees/${a.id}/stop`, {});
    assert.match(await ar.text(), /interrupted/);
    assert.equal(env.app.active.has(b.id), true);
    started.get(b.id)();
    assert.match(await br.text(), /completed/);
    assert.equal(env.store.tree(a.id).messages[1].text, 'A only');
    assert.equal(env.store.tree(b.id).messages[1].text, 'B only');
  } finally {
    env.close();
  }
});

test('UTF-8 split across HTTP chunks preserves original text; malformed JSON rejects', async () => {
  const env = await open(join(dir, 'utf8.sqlite'), complete);
  try {
    const tree = await (await env.post('/api/trees', {})).json();
    const state = await (await fetch(`${env.origin}/api/state`)).json();
    const body = Buffer.from(JSON.stringify({ text: 'Learn 🌲 trees' }));
    const split = body.indexOf(Buffer.from('🌲')) + 2;
    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        `${env.origin}/api/trees/${tree.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state.csrf },
        },
        (response) => {
          response.resume();
          response.on('end', () => resolve(response.statusCode));
        },
      );
      req.on('error', reject);
      req.write(body.subarray(0, split));
      setImmediate(() => req.end(body.subarray(split)));
    });
    assert.equal(status, 200);
    assert.equal(env.store.tree(tree.id).messages[0].text, 'Learn 🌲 trees');
    const bad = await fetch(`${env.origin}/api/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state.csrf },
      body: '{',
    });
    assert.equal(bad.status, 400);
  } finally {
    env.close();
  }
});

test('New chat saves nothing until the first send, which creates one tree titled from its question; rejected and concurrent sends add nothing', async () => {
  let release;
  const env = await open(
    join(dir, 'starter.sqlite'),
    (tree, text, emit) =>
      new Promise((resolve) => {
        release = () => {
          emit({ type: 'item', item: 'a', text: 'Answer' });
          emit({ type: 'status', status: 'completed' });
          resolve();
        };
      }),
  );
  try {
    // New chat is client-only: library and search are still empty before the first send.
    assert.deepEqual((await (await fetch(`${env.origin}/api/state`)).json()).trees, []);
    const created = await env.post('/api/trees', {});
    assert.equal(created.status, 201);
    const tree = await created.json();
    assert.equal(tree.title, 'New chat');
    const title = () => env.store.list().find((t) => t.id === tree.id).title;
    assert.equal((await env.post(`/api/trees/${tree.id}/messages`, { text: '  ' })).status, 400);
    assert.equal(title(), 'New chat');
    const question = '  What is a heap? ' + 'x'.repeat(300);
    const stream = env.post(`/api/trees/${tree.id}/messages`, { text: question });
    await until(() => release);
    assert.equal(title(), question.trim().slice(0, 200));
    assert.equal(
      (await env.post(`/api/trees/${tree.id}/messages`, { text: 'First question' })).status,
      409,
    );
    release();
    const events = await (await stream).text();
    assert.ok(
      events.includes(`"title":${JSON.stringify(question.trim().slice(0, 200))}`),
      'saved event carries the new title',
    );
    release = undefined;
    const second = env.post(`/api/trees/${tree.id}/messages`, { text: 'Second question' });
    await until(() => release);
    release();
    await (await second).text();
    assert.equal(title(), question.trim().slice(0, 200), 'later questions keep the title');
    assert.equal(env.store.list().length, 1, 'the first send created exactly one tree');
    assert.deepEqual(
      env.store.tree(tree.id).messages.map((m) => [m.role, m.text]),
      [
        ['user', question],
        ['assistant', 'Answer'],
        ['user', 'Second question'],
        ['assistant', 'Answer'],
      ],
    );
    const next = await env.post('/api/trees', {});
    assert.equal(next.status, 201, 'every first send creates its own tree; nothing is reused');
    assert.notEqual((await next.json()).id, tree.id);
  } finally {
    env.close();
  }
});

test('startup pruning removes trees with no messages and keeps every tree with a message and its focused chats', async () => {
  const path = join(dir, 'prune.sqlite');
  const store = new Store(path);
  const empty = store.create(),
    kept = store.create('Kept');
  const messageId = store.message(kept.id, 'assistant', 'A reply', 'completed');
  const child = store.branch(
    kept,
    { messageId, start: 0, end: 1, text: 'A', question: 'Why?' },
    'Context',
  );
  store.close();
  const env = await open(path, complete);
  try {
    assert.equal(env.store.pruneEmpty(), 1);
    assert.deepEqual(
      env.store
        .list()
        .map((t) => t.id)
        .sort(),
      [kept.id, child.id].sort(),
    );
    assert.equal(env.store.tree(empty.id), undefined);
    assert.deepEqual(
      await (await fetch(`${env.origin}/api/search?q=new`)).json(),
      [],
      'search never lists the empty tree',
    );
    assert.equal(env.store.pruneEmpty(), 0);
  } finally {
    env.close();
  }
});
