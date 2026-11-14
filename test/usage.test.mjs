import { test } from 'node:test';
import { fakeNarration } from './fake-narration.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { createApp } from '../server/app.mjs';
import { conversationContext } from '../src/turn.ts';

const launch = (command, args, options) =>
  spawn(
    process.execPath,
    [
      fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url)),
      ...(command === 'claude' ? args : []),
    ],
    options,
  );

async function start(dir) {
  const store = new Store(join(dir, 'trees.sqlite'));
  const claude = new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}'));
  const codex = new Codex({ token: async () => 'fixture-token' }, dir, launch);
  const app = createApp({
    store,
    dir,
    providers: { claude, codex },
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async (path) => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const post = async (path, data = {}) =>
    (
      await fetch(origin + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(data),
      })
    ).text();
  return {
    store,
    get,
    post,
    origin,
    headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
    close: async () => {
      await app.stop();
      store.close();
    },
  };
}
const replies = (tree) =>
  tree.messages
    .filter((m) => m.role === 'assistant')
    .map((m) => ({ status: m.status, usage: m.usage }));

test('native protocol context windows stay with the reported model across restart; the meter uses one call, not cumulative usage', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-context-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const root = JSON.parse(await env.post('/api/trees'));
  env.store.model(root.id, null); // Legacy default: native saveThread resolves the model after reporting usage.
  await env.post(`/api/trees/${root.id}/messages`, { text: 'Explain context window' });
  let tree = await env.get(`/api/trees/${root.id}`);
  assert.deepEqual(tree.messages.at(-1).usage.context, {
    provider: 'claude',
    model: 'sonnet',
    limit: 200000,
  });
  assert.deepEqual(conversationContext(tree), { used: 150, limit: 200000 });
  await env.post(`/api/trees/${root.id}/model`, { provider: 'codex', model: 'fixture-model' });
  tree = await env.get(`/api/trees/${root.id}`);
  assert.deepEqual(
    conversationContext(tree),
    { used: 150, limit: undefined },
    'a different model cannot reuse the prior model window',
  );
  await env.post(`/api/trees/${root.id}/messages`, { text: 'Continue context window' });
  await env.close();
  env = await start(dir);
  tree = await env.get(`/api/trees/${root.id}`);
  assert.deepEqual(tree.messages.at(-1).usage.context, {
    provider: 'codex',
    model: 'fixture-model',
    limit: 300000,
  });
  assert.deepEqual(
    conversationContext(tree),
    { used: 59, limit: 300000 },
    'only last input (including cache) plus output, not tokenUsage.total',
  );
  await env.post(`/api/trees/${root.id}/messages`, { text: 'No window this time' });
  assert.deepEqual(conversationContext(await env.get(`/api/trees/${root.id}`)), {
    used: 59,
    limit: undefined,
  });
  await env.post(`/api/trees/${root.id}/messages`, { text: 'Again, no usage' });
  assert.equal(
    conversationContext(await env.get(`/api/trees/${root.id}`)),
    undefined,
    'missing latest measurement never falls back to an older count',
  );
});

test('invalid provider context windows are not saved or shown as percentages', async (t) => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-context-invalid-')), 'trees.sqlite'));
  let contextWindow;
  const app = createApp({
    store,
    auth: { status: () => ({ connected: true }) },
    provider: {
      models: async () => [{ model: 'fixture', label: 'Fixture', isDefault: true }],
      generate: async (_tree, _text, emit) => {
        emit({ type: 'item', item: 'reply', text: 'Answer' });
        emit({ type: 'usage', usage: { input: 10, output: 5, cacheRead: 2, contextWindow } });
        emit({ type: 'status', status: 'completed' });
      },
    },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const root = store.create('Unknown window');
  for (contextWindow of [undefined, null, 0, -1, 1.5, '200000', Number.MAX_SAFE_INTEGER + 1]) {
    await (
      await fetch(`${origin}/api/trees/${root.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify({ text: 'Question' }),
      })
    ).text();
    assert.deepEqual(conversationContext(store.tree(root.id)), { used: 17, limit: undefined });
  }
});

test('provider-reported usage is saved per reply, survives restart and totals today; missing usage is never invented and failed calls count only what they reported', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-usage-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const claude = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${claude.id}/messages`, { text: 'Explain brackets' });
  await env.post(`/api/trees/${claude.id}/messages`, { text: 'Again, no usage' });
  const codex = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${codex.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'Explain rounds' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'Codex, no usage' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'fail' });

  const claudeUsage = { input: 103, output: 7, cacheRead: 40 },
    codexUsage = { input: 30, output: 9, cacheRead: 20 };
  const strip = (rows) =>
    rows.map((r) => ({
      ...r,
      usage: r.usage && {
        input: r.usage.input,
        output: r.usage.output,
        cacheRead: r.usage.cacheRead,
      },
    }));
  const check = async () => {
    assert.deepEqual(strip(replies(await env.get(`/api/trees/${claude.id}`))), [
      { status: 'completed', usage: claudeUsage },
      { status: 'completed', usage: null },
    ]);
    assert.deepEqual(strip(replies(await env.get(`/api/trees/${codex.id}`))), [
      { status: 'completed', usage: codexUsage },
      { status: 'completed', usage: null },
      { status: 'failed', usage: null },
    ]);
    // The failed Codex turn keeps no per-reply usage, but its reported consumption counts in today's total.
    assert.deepEqual((await env.get('/api/state')).usage, {
      input: 163,
      output: 25,
      cacheRead: 80,
      replies: 3,
    });
  };
  await check();
  await env.close();
  env = await start(dir);
  await check();
  // Yesterday's usage is outside today's total.
  env.store.db
    .prepare(
      "UPDATE usage_events SET at=0 WHERE id IN (SELECT 'chat:'||id FROM messages WHERE tree=?)",
    )
    .run(codex.id);
  assert.deepEqual((await env.get('/api/state')).usage, {
    input: 103,
    output: 7,
    cacheRead: 40,
    replies: 1,
  });
});

test('a canceled Codex reply keeps no usage', async (t) => {
  const env = await start(mkdtempSync(join(tmpdir(), 'tt-usage-cancel-')));
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
  const pending = env.post(`/api/trees/${tree.id}/messages`, { text: 'hold' });
  while (!(await env.get('/api/state')).active.includes(tree.id))
    await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 200));
  await env.post(`/api/trees/${tree.id}/stop`);
  await pending;
  assert.deepEqual(replies(await env.get(`/api/trees/${tree.id}`)), [
    { status: 'interrupted', usage: null },
  ]);
});

test('usage history migrates once, keeps attribution and unavailable calls, survives restart and deletion, filters ranges and never duplicates', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-usage-history-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const tree = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain brackets' });
  // Simulate a database from before durable history: only per-message usage exists.
  await env.close();
  const old = new Store(join(dir, 'trees.sqlite'));
  old.db.exec('DROP TABLE usage_events');
  const reply = old.tree(tree.id).messages.find((m) => m.role === 'assistant');
  old.db
    .prepare("UPDATE messages SET usage=json_set(usage,'$.at',?) WHERE id=?")
    .run(new Date(2025, 11, 31, 23, 30).getTime(), reply.id);
  old.close();

  env = await start(dir);
  const migrated = (await env.get('/api/usage')).events;
  // Historical provider/model were never saved, so they stay unknown.
  assert.deepEqual(migrated, [
    {
      at: new Date(2025, 11, 31, 23, 30).getTime(),
      provider: null,
      model: null,
      task: 'chat',
      input: 103,
      output: 7,
      cacheRead: 40,
    },
  ]);

  await env.post(`/api/trees/${tree.id}/messages`, { text: 'Again, no usage' });
  const codex = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${codex.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'Explain rounds' });
  const events = (await env.get('/api/usage')).events;
  assert.deepEqual(
    events.slice(1).map(({ at, ...e }) => e),
    [
      {
        provider: 'claude',
        model: events[1].model,
        task: 'chat',
        input: null,
        output: null,
        cacheRead: null,
      },
      {
        provider: 'codex',
        model: 'fixture-model',
        task: 'chat',
        input: 30,
        output: 9,
        cacheRead: 20,
      },
    ],
  );
  // Codex reports cached input inside its input total; history stores disjoint counts so totals never double count.
  assert.equal(events[2].input + events[2].cacheRead, 50);

  // Repeated completion and reopening do not add rows.
  const codexReply = (await env.get(`/api/trees/${codex.id}`)).messages.at(-1).id;
  env.store.record(
    `chat:${codexReply}`,
    'chat',
    { provider: 'codex', model: 'fixture-model' },
    { input: 30, output: 9, cacheRead: 20 },
  );
  await env.close();
  env = await start(dir);
  assert.deepEqual((await env.get('/api/usage')).events, events);

  // Year boundary: the migrated call belongs to 2025 only.
  const range = async (a, b) =>
    (await env.get(`/api/usage?from=${a.getTime()}&to=${b.getTime()}`)).events.length;
  assert.equal(await range(new Date(2025, 0, 1), new Date(2026, 0, 1)), 1);
  assert.equal(await range(new Date(2024, 0, 1), new Date(2025, 0, 1)), 0);
  assert.equal(
    await range(new Date(2026, 0, 1), new Date(2027, 0, 1)),
    events.filter((e) => new Date(e.at).getFullYear() === 2026).length,
  );
  assert.equal((await env.get('/api/usage')).first, events[0].at);

  // Deleting learning trees removes their content but never history; rows hold no conversation text or ids.
  for (const id of [tree.id, codex.id])
    assert.equal(
      (
        await fetch(env.origin + `/api/trees/${id}/delete`, {
          method: 'POST',
          headers: env.headers,
          body: JSON.stringify({ conversation: id }),
        })
      ).status,
      200,
    );
  assert.deepEqual((await env.get('/api/usage')).events, events);
  assert.deepEqual(
    env.store.db
      .prepare('PRAGMA table_info(usage_events)')
      .all()
      .map((c) => c.name),
    ['id', 'at', 'provider', 'model', 'task', 'input', 'output', 'cacheRead'],
  );
  assert.ok(
    !JSON.stringify(env.store.db.prepare('SELECT * FROM usage_events').all()).match(
      /brackets|rounds|Authoritative/,
    ),
  );
  await env.close();
  env = await start(dir);
  assert.deepEqual((await env.get('/api/usage')).events, events);
});

test('background compaction and diagram calls record actual provider/model per logical call; failed calls keep reported counts and unreported stay unavailable', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-usage-background-'));
  let env = await start(dir);
  t.after(async () => {
    await env.close();
  });
  const claude = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${claude.id}/messages`, { text: 'Show a diagram fixture request' });
  const reply = (await env.get(`/api/trees/${claude.id}`)).messages.at(-1);
  assert.equal((await env.get(`/api/trees/${claude.id}`)).artifacts[0].status, 'ready');
  // Two explicit branch attempts are two logical compaction calls.
  for (let i = 0; i < 2; i++)
    JSON.parse(
      await env.post(`/api/trees/${claude.id}/branches`, {
        messageId: reply.id,
        start: 2,
        end: 9,
        text: 'bracket',
        question: 'Why brackets?',
      }),
    );
  await env.post(`/api/trees/${claude.id}/messages`, { text: 'Now claude fails' });
  const codex = JSON.parse(await env.post('/api/trees'));
  await env.post(`/api/trees/${codex.id}/model`, { provider: 'codex', model: 'fixture-model' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'Explain, no usage' });
  await env.post(`/api/trees/${codex.id}/messages`, { text: 'fail' });

  const claudeUsage = { input: 103, output: 7, cacheRead: 40 },
    codexUsage = { input: 30, output: 9, cacheRead: 20 },
    none = { input: null, output: null, cacheRead: null };
  const events = (await env.get('/api/usage')).events;
  assert.deepEqual(
    events.map(({ at, ...e }) => e),
    [
      { provider: 'claude', model: 'sonnet', task: 'diagram', ...claudeUsage },
      { provider: 'claude', model: 'sonnet', task: 'chat', ...claudeUsage },
      { provider: 'claude', model: 'haiku', task: 'compaction', ...claudeUsage },
      { provider: 'claude', model: 'haiku', task: 'compaction', ...claudeUsage },
      { provider: 'claude', model: 'sonnet', task: 'chat', ...claudeUsage }, // failed run still reported its usage
      { provider: 'codex', model: 'fixture-model', task: 'chat', ...none },
      { provider: 'codex', model: 'fixture-model', task: 'chat', ...codexUsage }, // failed turn, Codex cache counted once
    ],
  );
  assert.equal((await env.get(`/api/trees/${claude.id}`)).messages.at(-1).status, 'failed');
  // Restart and deletion keep the same history; no rows hold content.
  await env.close();
  env = await start(dir);
  assert.deepEqual((await env.get('/api/usage')).events, events);
  for (const id of [claude.id, codex.id])
    await fetch(env.origin + `/api/trees/${id}/delete`, {
      method: 'POST',
      headers: env.headers,
      body: JSON.stringify({ conversation: id }),
    });
  assert.deepEqual((await env.get('/api/usage')).events, events);
  assert.ok(
    !JSON.stringify(env.store.db.prepare('SELECT * FROM usage_events').all()).match(
      /bracket|round|Authoritative|flowchart/i,
    ),
  );
});

test('video worker attempts record their own reported usage, including failed and canceled attempts; rendering adds none', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-usage-video-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const task = {
    title: 'Winners',
    description: 'Two winners meet.',
    intent: 'Animate winners.',
    excerpt: 'A and B advance.',
  };
  const source =
    '// Description: Two boxes meet.\n// Narration: "Winners advance."\nimport { AbsoluteFill } from \'remotion\';\nexport const durationInFrames = 30;\nexport default () => <AbsoluteFill>A + B</AbsoluteFill>;';
  const done = (emit, text) => {
    emit({ type: 'item', item: 'a', text });
    emit({ type: 'status', status: 'completed' });
  };
  let attempt = 0,
    renders = 0,
    holding;
  const held = new Promise((r) => {
    holding = r;
  });
  const provider = {
    models: async () => [{ model: 'worker-model', isDefault: true }],
    generate: async (tree, text, emit, saveThread, signal) => {
      if (!tree.instructions?.includes('Remotion'))
        return done(emit, 'Here.\n```treetutor-video\n' + JSON.stringify(task) + '\n```');
      if (text.includes('silent')) return emit({ type: 'status', status: 'failed' }); // no usage reported: never estimated
      emit({ type: 'usage', usage: { input: 10 + attempt, output: 5, cacheRead: 2 } });
      if (attempt++ === 0) return emit({ type: 'status', status: 'failed' });
      if (text.includes('hold')) {
        holding();
        await new Promise((r) => signal.addEventListener('abort', r, { once: true }));
        return emit({ type: 'status', status: 'interrupted' });
      }
      done(emit, source);
    },
  };
  const render = async (workspace, output) => {
    renders++;
    writeFileSync(
      output,
      Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4096, 1)]),
    );
    return { durationInFrames: 60, fps: 30 };
  };
  const app = createApp({
    store,
    provider,
    dir,
    videoRender: render,
    videoNarrate: fakeNarration,
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(origin + '/api/state')).json();
  const post = (path, body = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const tree = store.create('Video', 'codex', 'worker-model');
  const settle = async (id, status) => {
    for (let i = 0; i < 200 && store.artifact(tree.id, id).status !== status; i++)
      await new Promise((r) => setTimeout(r, 25));
    assert.equal(store.artifact(tree.id, id).status, status);
  };
  const video = async (text) => {
    await (await post(`/api/trees/${tree.id}/messages`, { text })).text();
    return store.tree(tree.id).artifacts.at(-1).id;
  };

  const first = await video('Make a video of winners');
  await settle(first, 'failed');
  await post(`/api/trees/${tree.id}/artifacts/${first}/retry`);
  await settle(first, 'ready');
  const hold = await video('Make a video, hold');
  await held; // cancel once the worker call is in flight
  await post(`/api/trees/${tree.id}/artifacts/${hold}/cancel`);
  await settle(hold, 'canceled');
  const silent = await video('Make a video, silent');
  await settle(silent, 'failed');
  for (
    let i = 0;
    i < 200 && store.usageEvents().events.filter((e) => e.task === 'video').length < 4;
    i++
  )
    await new Promise((r) => setTimeout(r, 25));

  const videos = store
    .usageEvents()
    .events.filter((e) => e.task === 'video')
    .map(({ at, ...e }) => e);
  const by = { provider: 'codex', model: 'worker-model', task: 'video' };
  assert.deepEqual(videos, [
    { ...by, input: 10, output: 5, cacheRead: 2 }, // failed attempt
    { ...by, input: 11, output: 5, cacheRead: 2 }, // explicit retry: its own attempt
    { ...by, input: 12, output: 5, cacheRead: 2 }, // canceled attempt keeps what it reported
    { ...by, input: null, output: null, cacheRead: null },
  ]);
  assert.equal(renders, 1);
  // The chat provider here reports nothing, so its rows stay unavailable rather than borrowing worker counts.
  assert.ok(
    store
      .usageEvents()
      .events.filter((e) => e.task === 'chat')
      .every((e) => e.input === null),
  );
});
