import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tutorContext } from '../../server/media/diagrams.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';
import {
  task,
  directive,
  composition,
  videoResponse,
  planFor,
  spatial,
  mp4,
  complete,
  until,
  open,
  job,
} from '../support/video-kit.mjs';

test('explicit video request creates one job with frozen input, publishes owned media and exposes only metadata to the tutor', async () => {
  const tutor = [],
    workers = [],
    suggestions = [];
  const provider = {
    generate: async (tree, text, emit) => {
      if (tree.instructions?.includes('Remotion')) {
        workers.push({ tree, text });
        return complete(emit, videoResponse(tree));
      }
      if (text.startsWith('Mark every term')) {
        suggestions.push(text);
        return complete(emit, '{"suggestions":[]}');
      }
      tutor.push({ tree, text });
      if (text.startsWith('Compact')) return complete(emit, 'Compact summary.');
      complete(emit, text.startsWith('Thanks') ? 'Continuing.' : 'Here is the idea.' + directive);
    },
  };
  const env = await open(provider, { suggestions: true });
  env.store.saveSuggestionSettings({
    enabled: true,
    model: { provider: 'codex', model: 'fixture-model' },
    effort: null,
  });
  try {
    const parent = env.store.create('Parent', 'codex');
    env.store.message(parent.id, 'user', 'UNRELATED SIBLING DISCUSSION', 'completed');
    const parentReply = env.store.message(
      parent.id,
      'assistant',
      'Peterson locks use a tournament tree.',
      'completed',
    );
    const child = env.store.branch(
      env.store.tree(parent.id),
      {
        messageId: parentReply,
        start: 0,
        end: 8,
        text: 'Peterson',
        question: 'How does Peterson fit?',
      },
      'Inherited snapshot.',
    );
    env.store.saveChatSettings({ provider: 'codex', model: 'fixture-model', effort: null });
    env.store.model(child.id, 'conversation-only-model');

    // An ordinary explanation never starts a video, even if the tutor emits a block.
    for (const text of [
      'Explain winners.',
      'Explain video encoding.',
      'How does animation work?',
      'Don’t make a video; explain it.',
    ]) {
      await (await env.post(`/api/trees/${child.id}/messages`, { text })).text();
    }
    assert.equal(env.store.tree(child.id).artifacts.length, 4);
    assert.ok(
      env.store
        .tree(child.id)
        .artifacts.every(
          (a) => a.kind === 'video' && a.status === 'failed' && /learner did not ask/.test(a.error),
        ),
      'unsolicited requests stay visible without starting generation',
    );
    assert.equal(workers.length, 0);

    const request = 'Make a video explaining how Peterson fits into this tournament tree.';
    const stream = await (
      await env.post(`/api/trees/${child.id}/messages`, { text: request })
    ).text();
    assert.ok(!stream.includes('rabbithole-video'));
    const ready = await until(() =>
      env.store.tree(child.id).artifacts.find((a) => a.status === 'ready'),
    );
    const saved = env.store.tree(child.id);
    assert.equal(saved.artifacts.length, 5);
    assert.equal(ready.kind, 'video');
    assert.equal(JSON.parse(ready.source).cuts[0].status, 'ready');
    assert.equal(ready.duration, 2.5);
    assert.equal(ready.description, 'Two labelled boxes slide together into a final box.');
    const [user, reply] = saved.messages.slice(-2);
    assert.equal(ready.message, reply.id);
    const input = JSON.parse(ready.input);
    assert.deepEqual(input, {
      selection: { provider: 'codex', model: 'fixture-model', effort: null },
      chat: { provider: 'codex', model: 'conversation-only-model', effort: null },
      request,
      intent: task.intent,
      excerpt: task.excerpt,
      inheritedContext: {
        snapshot: 'Inherited snapshot.',
        selectedPassage: 'Peterson',
        question: 'How does Peterson fit?',
      },
      sources: {
        conversation: child.id,
        requestMessage: user.id,
        replyMessage: reply.id,
        parentConversation: parent.id,
        parentMessage: parentReply,
      },
    });

    // The worker receives only the frozen input, in a fresh session, with its own instructions.
    assert.equal(workers.length, 2);
    assert.equal(workers[0].text, ready.input);
    assert.deepEqual(Object.keys(workers[0].tree).sort(), [
      'effort',
      'instructions',
      'model',
      'provider',
      'thread',
    ]);
    assert.equal(workers[0].tree.thread, null);
    assert.match(
      workers[0].tree.instructions,
      /explicitly asks for 3D, use "3d" for most cuts/,
    );
    // planFor cuts are 2D, so the cut writer gets no 3D guidance.
    assert.match(workers[1].tree.instructions, /planned cut\.dimension/);
    assert.doesNotMatch(workers[1].tree.instructions, /@remotion\/three|ThreeCanvas/);
    assert.match(
      workers[1].tree.instructions,
      /1920x1080[\s\S]*bottom 120 pixels[\s\S]*"\.\/kit"[\s\S]*never hard cuts[\s\S]*never the house style/,
    );
    assert.equal(
      workers[0].tree.model,
      'fixture-model',
      'smart follows the global default rather than the conversation override',
    );
    assert.equal(workers[1].tree.model, 'conversation-only-model', 'the chat model writes cuts');
    assert.ok(!workers[0].text.includes('UNRELATED SIBLING DISCUSSION'));

    // Media is served same-origin only for its owning conversation; private output was moved out.
    const media = await env.get(`/api/trees/${child.id}/artifacts/${ready.id}/media`);
    assert.equal(media.status, 200);
    assert.equal(media.headers.get('content-type'), 'video/mp4');
    assert.deepEqual(Buffer.from(await media.arrayBuffer()), mp4);
    assert.equal(
      (await env.get(`/api/trees/${parent.id}/artifacts/${ready.id}/media`)).status,
      404,
    );
    assert.deepEqual(
      readdirSync(join(env.dir, 'video-work', ready.id, ready.attempt, 'cut-0')).sort(),
      [
        'Video.tsx',
        'emphasis.json',
        'index.tsx',
        'kit.tsx',
        'narration.json',
        'public',
        'stock.json',
        'video-stock.tsx',
      ],
    );
    assert.ok(
      readFileSync(
        join(env.dir, 'video-work', ready.id, ready.attempt, 'cut-0', 'Video.tsx'),
        'utf8',
      ).includes('PRIVATE_SOURCE_MARKER'),
    );

    // Tutor history and provider-switch history carry only id, kind, title and description; compaction sees one "[Video: title — description]" line.
    await (await env.post(`/api/trees/${child.id}/messages`, { text: 'Thanks, continue.' })).text();
    const fresh = env.store.tree(child.id);
    const branch = await env.post(`/api/trees/${child.id}/branches`, {
      messageId: reply.id,
      start: 0,
      end: 4,
      text: 'Here',
      question: 'Why?',
    });
    assert.equal(branch.status, 201);
    assert.ok(
      tutorContext(fresh).messages.some((m) =>
        m.text.endsWith(
          'Ready artifacts (artifact metadata): ' +
            JSON.stringify([
              { id: ready.id, kind: 'video', title: task.title, description: ready.description },
            ]),
        ),
      ),
    );
    const histories = [
      JSON.stringify(tutor.at(-2).tree),
      JSON.stringify(tutorContext(fresh)),
      tutor.at(-1).text,
    ];
    for (const history of histories) {
      for (const field of history === tutor.at(-1).text
        ? [`[Video: ${task.title} — ${ready.description}]`]
        : [ready.id, task.title, ready.description])
        assert.ok(history.includes(field), field);
      for (const secret of [
        'PRIVATE_SOURCE_MARKER',
        'remotion',
        env.dir,
        'video-work',
        ready.attempt,
        ready.input,
      ])
        assert.ok(!history.includes(secret), secret);
    }
    assert.ok(suggestions.some((text) => text.includes('Continuing.')));
    for (const history of suggestions)
      for (const secret of [
        'PRIVATE_SOURCE_MARKER',
        'Remotion',
        'video-work',
        ready.attempt,
        ready.input,
      ])
        assert.ok(!history.includes(secret), secret);
  } finally {
    env.close();
  }
});

test('video HTTP requests route smart model and effort through the real Claude/Codex adapters in fresh sessions', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-adapters-')),
    traffic = [];
  const launch = (command, args, options) => {
    const call = { command, args, input: [] };
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
    } else {
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = (text) => {
        call.text = text;
        return end(text);
      };
    }
    return child;
  };
  const providers = {
    claude: new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}')),
    codex: new Codex({ token: async () => 'fixture-token' }, dir, launch),
  };
  const env = await open(null, { providers });
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  for (const [provider, model] of [
    ['claude', 'sonnet'],
    ['codex', 'fixture-model'],
  ]) {
    assert.equal(
      (
        await env.post('/api/settings/smart', {
          model: { provider, model },
          followEffort: false,
          effort: 'high',
        })
      ).status,
      200,
    );
    const tree = env.store.create('Video adapters', 'codex', 'fixture-model', 'low');
    const stream = await (
      await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video fixture request' })
    ).text();
    const ready = await until(() =>
      env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
    );
    const input = JSON.parse(ready.input);
    assert.deepEqual(input.selection, { provider, model, effort: 'high' });
    assert.ok(
      !stream.includes('PRIVATE_VIDEO') &&
        !stream.includes('selection') &&
        !stream.includes('attempt'),
    );
    // The smart selection plans; the conversation's chat model and effort write the cut.
    const codexCalls = traffic.filter((c) => c.command === 'codex').flatMap((c) => c.input);
    if (provider === 'claude') {
      const worker = traffic.filter((c) => c.command === 'claude').at(-1);
      assert.equal(worker.args[worker.args.indexOf('--model') + 1], model);
      assert.equal(worker.args[worker.args.indexOf('--effort') + 1], 'high');
      assert.ok(worker.args.includes('--session-id') && !worker.args.includes('--resume'));
      assert.equal(worker.args[worker.args.indexOf('--tools') + 1], '');
      assert.equal(worker.text, ready.input);
    } else {
      assert.ok(
        codexCalls.some(
          (r) =>
            r.method === 'thread/start' &&
            r.params.model === model &&
            r.params.baseInstructions.startsWith('You plan'),
        ),
      );
      assert.equal(
        codexCalls.findLast(
          (r) => r.method === 'turn/start' && r.params.input[0].text === ready.input,
        ).params.effort,
        'high',
      );
    }
    const cutStart = codexCalls.findLast(
        (r) =>
          r.method === 'thread/start' && /Follow the brief exactly/.test(r.params.baseInstructions),
      ),
      cutTurn = codexCalls.findLast(
        (r) => r.method === 'turn/start' && r.params.input[0].text.includes('"cut"'),
      );
    assert.equal(cutStart.params.model, 'fixture-model');
    assert.equal(cutTurn.params.effort, 'low');
    assert.equal(
      JSON.parse(cutTurn.params.input[0].text).cut.narration,
      'Each round keeps its winner.',
    );
    assert.equal(env.store.tree(tree.id).effort, 'low', 'worker effort never overwrites chat');
    assert.ok(!JSON.stringify(tutorContext(env.store.tree(tree.id))).includes('PRIVATE_VIDEO'));
    const usage = env.store.usageEvents().events.filter((e) => e.task === 'video');
    assert.ok(usage.some((e) => e.provider === provider && e.model === model));
    assert.deepEqual(
      [usage.at(-1).provider, usage.at(-1).model],
      ['codex', 'fixture-model'],
      'the cut is metered under the chat selection',
    );
  }
});

test('custom smart worker freezes inputs across Settings changes and explicit Retry, hides production, and never falls back', async (t) => {
  const fake = await fakeOpenAI(t),
    endpoint = new OpenAI(mkdtempSync(join(tmpdir(), 'tt-video-endpoint-')));
  fake.models[0].supported_reasoning_efforts = ['low', 'high'];
  const chatWorkers = [];
  const tutor = {
    models: async () => [{ model: 'chat-model', isDefault: true, efforts: ['low', 'high'] }],
    generate: async (tree, text, emit) => {
      assert.ok(!tree.instructions?.startsWith('You plan'), 'the chat provider never plans');
      if (!tree.id) {
        chatWorkers.push(tree);
        return complete(emit, composition);
      }
      complete(emit, 'Here is the idea.' + directive);
    },
  };
  let release, upstream;
  fake.reply = (_req, res, body) => {
    if (body.messages[0].content.startsWith('You plan')) {
      upstream = body;
      release = () => streamReply(res, [JSON.stringify(planFor())]);
    } else streamReply(res, [composition]);
  };
  const env = await open(tutor, { endpoint });
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  await env.post('/api/settings/endpoint', {
    baseUrl: fake.baseUrl,
    apiKey: 'video-smart-fixture',
  });
  await env.post('/api/settings/chat', { provider: 'codex', model: 'chat-model', effort: 'low' });
  assert.equal(
    (
      await env.post('/api/settings/smart', {
        model: { provider: 'openai', model: 'local-tutor' },
        followEffort: false,
        effort: 'high',
      })
    ).status,
    200,
  );
  assert.equal(
    fake.calls.filter((c) => c.body).length,
    0,
    'configuring roles makes no inference call',
  );
  const tree = env.store.create('Frozen', 'codex', 'chat-model', 'low');
  await (
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of this.' })
  ).text();
  await until(() => upstream);
  const original = env.store.tree(tree.id).artifacts[0],
    input = JSON.parse(original.input);
  assert.deepEqual(input.selection, { provider: 'openai', model: 'local-tutor', effort: 'high' });
  assert.equal(upstream.model, 'local-tutor');
  assert.equal(upstream.reasoning_effort, 'high');
  assert.deepEqual(
    upstream.messages.map((m) => m.role),
    ['system', 'user'],
  );
  assert.equal(upstream.messages[1].content, original.input);
  assert.equal(
    (await env.post('/api/settings/smart', { model: null, followEffort: true })).status,
    200,
  );
  await env.post('/api/settings/chat', { provider: 'codex', model: 'chat-model', effort: 'high' });
  assert.equal(env.store.artifact(tree.id, original.id).input, original.input);
  // Finishing uses the frozen selection; private work stays outside every public representation.
  release();
  await until(() => env.store.artifact(tree.id, original.id).status === 'ready');
  // The smart endpoint only plans; the conversation's frozen chat selection writes the cut.
  assert.equal(fake.calls.filter((c) => c.body).length, 1);
  assert.deepEqual(
    chatWorkers.map((w) => [w.model, w.effort]),
    [['chat-model', 'low']],
  );
  for (const path of [
    `/api/trees/${tree.id}`,
    `/api/trees/${tree.id}/artifacts/${original.id}`,
    `/api/previews?id=${tree.id}`,
  ]) {
    const visible = await (await env.get(path)).text();
    for (const secret of [
      'PRIVATE_SOURCE_MARKER',
      original.input,
      original.attempt,
      'video-work',
      'phase',
      'progress',
    ])
      assert.ok(!visible.includes(secret), secret);
  }
  // A separate failed attempt stays failed until explicit Retry and keeps the original smart pin.
  await env.post('/api/settings/smart', {
    model: { provider: 'openai', model: 'local-tutor' },
    followEffort: false,
    effort: 'high',
  });
  fake.reply = (_req, res) => streamReply(res, ['invalid PRIVATE_SCRIPT']);
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video again.' })).text();
  const failed = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
  );
  const count = fake.calls.filter((c) => c.body).length;
  await env.app.settled();
  assert.equal(fake.calls.filter((c) => c.body).length, count);
  await env.post('/api/settings/smart', { model: null, followEffort: true });
  fake.reply = (_req, res, body) =>
    streamReply(res, [videoResponse({ instructions: body.messages[0].content })]);
  await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`);
  await until(() => env.store.artifact(tree.id, failed.id).status === 'ready');
  assert.equal(fake.calls.filter((c) => c.body).at(-1).body.reasoning_effort, 'high');
  assert.equal(fake.calls.filter((c) => c.body).length, count + 1);
  // A cleared endpoint is an explicit failure, even though chat remains connected and Settings now follow it.
  env.store.cancelVideo(
    tree.id,
    env.store.pendingArtifact(tree.id, failed.message, 'Offline', 'Offline', 'video', failed.input)
      .id,
  );
  const offline = env.store.tree(tree.id).artifacts.at(-1);
  await env.post('/api/settings/endpoint/clear');
  await env.post(`/api/trees/${tree.id}/artifacts/${offline.id}/retry`);
  await until(() => env.store.artifact(tree.id, offline.id).status === 'failed');
  assert.equal(fake.calls.filter((c) => c.body).length, count + 1);
});
