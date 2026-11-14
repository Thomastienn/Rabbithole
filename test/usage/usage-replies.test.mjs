import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { conversationContext } from '../../src/chat/turn.ts';
import { start } from '../support/usage-kit.mjs';

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
