import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';
import { compacted } from '../support/branch-first.mjs';
import { open } from '../support/openai-kit.mjs';

for (const name of ['claude', 'codex'])
  test(`custom endpoint compaction and nested switching to/from ${name} preserve history through real adapters with protocol fixtures`, async (t) => {
    const fake = await fakeOpenAI(t),
      dir = mkdtempSync(join(tmpdir(), 'tt-openai-native-')),
      calls = [];
    const launch = (command, args, options) => {
      const call = { command, args, options, input: [] };
      calls.push(call);
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('../support/protocol-fixture.mjs', import.meta.url)),
          ...(command === 'claude' ? args : []),
        ],
        options,
      );
      const key = command === 'claude' ? 'end' : 'write',
        send = child.stdin[key].bind(child.stdin);
      child.stdin[key] = (data) => {
        call.input.push(command === 'claude' ? data : JSON.parse(data));
        return send(data);
      };
      return child;
    };
    const native =
      name === 'claude'
        ? new Claude(dir, launch, (cmd, args, opts, cb) => cb(null, '{"loggedIn":true}'))
        : new Codex({ token: async () => 'fixture-subscription-token' }, dir, launch);
    const { app, post, store, origin } = await open(t, { [name]: native });
    await post('/api/settings/endpoint', {
      baseUrl: fake.baseUrl,
      apiKey: 'switch-fixture-secret',
    });
    const root = store.create('Root', 'openai');
    store.model(root.id, 'local-tutor');
    await (await post(`/api/trees/${root.id}/messages`, { text: 'Root fact' })).text();
    const rootBefore = store.tree(root.id),
      reply = rootBefore.messages.at(-1);
    fake.reply = (req, res, body) =>
      streamReply(res, [
        body.messages[0].content.startsWith('You write the background')
          ? 'Frozen compaction fact'
          : 'Peterson uses two flags.',
      ]);
    const child = await compacted(
      app,
      origin,
      (
        await (
          await post(`/api/trees/${root.id}/branches`, {
            messageId: reply.id,
            start: 0,
            end: 8,
            text: 'Peterson',
            question: 'Explain Peterson',
          })
        ).json()
      ).id,
    );
    const compact = fake.calls.at(-1).body;
    assert.equal(
      compact.messages.length,
      2,
      'compaction is one isolated data prompt with its own instructions',
    );
    assert.match(compact.messages[0].content, /^You write the background/);
    assert.match(compact.messages[1].content, /Root fact/);
    assert.equal(child.branch.snapshot, 'Frozen compaction fact');
    assert.equal(child.provider, 'openai');
    assert.deepEqual(
      store.tree(root.id),
      rootBefore,
      'compaction never changes source discussion or session',
    );
    store.message(root.id, 'user', 'LATER ROOT MUST NOT ENTER CHILD', 'completed');
    await (await post(`/api/trees/${child.id}/messages`, { text: 'Custom child fact' })).text();
    const nativeModel = name === 'claude' ? 'sonnet' : 'fixture-model';
    assert.equal(
      (await post(`/api/trees/${child.id}/model`, { provider: name, model: nativeModel })).status,
      200,
    );
    assert.match(
      await (await post(`/api/trees/${child.id}/messages`, { text: 'Native child fact' })).text(),
      /"status":"completed"/,
    );
    const nativeInput = JSON.stringify(calls.map(({ args, input }) => ({ args, input })));
    assert.match(nativeInput, /Frozen compaction fact/);
    assert.match(nativeInput, /Custom child fact/);
    assert.doesNotMatch(nativeInput, /LATER ROOT MUST NOT ENTER CHILD|switch-fixture-secret/);
    for (const call of calls)
      assert.ok(
        !Object.values(call.options.env).includes('switch-fixture-secret'),
        'custom key never enters native process environments',
      );
    assert.equal(
      (await post(`/api/trees/${child.id}/model`, { provider: 'openai', model: 'second-model' }))
        .status,
      200,
    );
    assert.match(
      await (await post(`/api/trees/${child.id}/messages`, { text: 'Custom again' })).text(),
      /"status":"completed"/,
    );
    const continued = fake.calls.at(-1).body;
    assert.equal(continued.model, 'second-model');
    assert.deepEqual(
      continued.messages.slice(1).map((m) => m.content),
      [
        'Custom child fact',
        'Peterson uses two flags.',
        'Native child fact',
        'Authoritative original',
        'Custom again',
      ],
    );
    assert.match(continued.messages[0].content, /Frozen compaction fact/);
    assert.doesNotMatch(JSON.stringify(continued), /LATER ROOT MUST NOT ENTER CHILD/);
    assert.equal(store.tree(child.id).thread, null);
    const nested = await compacted(
      app,
      origin,
      (
        await (
          await post(`/api/trees/${child.id}/branches`, {
            messageId: store.tree(child.id).messages.at(-1).id,
            start: 0,
            end: 8,
            text: 'Peterson',
            question: 'Nested question',
          })
        ).json()
      ).id,
    );
    const nestedPrompt = fake.calls.at(-1).body.messages[1].content;
    assert.match(nestedPrompt, /Frozen compaction fact/);
    assert.match(nestedPrompt, /Native child fact/);
    assert.equal(nested.provider, 'openai');
    assert.equal(nested.model, 'second-model');
    assert.equal(store.tree(child.id).branch.snapshot, 'Frozen compaction fact');
    assert.equal(store.tree(root.id).messages.length, 3, 'child discussion never enters the root');
    // A failed custom turn restores the last working native selection/session.
    await post(`/api/trees/${child.id}/model`, { provider: name, model: nativeModel });
    await (await post(`/api/trees/${child.id}/messages`, { text: 'Native again' })).text();
    const working = store.tree(child.id);
    await post(`/api/trees/${child.id}/model`, { provider: 'openai', model: 'local-tutor' });
    fake.reply = (req, res) => {
      res.writeHead(401);
      res.end('switch-fixture-secret');
    };
    assert.match(
      await (await post(`/api/trees/${child.id}/messages`, { text: 'Fail custom' })).text(),
      /"status":"failed"/,
    );
    const after = store.tree(child.id);
    assert.deepEqual(
      [after.provider, after.model, after.thread],
      [name, nativeModel, working.thread],
    );
  });
