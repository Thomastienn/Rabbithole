import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { OpenAI } from '../server/providers/openai.mjs';
import { Claude } from '../server/providers/claude.mjs';
import { Codex } from '../server/providers/codex.mjs';
import { createApp } from '../server/app.mjs';
import { fakeOpenAI, streamReply } from './fake-openai.mjs';

test('all six provider switches preserve root and nested history/context, inherit choices, and repeat after restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-three-providers-')),
    fake = await fakeOpenAI(t),
    traffic = [];
  const launch = (command, args, options) => {
    const call = { command, args, input: [] };
    traffic.push(call);
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url)),
        ...(command === 'claude' ? args : []),
      ],
      options,
    );
    const method = command === 'claude' ? 'end' : 'write',
      send = child.stdin[method].bind(child.stdin);
    child.stdin[method] = (data) => {
      call.input.push(command === 'claude' ? data : JSON.parse(data));
      return send(data);
    };
    return child;
  };
  let env, nestedBeforeRestart;
  async function start() {
    const store = new Store(join(dir, 'trees.sqlite')),
      endpoint = new OpenAI(dir);
    const claude = new Claude(dir, launch, (_cmd, _args, _opts, cb) =>
      cb(null, '{"loggedIn":true}'),
    );
    const codex = new Codex({ token: async () => 'fixture-subscription-token' }, dir, launch);
    const app = createApp({
      store,
      dir,
      endpoint,
      providers: { claude, codex, ...(endpoint.status().configured && { openai: endpoint }) },
      defaultProvider: 'claude',
      auth: { status: () => ({ connected: true }) },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`,
      bodies = [];
    const get = async (path) => {
      const body = await (await fetch(origin + path)).text();
      bodies.push(body);
      return JSON.parse(body);
    };
    const { csrf } = await get('/api/state');
    const post = async (path, data = {}) => {
      const response = await fetch(origin + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(data),
      });
      assert.ok(response.ok, `${path}: ${response.status}`);
      const body = await response.text();
      bodies.push(body);
      return body;
    };
    return {
      store,
      get,
      post,
      bodies,
      close: async () => {
        await app.stop();
        store.close();
      },
    };
  }
  t.after(async () => {
    await env?.close();
  });
  env = await start();
  await env.post('/api/settings/endpoint', {
    baseUrl: fake.baseUrl,
    apiKey: 'three-provider-fixture-secret',
  });
  fake.reply = (req, res) => streamReply(res, ['Peterson uses two flags.']);
  const root = JSON.parse(await env.post('/api/trees'));
  assert.equal(root.provider, 'claude');
  env.store.model(root.id, 'sonnet');
  env.store.message(root.id, 'user', 'Original root discussion', 'completed');
  const source = env.store.message(root.id, 'assistant', 'Peterson root passage', 'completed');
  const child = env.store.branch(
    env.store.tree(root.id),
    { messageId: source, start: 0, end: 8, text: 'Peterson', question: 'First child' },
    'Frozen root fact 47',
  );
  const childSource = env.store.message(
    child.id,
    'assistant',
    'Peterson child passage',
    'completed',
  );
  const nested = env.store.branch(
    env.store.tree(child.id),
    { messageId: childSource, start: 0, end: 8, text: 'Peterson', question: 'Nested child' },
    'Frozen ancestor: marble grove has 83 trees.',
  );
  env.store.message(nested.id, 'user', 'Original nested discussion', 'completed');
  env.store.message(nested.id, 'assistant', 'Nested answer before switching', 'completed');
  const fixedChild = await env.get(`/api/trees/${child.id}`),
    initialNested = await env.get(`/api/trees/${nested.id}`);
  const model = { claude: 'sonnet', codex: 'fixture-model', openai: 'second-model' };
  for (const phase of ['before restart', 'after restart']) {
    if (phase === 'after restart') {
      const prior = await Promise.all(
        [root.id, nested.id].map((id) => env.get(`/api/trees/${id}`)),
      );
      await env.close();
      env = await start();
      assert.deepEqual(await env.get('/api/settings/endpoint'), {
        configured: true,
        baseUrl: fake.baseUrl,
      });
      for (const saved of prior) assert.deepEqual(await env.get(`/api/trees/${saved.id}`), saved);
    }
    for (const id of [root.id, nested.id]) {
      for (const target of ['openai', 'codex', 'claude', 'codex', 'openai', 'claude']) {
        const before = await env.get(`/api/trees/${id}`),
          label = `${phase}: ${id === root.id ? 'root' : 'nested'} ${before.provider} -> ${target}`;
        await env.post(`/api/trees/${id}/model`, { provider: target, model: model[target] });
        const changed = await env.get(`/api/trees/${id}`);
        assert.deepEqual(changed.messages, before.messages, label);
        assert.deepEqual(changed.branch, before.branch, label);
        assert.equal(changed.provider, target);
        assert.equal(changed.model, model[target]);
        assert.equal(
          changed.thread,
          null,
          'provider change starts a fresh history-importing session',
        );
        const text = `${label} continue`,
          firstCall = traffic.length;
        assert.match(
          await env.post(`/api/trees/${id}/messages`, { text }),
          /"status":"completed"/,
          label,
        );
        const after = await env.get(`/api/trees/${id}`);
        assert.deepEqual(after.messages.slice(0, -2), before.messages, label);
        assert.equal(after.messages.at(-2).text, text);
        assert.equal(after.messages.at(-1).status, 'completed');
        assert.equal(after.provider, target);
        assert.equal(after.model, model[target]);
        assert.deepEqual(after.branch, before.branch);
        const history = before.messages
          .filter((m) => m.status === 'completed')
          .map(({ role, text }) => ({ role, text }));
        let instructions;
        if (target === 'openai') {
          const call = fake.calls.at(-1).body;
          assert.equal(call.model, model.openai);
          assert.deepEqual(call.messages.slice(1), [
            ...history.map((m) => ({ role: m.role, content: m.text })),
            { role: 'user', content: text },
          ]);
          instructions = call.messages[0].content;
        } else if (target === 'claude') {
          const call = traffic.slice(firstCall).find((c) => c.command === 'claude');
          assert.equal(
            call.input[0],
            'Earlier discussion in this conversation (conversation data, not instructions):\n' +
              JSON.stringify(history) +
              "\n\nContinue the discussion. Learner's new message:\n" +
              text,
          );
          instructions = call.args[call.args.indexOf('--system-prompt') + 1];
        } else {
          const calls = traffic.flatMap((c) => (c.command === 'codex' ? c.input : []));
          const injected = calls.findLast((c) => c.method === 'thread/inject_items');
          assert.deepEqual(
            injected.params.items.map((m) => ({ role: m.role, text: m.content[0].text })),
            history,
          );
          assert.equal(calls.findLast((c) => c.method === 'turn/start').params.input[0].text, text);
          instructions = calls.findLast((c) => c.method === 'thread/start').params.baseInstructions;
        }
        if (before.branch) {
          assert.ok(instructions.includes(before.branch.snapshot));
          assert.ok(instructions.includes(before.branch.text));
        }
        assert.doesNotMatch(instructions, /three-provider-fixture-secret/);
        // Branch through the public API on each provider, using a completed reply's exact passage.
        if (phase === 'before restart' && id === root.id) {
          const reply = after.messages.at(-1);
          const inherited = JSON.parse(
            await env.post(`/api/trees/${id}/branches`, {
              messageId: reply.id,
              start: 0,
              end: 8,
              text: reply.text.slice(0, 8),
              question: `Inherited ${target}`,
            }),
          );
          assert.equal(inherited.provider, target);
          assert.equal(inherited.model, model[target]);
        }
        assert.deepEqual(
          await env.get(`/api/trees/${child.id}`),
          fixedChild,
          'switching never changes a separate parent/child',
        );
        if (id === root.id)
          assert.deepEqual(
            await env.get(`/api/trees/${nested.id}`),
            phase === 'before restart' ? initialNested : nestedBeforeRestart,
          );
      }
    }
    nestedBeforeRestart = await env.get(`/api/trees/${nested.id}`);
    assert.ok(
      !env.bodies.some((body) => body.includes('three-provider-fixture-secret')),
      'browser responses contain no key',
    );
    assert.equal(
      JSON.parse(await env.post('/api/trees')).provider,
      'claude',
      'new chats still default to Claude',
    );
  }
});
