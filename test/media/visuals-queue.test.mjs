import { test } from 'node:test';
import assert from 'node:assert/strict';
import { task, block, source, complete, deferred, until, open } from '../support/visual-kit.mjs';

test('closed blocks start smart workers while text streams, queue in order at three, freeze requests and record every call', async () => {
  const first = deferred(),
    more = deferred(),
    finish = deferred(),
    holds = [],
    calls = [],
    chatCalls = [];
  const env = await open(
    {
      generate: async (tree, text, emit, save) => {
        chatCalls.push({ tree, text });
        save('private-tutor-thread', 'chat');
        if (text === 'Continue') return complete(emit, 'More about rounds.');
        emit({ type: 'delta', item: 'answer', text: 'First paragraph.\n```treetutor-vis' });
        await first.promise;
        emit({
          type: 'delta',
          item: 'answer',
          text:
            'ual\n' +
            JSON.stringify({ ...task, title: 'Step 0', ignored: 'DO NOT FORWARD' }) +
            '\n```',
        });
        await more.promise;
        emit({
          type: 'delta',
          item: 'answer',
          text:
            Array.from({ length: 6 }, (_, i) => block(`Step ${i + 1}`)).join('') +
            '\n\nLast paragraph.',
        });
        await finish.promise;
        emit({ type: 'status', status: 'completed' });
      },
    },
    {
      generate: async (tree, text, emit, save) => {
        calls.push({ tree, input: JSON.parse(text) });
        save('private-worker-thread', 'unrelated-worker-model');
        const hold = deferred();
        holds.push(hold);
        await hold.promise;
        complete(emit, source);
      },
    },
  );
  try {
    env.store.message(env.tree.id, 'user', 'UNRELATED PRIVATE TRANSCRIPT', 'completed');
    const response = await env.post(`/api/trees/${env.tree.id}/messages`, {
      text: 'Explain seven steps',
    });
    let stream = '';
    const consumed = (async () => {
      for await (const chunk of response.body) stream += Buffer.from(chunk).toString();
    })();
    assert.equal(calls.length, 0, 'an unclosed block starts no worker');
    first.resolve();
    await until(() => calls.length === 1);
    assert.equal((await env.get(`/api/trees/${env.tree.id}`)).messages.at(-1).status, 'streaming');
    await until(() => stream.includes('"status":"pending"'));
    more.resolve();
    await until(() => calls.length === 3);
    let saved = await env.get(`/api/trees/${env.tree.id}`);
    assert.equal(
      saved.artifacts.length,
      7,
      'all positions appear while the tutor is still writing',
    );
    assert.ok(saved.artifacts.every((a) => a.status === 'pending'));
    assert.equal(saved.artifacts[0].position, 'First paragraph.'.length);
    assert.equal(saved.messages.at(-1).text, 'First paragraph.\n\nLast paragraph.');
    assert.doesNotMatch(
      stream,
      /treetutor-|DO NOT FORWARD|private-worker|private-tutor|intent|excerpt/,
    );
    assert.equal(
      (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Duplicate' })).status,
      409,
    );
    await env.post('/api/settings/smart', {
      model: { provider: 'claude', model: 'smart' },
      followEffort: false,
      effort: 'low',
    });
    for (let i = 0; i < 7; i++) {
      await until(() => !!holds[i]);
      holds[i].resolve();
      if (i < 4) await until(() => calls.length === i + 4);
    }
    await until(async () =>
      (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every((a) => a.status === 'ready'),
    );
    assert.equal(
      (await env.get(`/api/trees/${env.tree.id}`)).messages.at(-1).status,
      'streaming',
      'visuals finish before the reply',
    );
    finish.resolve();
    await consumed;
    assert.deepEqual(
      calls.map((c) => c.input.request.title),
      Array.from({ length: 7 }, (_, i) => `Step ${i}`),
    );
    for (const [i, c] of calls.entries()) {
      assert.equal(c.tree.provider, 'claude');
      assert.equal(c.tree.model, 'smart');
      assert.equal(c.tree.effort, 'high');
      assert.equal(c.tree.thread, null);
      assert.equal(c.tree.messages, undefined);
      assert.equal(c.tree.branch, undefined);
      assert.deepEqual(
        c.input.earlierTitles,
        Array.from({ length: i }, (_, j) => `Step ${j}`),
      );
      assert.deepEqual(c.input.request, { ...task, title: `Step ${i}` });
      assert.doesNotMatch(
        JSON.stringify(c),
        /UNRELATED PRIVATE|DO NOT FORWARD|private-tutor|Explain seven steps/,
      );
    }
    const usage = (await env.get('/api/usage')).events.filter((e) => e.task === 'diagram');
    assert.equal(usage.length, 7);
    assert.ok(
      usage.every(
        (e) =>
          e.provider === 'claude' &&
          e.model === 'unrelated-worker-model' &&
          e.input === 10 &&
          e.output === 3 &&
          e.cacheRead === 2,
      ),
    );
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Continue' })).text();
    const history = JSON.stringify(chatCalls.at(-1).tree);
    assert.match(history, /Step 0|Two winners meet/);
    assert.ok(history.includes(saved.artifacts[0].id));
    assert.doesNotMatch(
      history,
      /<svg|Show the winners advancing|Winners advance\.|private-worker|earlierTitles|treetutor-visual/,
    );
    assert.equal(chatCalls.at(-1).tree.thread, null);
    assert.equal(
      (await env.get(`/api/trees/${env.tree.id}`)).model,
      'chat',
      'worker sessions never replace the tutor session/model',
    );
  } finally {
    first.resolve();
    more.resolve();
    finish.resolve();
    holds.forEach((h) => h.resolve());
    await env.close();
  }
});

test('Stop cancels every queued/running visual, preserves ready visuals, starts no more calls and ignores late output', async () => {
  const chatHold = deferred(),
    workerHolds = [],
    signals = [],
    emissions = [];
  const env = await open(
    {
      generate: async (_tree, _text, emit) => {
        emit({
          type: 'item',
          item: 'answer',
          text:
            'Keep this explanation.' +
            Array.from({ length: 7 }, (_, i) => block(`Step ${i}`)).join(''),
        });
        await chatHold.promise;
      },
    },
    {
      generate: async (_tree, text, emit, _save, signal) => {
        signals.push(signal);
        emissions.push(emit);
        if (JSON.parse(text).request.title === 'Step 0') return complete(emit, source);
        const hold = deferred();
        workerHolds.push(hold);
        await hold.promise;
      },
    },
  );
  try {
    const stream = env
      .post(`/api/trees/${env.tree.id}/messages`, { text: 'Show steps' })
      .then((r) => r.text());
    await until(() => signals.length === 4);
    assert.deepEqual(
      (await env.get(`/api/trees/${env.tree.id}`)).artifacts.map((a) => a.status),
      ['ready', ...Array(6).fill('pending')],
    );
    assert.equal((await env.post(`/api/trees/${env.tree.id}/stop`)).status, 200);
    const events = await stream,
      saved = await env.get(`/api/trees/${env.tree.id}`);
    assert.deepEqual(
      saved.artifacts.map((a) => a.status),
      ['ready', ...Array(6).fill('canceled')],
    );
    assert.ok(signals.slice(1).every((s) => s.aborted));
    assert.equal(saved.messages.at(-1).status, 'interrupted');
    assert.match(events, /"status":"canceled"/);
    assert.ok(saved.artifacts.slice(1).every((a) => a.error === null && a.source === null));
    emissions.forEach((e) => complete(e, '<p>LATE PRIVATE RESULT</p>'));
    workerHolds.forEach((h) => h.resolve());
    chatHold.resolve();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(signals.length, 4);
    assert.deepEqual(await env.get(`/api/trees/${env.tree.id}`), saved);
    assert.equal(
      (await env.post(`/api/trees/${env.tree.id}/artifacts/${saved.artifacts[1].id}/retry`)).status,
      409,
      'a deliberate stop never retries',
    );
  } finally {
    workerHolds.forEach((h) => h.resolve());
    chatHold.resolve();
    await env.close();
  }
});

test('concurrent replies get separate three-worker queues; deleting one aborts only its workers and cannot recreate content', async () => {
  const chatHolds = [],
    workerHolds = [],
    workers = [];
  const env = await open(
    {
      generate: async (_tree, text, emit) => {
        emit({
          type: 'item',
          item: 'a',
          text:
            'Explanation.' + Array.from({ length: 5 }, (_, i) => block(`${text} ${i}`)).join(''),
        });
        const hold = deferred();
        chatHolds.push(hold);
        await hold.promise;
        emit({ type: 'status', status: 'completed' });
      },
    },
    {
      generate: async (_tree, text, emit, _save, signal) => {
        workers.push({ title: JSON.parse(text).request.title, signal });
        const hold = deferred();
        workerHolds.push(hold);
        await hold.promise;
        complete(emit, source);
      },
    },
  );
  try {
    const other = env.store.create('Other', 'openai', 'chat');
    const first = env
      .post(`/api/trees/${env.tree.id}/messages`, { text: 'First' })
      .then((r) => r.text());
    const second = env
      .post(`/api/trees/${other.id}/messages`, { text: 'Second' })
      .then((r) => r.text());
    await until(() => workers.length === 6);
    assert.equal(workers.filter((w) => w.title.startsWith('First')).length, 3);
    assert.equal(workers.filter((w) => w.title.startsWith('Second')).length, 3);
    assert.equal(
      (await env.post(`/api/trees/${env.tree.id}/delete`, { conversation: env.tree.id })).status,
      200,
    );
    await first;
    assert.ok(workers.filter((w) => w.title.startsWith('First')).every((w) => w.signal.aborted));
    assert.ok(workers.filter((w) => w.title.startsWith('Second')).every((w) => !w.signal.aborted));
    chatHolds.forEach((h) => h.resolve());
    for (let i = 0; i < 10; i++) {
      workerHolds.forEach((h) => h.resolve());
      await new Promise((r) => setTimeout(r, 5));
    }
    await second;
    assert.equal((await fetch(`${env.origin}/api/trees/${env.tree.id}`)).status, 404);
    assert.ok(
      (await env.get(`/api/trees/${other.id}`)).artifacts.every((a) => a.status === 'ready'),
    );
    assert.equal(
      workers.filter((w) => w.title.startsWith('First')).length,
      3,
      'deleted queue never drains',
    );
  } finally {
    chatHolds.forEach((h) => h.resolve());
    workerHolds.forEach((h) => h.resolve());
    await env.close();
  }
});

test('a slow visual provider within the injected budget still yields a ready visual', async () => {
  // Scaled stand-in: 100 ms delay outlasts a 60 ms "old" budget but fits the injected 400 ms one.
  const env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, 'Look.' + block()) },
    {
      generate: async (_tree, _text, emit) => {
        await new Promise((r) => setTimeout(r, 100));
        complete(emit, source);
      },
    },
    { visualTimeout: 400 },
  );
  try {
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw' })).text();
    await until(
      async () => (await env.get(`/api/trees/${env.tree.id}`)).artifacts.at(-1)?.status === 'ready',
    );
    assert.equal((await env.get(`/api/trees/${env.tree.id}`)).artifacts.at(-1).source, source);
  } finally {
    await env.close();
  }
});
