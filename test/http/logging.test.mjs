import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open, complete, directive, videoResponse, fakeRender } from '../support/video-kit.mjs';

const usage = { input: 12, output: 7, cacheRead: 3 };
const capture = async (t, provider, options = {}) => {
  const logs = [];
  const env = await open(provider, { ...options, log: (line) => logs.push(line) });
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  return { ...env, logs };
};

test('chat logs request and model start/finish with actual model, usage and duration; private content stays out', async (t) => {
  const question = 'PRIVATE learner question',
    reply = 'PRIVATE tutor reply';
  const env = await capture(t, {
    generate: async (_tree, _text, emit, save) => {
      save('private-thread', 'actual-model');
      emit({ type: 'usage', usage });
      complete(emit, reply);
    },
  });
  const tree = env.store.create('PRIVATE title', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: question })).text();
  // No quick thinking model: the placeholder title stays and one warning says so.
  assert.equal(env.logs.length, 4);
  assert.match(env.logs[0], / WARN title kept placeholder .*task="title"/);
  assert.match(env.logs[1], / INFO model started .*task="chat" provider="codex"/);
  assert.match(
    env.logs[2],
    / INFO model finished .*model="actual-model" input=12 output=7 cacheRead=3 ms=\d+/,
  );
  assert.match(
    env.logs[3],
    new RegExp(
      ` INFO http request method="POST" path="/api/trees/${tree.id}/messages" status=200 ms=\\d+`,
    ),
  );
  assert.doesNotMatch(env.logs.join('\n'), /PRIVATE|private-thread/);
  assert.equal(env.store.usageEvents().events.length, 1);
});

test('failed provider logs its cause and next step without echoed learner text, streamed output or credentials', async (t) => {
  const question = 'PRIVATE_QUESTION',
    reply = 'PRIVATE_REPLY';
  const env = await capture(t, {
    generate: async (_tree, _text, emit) => {
      emit({ type: 'delta', item: 'answer', text: 'PRIVATE_' });
      emit({ type: 'delta', item: 'answer', text: 'REPLY' });
      emit({ type: 'usage', usage });
      throw new Error(`Quota exhausted: ${question} ${reply} Bearer abc123 api_key=xyz456`);
    },
  });
  const tree = env.store.create('Failure', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: question })).text();
  const failed = env.logs.find((line) => line.includes(' ERROR model failed '));
  assert.match(failed, /task="chat".*input=12.*ms=\d+.*cause="Quota exhausted:/);
  assert.match(failed, /next="Check provider sign-in or endpoint settings, then retry\."/);
  assert.doesNotMatch(env.logs.join('\n'), /PRIVATE_|QUESTION|REPLY|abc123|xyz456/);
});

test('static assets, media files and polling are silent; API query strings and arbitrary paths stay private', async (t) => {
  const assets = mkdtempSync(join(tmpdir(), 'tt-log-assets-'));
  writeFileSync(join(assets, 'asset.js'), 'export {};');
  const env = await capture(t, { generate: async () => {} }, { assets });
  const asset = await env.get('/asset.js');
  assert.equal(asset.status, 200);
  await asset.text();
  const tree = env.store.create('Poll', 'codex');
  for (const path of [
    '/api/state',
    '/api/previews',
    `/api/trees/${tree.id}`,
    `/api/trees/${tree.id}/artifacts/missing`,
    `/api/videos/missing/media`,
    '/missing-static.js',
  ])
    await (await env.get(path)).text();
  assert.deepEqual(env.logs, []);
  await (await env.get('/api/search?q=PRIVATE_SEARCH&api_key=PRIVATE_KEY')).text();
  assert.equal(env.logs.length, 1);
  assert.match(env.logs[0], /path="\/api\/search" status=200/);
  await (await env.get('/api/PRIVATE_PATH')).text();
  assert.match(
    env.logs.at(-1),
    / WARN http request .*path="\/api\/:id" status=404 .*cause="Not Found".*next=/,
  );
  assert.doesNotMatch(env.logs.join('\n'), /PRIVATE|api_key|q=/);
});

test('unexpected HTTP failures log a safe cause and repair step', async (t) => {
  const env = await capture(t, { generate: async () => {} });
  t.mock.method(env.store, 'search', () => {
    throw Object.assign(new Error('PRIVATE disk path'), { code: 'EIO' });
  });
  const response = await env.get('/api/search?q=PRIVATE_QUERY');
  assert.equal(response.status, 500);
  await response.text();
  assert.match(env.logs[0], / ERROR http request .*status=500 .*cause="EIO" next=/);
  assert.doesNotMatch(env.logs.join('\n'), /PRIVATE/);
});

test('suggestion and compaction calls log their task and selected model at existing usage boundaries', async (t) => {
  const env = await capture(
    t,
    {
      generate: async (tree, _text, emit) => {
        emit({ type: 'usage', usage });
        complete(
          emit,
          tree.instructions?.startsWith('You mark')
            ? '{"suggestions":[]}'
            : tree.instructions?.startsWith('You write the background')
              ? 'PRIVATE compact summary.'
              : 'PRIVATE parent reply.',
        );
      },
    },
    { suggestions: true },
  );
  env.store.saveSuggestionSettings({
    enabled: true,
    model: { provider: 'codex', model: 'fixture-model' },
    effort: null,
  });
  const tree = env.store.create('Parent', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'PRIVATE question' })).text();
  await env.app.settled();
  const reply = env.store.tree(tree.id).messages.at(-1);
  const response = await env.post(`/api/trees/${tree.id}/branches`, {
    messageId: reply.id,
    text: 'PRIVATE',
    start: 0,
    end: 7,
    question: 'PRIVATE child question',
  });
  assert.equal(response.status, 201, await response.text());
  await env.app.settled();
  for (const task of ['chat', 'suggestions', 'compaction', 'title']) {
    const finished = env.logs.find(
      (line) => line.includes(' model finished ') && line.includes(`task="${task}"`),
    );
    assert.match(finished, /input=12 output=7 cacheRead=3 ms=\d+/);
  }
  assert.match(
    env.logs.find(
      (line) => line.includes(' model finished ') && line.includes('task="suggestions"'),
    ),
    /model="fixture-model"/,
  );
  assert.doesNotMatch(env.logs.join('\n'), /PRIVATE|compact summary|parent reply/);
  assert.deepEqual(
    env.store
      .usageEvents()
      .events.map((e) => e.task)
      .sort(),
    ['chat', 'compaction', 'suggestions', 'title'],
  );
});

test('video logs plan, cuts, narration, playable, 25% rendering steps and saved with no generated content', async (t) => {
  const env = await capture(
    t,
    {
      generate: async (tree, _text, emit) => {
        emit({ type: 'usage', usage });
        complete(emit, tree.id ? 'PRIVATE reply.' + directive : videoResponse(tree));
      },
    },
    {
      videoSnapshot: async () => {},
      videoRender: async (workspace, output, signal, progress) => {
        for (const value of [0.1, 0.26, 0.29, 0.2, 0.8, 0.99, 1, 1]) progress(value);
        return fakeRender(workspace, output, signal);
      },
    },
  );
  const tree = env.store.create('Video', 'codex');
  await (
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video. PRIVATE_QUESTION' })
  ).text();
  await env.app.settled();
  const row = env.store.tree(tree.id).artifacts[0];
  assert.equal(row.status, 'ready', row.error);
  const media = env.logs.filter((line) => line.includes(' media '));
  for (const stage of ['plan', 'cuts', 'cuts written', 'narration', 'playable', 'saved'])
    assert.ok(
      media.some((line) => line.includes(` media ${stage} `)),
      stage,
    );
  assert.deepEqual(
    media
      .filter((line) => line.includes(' media render '))
      .map((line) => Number(/progress=(\d+)/.exec(line)[1])),
    [25, 50, 75, 100],
  );
  assert.equal(
    env.logs.filter((line) => line.includes(' model finished ') && line.includes('task="video"'))
      .length,
    2,
  );
  for (const stage of ['plan', 'cut'])
    assert.ok(
      env.logs.some(
        (line) => line.includes(' model finished ') && line.includes(`stage="${stage}"`),
      ),
    );
  assert.doesNotMatch(
    env.logs.join('\n'),
    /PRIVATE|Winners advance|PRIVATE_SOURCE_MARKER|AbsoluteFill|recurringObjects/,
  );
});

for (const kind of ['visual', 'diagram'])
  test(`${kind} logs metered generation and its saved stage without markup or source`, async (t) => {
    const { block, source } = await import('../support/visual-kit.mjs');
    const diagram = await import('../support/diagram-kit.mjs');
    const env = await capture(
      t,
      {
        generate: async (tree, _text, emit) => {
          emit({ type: 'usage', usage });
          complete(
            emit,
            tree.id
              ? kind === 'visual'
                ? block()
                : diagram.directive
              : kind === 'visual'
                ? source
                : diagram.source,
          );
        },
      },
      { diagramParse: async () => true },
    );
    const tree = env.store.create('Media', 'codex');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'PRIVATE question' })).text();
    await env.app.settled();
    assert.equal(env.store.tree(tree.id).artifacts[0].status, 'ready');
    assert.ok(
      env.logs.some(
        (line) =>
          line.includes(' model finished ') &&
          line.includes('task="diagram"') &&
          line.includes('input=12'),
      ),
    );
    assert.ok(env.logs.some((line) => line.includes(' media saved ')));
    if (kind === 'visual') assert.ok(env.logs.some((line) => line.includes('stage="visual"')));
    assert.doesNotMatch(env.logs.join('\n'), /PRIVATE|<svg|flowchart|Winner A|Two winners/);
  });
