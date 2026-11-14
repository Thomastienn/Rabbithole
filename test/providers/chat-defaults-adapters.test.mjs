import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI } from '../support/fake-openai.mjs';
import { start } from '../support/chat-defaults-kit.mjs';

test('HTTP settings and conversation effort reach real Claude/Codex adapters and the compatible upstream, including clearing overrides', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-effort-adapters-')),
    traffic = [],
    fake = await fakeOpenAI(t);
  fake.models[0].supported_reasoning_efforts = ['low', 'high'];
  const launch = (command, args, options) => {
    const call = { command, args, env: options.env, input: [] };
    traffic.push(call);
    const child = spawn(
      process.execPath,
      ['test/support/protocol-fixture.mjs', ...(command === 'claude' ? args : [])],
      { ...options, cwd: process.cwd() },
    );
    if (command === 'codex') {
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (data) => {
        call.input.push(JSON.parse(data));
        return write(data);
      };
    }
    return child;
  };
  const store = new Store(join(dir, 'trees.sqlite')),
    endpoint = new OpenAI(dir);
  endpoint.save({ baseUrl: fake.baseUrl, apiKey: 'effort-fixture-key' });
  const providers = {
    claude: new Claude(dir, launch, (cmd, args, opts, cb) => cb(null, '{"loggedIn":true}')),
    codex: new Codex({ token: async () => 'fixture-token' }, dir, launch),
    openai: endpoint,
  };
  const app = createApp({
    store,
    providers,
    endpoint,
    defaultProvider: 'claude',
    dir,
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(origin + '/api/state')).json();
  const post = (path, body = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const previous = process.env.CLAUDE_CODE_EFFORT_LEVEL;
  process.env.CLAUDE_CODE_EFFORT_LEVEL = 'max';
  try {
    const catalog = await (await fetch(origin + '/api/models')).json();
    assert.deepEqual(catalog.models.find((m) => m.provider === 'codex' && m.isDefault).efforts, [
      'low',
      'medium',
      'high',
    ]);
    assert.deepEqual(
      catalog.models.find((m) => m.provider === 'openai' && m.model === 'second-model').efforts,
      [],
    );
    for (const [provider, model] of [
      ['claude', 'sonnet'],
      ['codex', 'fixture-model'],
      ['openai', 'local-tutor'],
    ]) {
      assert.equal(
        (await post('/api/settings/chat', { provider, model, effort: 'high' })).status,
        200,
      );
      const root = await (await post('/api/trees')).json();
      for (const effort of ['high', null, 'low']) {
        assert.equal(
          (await post(`/api/trees/${root.id}/model`, { provider, model, effort })).status,
          200,
        );
        assert.match(
          await (await post(`/api/trees/${root.id}/messages`, { text: 'Explain a tree' })).text(),
          /"status":"completed"/,
        );
        if (provider === 'claude') {
          const call = traffic.filter((c) => c.command === 'claude').at(-1),
            index = call.args.indexOf('--effort');
          assert.equal(index < 0 ? null : call.args[index + 1], effort);
          assert.equal(
            call.env.CLAUDE_CODE_EFFORT_LEVEL,
            effort ?? 'max',
            'explicit choices override the learner environment; unset preserves it',
          );
        } else if (provider === 'codex') {
          const call = traffic
            .flatMap((c) => c.input)
            .filter((r) => r.method === 'turn/start')
            .at(-1);
          assert.equal(
            call.params.effort,
            effort ?? 'medium',
            'clearing effort resolves the provider default, not a sticky prior override',
          );
        } else
          assert.equal(
            fake.calls.filter((c) => c.body).at(-1).body.reasoning_effort,
            effort ?? undefined,
          );
      }
    }
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CODE_EFFORT_LEVEL;
    else process.env.CLAUDE_CODE_EFFORT_LEVEL = previous;
    await app.stop();
    store.close();
  }
});

test('smart model and effort follow global chat defaults independently, survive restart and ignore conversation overrides', async () => {
  let env = await start();
  try {
    const follow = { model: null, followEffort: true, effort: null };
    assert.deepEqual(await env.get('/api/settings/smart'), {
      ...follow,
      resolved: { provider: 'claude', model: null, effort: null },
    });
    await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: 'high' });
    assert.deepEqual(
      (await env.get('/api/settings/smart')).resolved,
      { provider: 'codex', model: 'chat', effort: 'high' },
      'following is dynamic',
    );
    // A conversation override never moves what smart follows.
    const root = await (await env.post('/api/trees')).json();
    await env.post(`/api/trees/${root.id}/model`, {
      provider: 'openai',
      model: 'plain',
      effort: null,
    });
    assert.deepEqual((await env.get('/api/settings/smart')).resolved, {
      provider: 'codex',
      model: 'chat',
      effort: 'high',
    });

    // Pinning effort alone keeps following the chat model.
    let saved = await (
      await env.post('/api/settings/smart', { followEffort: false, effort: 'low' })
    ).json();
    assert.deepEqual(saved, {
      model: null,
      followEffort: false,
      effort: 'low',
      resolved: { provider: 'codex', model: 'chat', effort: 'low' },
    });
    await env.post('/api/settings/chat', { provider: 'claude', model: 'chat', effort: 'high' });
    assert.deepEqual((await env.get('/api/settings/smart')).resolved, {
      provider: 'claude',
      model: 'chat',
      effort: 'low',
    });

    // Pinning the model alone keeps following chat effort once effort is followed again.
    await env.post('/api/settings/smart', { followEffort: true });
    saved = await (
      await env.post('/api/settings/smart', { model: { provider: 'openai', model: 'chat' } })
    ).json();
    assert.deepEqual(saved, {
      model: { provider: 'openai', model: 'chat' },
      followEffort: true,
      effort: null,
      resolved: { provider: 'openai', model: 'chat', effort: 'high' },
    });
    await env.post('/api/settings/chat', { provider: 'codex', model: 'plain', effort: null });
    assert.deepEqual((await env.get('/api/settings/smart')).resolved, {
      provider: 'openai',
      model: 'chat',
      effort: null,
    });

    // Same model as chat with a different pinned effort, including Provider default.
    saved = await (
      await env.post('/api/settings/smart', {
        model: { provider: 'codex', model: 'chat' },
        followEffort: false,
        effort: null,
      })
    ).json();
    assert.deepEqual(saved.resolved, { provider: 'codex', model: 'chat', effort: null });
    for (const body of [
      { followEffort: false, effort: 'max' },
      { model: { provider: 'codex', model: 'plain' }, followEffort: false, effort: 'low' },
      { model: { provider: 'missing', model: 'chat' } },
      { model: { provider: 'codex', model: 'gone' } },
      { followEffort: 'no' },
      {},
    ]) {
      assert.equal((await env.post('/api/settings/smart', body)).status, 400, JSON.stringify(body));
    }
    assert.equal(env.calls.length, 0, 'configuring roles starts no model call');
    const chat = await env.get('/api/settings/chat');
    await env.close();

    env = await start(env.dir);
    assert.deepEqual(await env.get('/api/settings/smart'), {
      model: { provider: 'codex', model: 'chat' },
      followEffort: false,
      effort: null,
      resolved: { provider: 'codex', model: 'chat', effort: null },
    });
    assert.deepEqual(
      await env.get('/api/settings/chat'),
      chat,
      'smart never rewrites chat defaults',
    );
    // A signed-out provider is reported, never substituted.
    env.providers.openai.models = async () => {
      throw new Error('offline');
    };
    const offline = await env.post('/api/settings/smart', {
      model: { provider: 'openai', model: 'chat' },
    });
    assert.equal(offline.status, 502);
    assert.deepEqual((await env.get('/api/settings/smart')).model, {
      provider: 'codex',
      model: 'chat',
    });
  } finally {
    await env.close();
  }
});
