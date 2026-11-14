import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { themeChoices } from '../src/appearance.ts';

const task = {
  title: 'Rounds',
  description: 'Two winners meet in the final.',
  intent: 'Show the winners advancing.',
  excerpt: 'Winners advance.',
};
const block = (title = task.title) =>
  '\n```treetutor-visual\n' + JSON.stringify({ ...task, title }) + '\n```';
const source =
  '<svg viewBox="0 0 200 80" role="img" aria-label="Two winners"><text x="10" y="35" fill="var(--color-text-primary)">A → Final ← B</text></svg>';
const complete = (emit, text) => {
  emit({ type: 'item', item: 'answer', text });
  emit({ type: 'usage', usage: { input: 10, output: 3, cacheRead: 2 } });
  emit({ type: 'status', status: 'completed' });
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const until = async (predicate) => {
  const end = Date.now() + 5000;
  while (!(await predicate())) {
    assert.ok(Date.now() < end, 'condition timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
};
const models = async () => [{ model: 'smart', isDefault: true, efforts: ['low', 'high'] }];
async function open(chat, smart, options = {}) {
  const path = options.path ?? join(mkdtempSync(join(tmpdir(), 'tt-visuals-')), 'trees.sqlite');
  smart.models ??= models;
  const store = new Store(path),
    smartProvider = options.smartProvider ?? 'claude';
  const app = createApp({
    store,
    providers: { openai: { models, ...chat }, [smartProvider]: smart },
    auth: { status: () => ({ connected: true }) },
    ...options,
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(origin + '/api/state')).json();
  const get = async (path) => (await fetch(origin + path)).json();
  const post = (path, body = {}) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify(body),
    });
  await post('/api/settings/smart', {
    model: { provider: smartProvider, model: options.smartModel ?? 'smart' },
    followEffort: false,
    effort: 'high',
  });
  const tree = store.create('Visuals', 'openai', 'chat');
  return {
    store,
    app,
    origin,
    path,
    get,
    post,
    tree,
    close: async () => {
      await app.stop();
      store.close();
    },
  };
}

test('visual prompts receive the requested theme palette in light and dark, with a safe legacy fallback', async () => {
  const calls = [];
  const env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, block()) },
    {
      generate: async (tree, _text, emit) => {
        calls.push(tree.instructions);
        complete(emit, source);
      },
    },
  );
  try {
    for (const { id: name } of themeChoices)
      for (const mode of ['light', 'dark']) {
        await (
          await env.post(`/api/trees/${env.tree.id}/messages`, {
            text: 'Show rounds',
            theme: { name, mode },
          })
        ).text();
        await until(() => calls.length === 1);
        const palette = JSON.parse(calls.pop().split('\nCurrent theme palette: ')[1]);
        assert.equal(palette.name, name);
        assert.equal(palette.mode, mode);
        const css = readFileSync(`src/themes/${name}/${name}.css`, 'utf8');
        for (const token of [
          '--color-background-body',
          '--color-background-surface',
          '--color-text-primary',
          '--color-text-secondary',
          '--color-border',
          '--color-accent',
          '--focus-outline-color',
          '--color-text-yellow',
          '--color-text-green',
          '--color-text-pink',
          '--color-text-blue',
        ]) {
          const pair = css
            .match(new RegExp(`${token}: light-dark\\(([^)]+)\\)`))[1]
            .split(',')
            .map((s) => s.trim());
          assert.equal(
            palette.tokens[token],
            pair[mode === 'light' ? 0 : 1],
            `${name} ${mode} ${token}`,
          );
        }
        if (name === 'forest')
          assert.equal(
            palette.tokens['--color-text-green'],
            mode === 'light' ? '#3b6629' : '#9cc47a',
          );
        await until(async () =>
          (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every((a) => a.status === 'ready'),
        );
      }
    for (const theme of [
      undefined,
      { name: '../../PRIVATE', mode: 'PRIVATE', instructions: 'PRIVATE' },
    ]) {
      await (
        await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show rounds', theme })
      ).text();
      await until(() => calls.length === 1);
      const instructions = calls.pop(),
        palette = JSON.parse(instructions.split('\nCurrent theme palette: ')[1]);
      assert.equal(palette.name, 'paperback');
      assert.equal(palette.mode, 'dark');
      assert.doesNotMatch(instructions, /PRIVATE/);
      await until(async () =>
        (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every((a) => a.status === 'ready'),
      );
    }
  } finally {
    await env.close();
  }
});

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

test('predict-then-reveal uses the ordinary inline worker, persists without replay and keeps its answer out of tutor history', async () => {
  const prediction = {
    title: 'Predict the search interval',
    description: 'Search for 12 in 2, 4, 6, 8, 10, 12, 14. The midpoint is 8. Which half remains?',
    intent:
      'A predict-then-reveal check. Ask which half remains; reveal the right half and explain why.',
    excerpt:
      'After comparing target 12 with midpoint 8, keep 10, 12, 14 because 12 is greater than 8.',
  };
  const fragment =
    '<p>Midpoint: 8. Target: 12. Which half remains?</p><details><summary>Reveal answer</summary><p>The right half: 10, 12, 14, because 12 is greater than 8.</p></details>';
  const workers = [],
    history = [];
  let env = await open(
    {
      generate: async (tree, text, emit) => {
        history.push(tree);
        complete(
          emit,
          text === 'Continue'
            ? 'Next idea.'
            : 'Compare the target with the midpoint.\n```treetutor-visual\n' +
                JSON.stringify(prediction) +
                '\n```\n\nContinue whenever you like.',
        );
      },
    },
    {
      generate: async (tree, text, emit) => {
        workers.push({ tree, input: JSON.parse(text) });
        complete(emit, fragment);
      },
    },
  );
  let closed = false;
  try {
    await (
      await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Help me check binary search.' })
    ).text();
    const saved = await env.get(`/api/trees/${env.tree.id}`),
      a = saved.artifacts[0];
    assert.equal(a.kind, 'visual');
    assert.equal(a.status, 'ready');
    assert.equal(a.position, 'Compare the target with the midpoint.'.length);
    assert.equal(a.source, fragment);
    assert.equal(saved.messages.length, 2);
    assert.doesNotMatch(
      saved.messages.at(-1).text + a.title + a.description,
      /right half|because 12/,
    );
    assert.equal(workers.length, 1);
    assert.deepEqual(workers[0].input, { request: prediction, earlierTitles: [] });
    assert.match(
      workers[0].tree.instructions,
      /native details element[\s\S]*no open attribute[\s\S]*Reveal answer/,
    );
    assert.match(workers[0].tree.instructions, /Other visuals must not add a quiz/);
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Continue' })).text();
    const context = JSON.stringify(history.at(-1));
    assert.ok(context.includes(a.id) && context.includes(prediction.description));
    assert.doesNotMatch(context, /right half|because 12|<details|predict-then-reveal/);
    const { path, tree } = env;
    await env.close();
    closed = true;
    env = await open(
      {},
      {
        generate: async () => {
          throw new Error('Reopening must not generate.');
        },
      },
      { path },
    );
    closed = false;
    assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).artifacts[0], a);
    assert.equal(workers.length, 1);
  } finally {
    if (!closed) await env.close();
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

test('invalid output gets one automatic retry, then a durable failure with explicit Retry from the same frozen request', async () => {
  const calls = [],
    retryHold = deferred();
  let output = '<script>fetch("/api/state")</script>',
    hold = false;
  let env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, 'See this.' + block()) },
    {
      generate: async (tree, text, emit) => {
        calls.push({ tree, input: JSON.parse(text) });
        if (hold) await retryHold.promise;
        complete(emit, output);
      },
    },
  );
  let stopped = false;
  try {
    let stream = await (
      await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw rounds' })
    ).text();
    let saved = await env.get(`/api/trees/${env.tree.id}`),
      artifact = saved.artifacts[0];
    assert.equal(calls.length, 2);
    assert.equal(artifact.status, 'failed');
    assert.equal(artifact.source, null);
    assert.match(artifact.error, /Visual output is invalid/);
    assert.match(calls[1].input.validationError, /preloaded libraries/);
    assert.equal(calls[0].input.validationError, undefined);
    assert.doesNotMatch(stream, /fetch|validationError|earlierTitles|selection|attempt|<script>/);
    assert.equal(
      (await env.get('/api/usage')).events.filter((e) => e.task === 'diagram').length,
      2,
    );
    const foreign = env.store.create('Foreign');
    assert.equal(
      (await env.post(`/api/trees/${foreign.id}/artifacts/${artifact.id}/retry`)).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${env.origin}/api/trees/${env.tree.id}/artifacts/${artifact.id}/retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    const path = env.path,
      id = env.tree.id;
    await env.close();
    stopped = true;
    const count = calls.length;
    env = await open(
      {},
      {
        generate: async (tree, text, emit) => {
          calls.push({ tree, input: JSON.parse(text) });
          if (hold) await retryHold.promise;
          complete(emit, output);
        },
      },
      { path },
    );
    stopped = false;
    assert.equal((await env.get(`/api/trees/${id}`)).artifacts[0].status, 'failed');
    assert.equal(calls.length, count, 'startup never retries');
    output = source;
    hold = true;
    const retry = await env.post(`/api/trees/${id}/artifacts/${artifact.id}/retry`, {
      input: 'UNTRUSTED REPLACEMENT',
      title: 'OTHER',
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).id, artifact.id);
    await until(() => calls.length === 3);
    assert.equal((await env.post(`/api/trees/${id}/artifacts/${artifact.id}/retry`)).status, 409);
    retryHold.resolve();
    await until(
      async () => (await env.get(`/api/trees/${id}/artifacts/${artifact.id}`)).status === 'ready',
    );
    saved = await env.get(`/api/trees/${id}`);
    assert.equal(saved.messages.length, 2);
    assert.equal(saved.artifacts.length, 1);
    assert.equal(saved.artifacts[0].source, source);
    assert.deepEqual(calls[2].input, calls[0].input);
    assert.equal(calls[2].tree.effort, 'high');
    assert.equal((await env.post(`/api/trees/${id}/artifacts/${artifact.id}/retry`)).status, 409);
  } finally {
    retryHold.resolve();
    if (!stopped) await env.close();
  }
});

test('server validation catches document, resource, library, syntax and size mistakes; a corrected second attempt renders', async () => {
  let invalid,
    count = 0;
  const env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, 'Look.' + block()) },
    { generate: async (_tree, _text, emit) => complete(emit, count++ % 2 ? source : invalid) },
  );
  try {
    for (invalid of [
      '<!doctype html><html><body><p>Document</p></body></html>',
      '<p>Loading</p><script>fetch("/api/state")</script>',
      '<svg><text>https://example.test</text></svg>',
      '<script src="/other.js"></script>',
      '<p>Other library</p><script>import("d3")</script>',
      '<p>Chart</p><script>new Chart()</script>',
      '<p>Broken</p><script>const = ;</script>',
      '<button onclick="const =">Broken</button>',
      '<a href="/api/state">Link</a>',
      '<img src="x">',
      '<style>@import "x";</style><p>Import</p>',
      '<style>p{background:url(/api/state)}</style><p>Resource</p>',
      '<p>' + '🌲'.repeat(17000) + '</p>',
      '',
    ]) {
      const before = count;
      await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw' })).text();
      const a = (await env.get(`/api/trees/${env.tree.id}`)).artifacts.at(-1);
      assert.equal(count, before + 2, invalid.slice(0, 45));
      assert.equal(a.status, 'ready', a.error);
      assert.equal(a.source, source);
    }
    // The standard SVG namespace names a format, not a network dependency.
    invalid = source
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace('A → Final ← B', 'Chart: Worker 1');
    const before = count;
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw' })).text();
    assert.equal(count, before + 1);
  } finally {
    await env.close();
  }
});

test('provider failures and deadlines do not automatically retry or expose diagnostics; late output cannot publish', async () => {
  const hold = deferred();
  let calls = 0,
    signal,
    late,
    fail = true;
  const env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, 'Look.' + block()) },
    {
      generate: async (_tree, _text, emit, _save, s) => {
        calls++;
        if (fail) throw new Error('PRIVATE PROVIDER CREDENTIAL');
        signal = s;
        late = emit;
        await hold.promise;
      },
    },
    { visualTimeout: 25 },
  );
  try {
    for (const reason of [/Visual provider could not generate/, /Visual generation timed out/]) {
      const before = calls;
      const stream = await (
        await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw' })
      ).text();
      // The turn ends with the text; the visual settles on its own afterwards.
      await until(
        async () =>
          (await env.get(`/api/trees/${env.tree.id}`)).artifacts.at(-1).status !== 'pending',
      );
      const a = (await env.get(`/api/trees/${env.tree.id}`)).artifacts.at(-1);
      assert.equal(a.status, 'failed');
      assert.match(a.error, reason);
      assert.doesNotMatch(stream, /PRIVATE PROVIDER CREDENTIAL/);
      assert.equal(calls, before + 1);
      fail = false;
    }
    assert.ok(signal.aborted);
    complete(late, source);
    hold.resolve();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(
      (await env.get(`/api/trees/${env.tree.id}`)).artifacts.every((a) => a.status === 'failed'),
    );
  } finally {
    hold.resolve();
    await env.close();
  }
});

test('malformed visuals remain visible and retryable; shutdown recovers pending visuals without generation', async () => {
  const hold = deferred();
  let pending = false,
    calls = 0;
  let env = await open(
    {
      generate: async (_tree, _text, emit) =>
        complete(emit, 'Look.\n```treetutor-visual\n{broken}\n```'),
    },
    {
      generate: async (_tree, text, emit) => {
        calls++;
        assert.equal(JSON.parse(text).request.intent, 'Draw this');
        if (pending) await hold.promise;
        complete(emit, source);
      },
    },
  );
  let closed = false;
  try {
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw this' })).text();
    const a = (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0];
    assert.equal(a.kind, 'visual');
    assert.equal(a.status, 'failed');
    assert.match(a.error, /request was not valid JSON/);
    assert.equal(calls, 0);
    pending = true;
    assert.equal((await env.post(`/api/trees/${env.tree.id}/artifacts/${a.id}/retry`)).status, 200);
    await until(() => calls === 1);
    const { path, tree } = env;
    await env.close();
    closed = true;
    const count = calls;
    env = await open(
      {},
      {
        generate: async () => {
          calls++;
        },
      },
      { path },
    );
    closed = false;
    const recovered = (await env.get(`/api/trees/${tree.id}`)).artifacts[0];
    assert.equal(recovered.status, 'failed');
    assert.match(recovered.error, /interrupted/);
    assert.equal(calls, count);
    hold.resolve();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal((await env.get(`/api/trees/${tree.id}`)).artifacts[0].status, 'failed');
  } finally {
    hold.resolve();
    if (!closed) await env.close();
  }
});

for (const name of ['claude', 'codex'])
  test(`${name} visual workers retain the native no-tool boundary, fresh session and selected effort`, async () => {
    const launches = [],
      dir = mkdtempSync(join(tmpdir(), 'tt-visual-adapter-'));
    const launch = (command, args, options) => {
      const call = { args, env: options.env, input: [] };
      launches.push(call);
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url)),
          ...(command === 'claude' ? args : []),
        ],
        options,
      );
      const method = command === 'claude' ? 'end' : 'write',
        original = child.stdin[method].bind(child.stdin);
      child.stdin[method] = (text) => {
        call.input.push(command === 'claude' ? text : JSON.parse(text));
        return original(text);
      };
      return child;
    };
    const native =
      name === 'claude'
        ? new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}'))
        : new Codex({ token: async () => 'fixture-token' }, dir, launch);
    const env = await open(
      { generate: async (_tree, _text, emit) => complete(emit, 'See the rounds.' + block()) },
      native,
      { smartProvider: name, smartModel: name === 'claude' ? 'haiku' : 'fixture-model' },
    );
    try {
      await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw rounds' })).text();
      await until(
        async () => (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0].status !== 'pending',
      );
      const a = (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0];
      assert.equal(a.status, 'ready', a.error);
      assert.equal(a.kind, 'visual');
      assert.equal(a.source, '<p>Round winners meet in the final.</p>');
      assert.equal(launches.length, 1);
      const call = launches[0];
      if (name === 'claude') {
        const arg = (flag) => call.args[call.args.indexOf(flag) + 1];
        assert.equal(arg('--model'), 'haiku');
        assert.equal(arg('--effort'), 'high');
        assert.equal(arg('--tools'), '');
        assert.equal(arg('--max-turns'), '1');
        assert.equal(arg('--mcp-config'), '{"mcpServers":{}}');
        assert.equal(arg('--setting-sources'), '');
        assert.ok(
          call.args.includes('--strict-mcp-config') &&
            call.args.includes('--disable-slash-commands'),
        );
        assert.ok(!call.args.includes('--resume'));
        assert.equal(call.env.ANTHROPIC_API_KEY, undefined);
        assert.equal(call.env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
        assert.deepEqual(JSON.parse(call.input[0]), { request: task, earlierTitles: [] });
      } else {
        const thread = call.input.find((r) => r.method === 'thread/start'),
          turn = call.input.find((r) => r.method === 'turn/start');
        assert.equal(thread.params.model, 'fixture-model');
        assert.equal(turn.params.effort, 'high');
        assert.equal(thread.params.sandbox, 'read-only');
        assert.equal(thread.params.approvalPolicy, 'never');
        assert.equal(
          call.input.filter(
            (r) => r.method === 'thread/inject_items' || r.method === 'thread/resume',
          ).length,
          0,
        );
        for (const feature of [
          'shell_tool',
          'apply_patch_freeform',
          'js_repl',
          'code_mode',
          'apps',
          'skills',
        ])
          assert.ok(call.args.includes(`features.${feature}=false`));
        assert.ok(call.args.includes('web_search="disabled"'));
        assert.equal(call.env.OPENAI_API_KEY, undefined);
        assert.equal(call.input.find((r) => r.id === 'worker-command')?.error?.code, -32601);
        assert.deepEqual(JSON.parse(turn.params.input[0].text), {
          request: task,
          earlierTitles: [],
        });
      }
      assert.equal((await env.get(`/api/trees/${env.tree.id}`)).model, 'chat');
    } finally {
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

test('smart default resolution fails with a safe actionable reason and an explicit Retry can resolve it later', async () => {
  let calls = 0;
  const smart = {
    models,
    model: async () => {
      throw new Error('PRIVATE MODEL DIAGNOSTIC');
    },
    generate: async (_tree, _text, emit) => {
      calls++;
      complete(emit, source);
    },
  };
  const env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, 'Look.' + block()) },
    smart,
    { defaultProvider: 'claude' },
  );
  try {
    await env.post('/api/settings/smart', { model: null, followEffort: true });
    const stream = await (
      await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw' })
    ).text();
    const a = (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0];
    assert.equal(a.status, 'failed');
    assert.equal(calls, 0);
    assert.match(a.error, /Could not choose the smart model/);
    assert.doesNotMatch(stream, /PRIVATE MODEL DIAGNOSTIC/);
    smart.model = async () => 'smart';
    assert.equal((await env.post(`/api/trees/${env.tree.id}/artifacts/${a.id}/retry`)).status, 200);
    await until(
      async () => (await env.get(`/api/trees/${env.tree.id}/artifacts/${a.id}`)).status === 'ready',
    );
    assert.equal(calls, 1);
  } finally {
    await env.close();
  }
});

test('Try a different version replaces a ready visual in place from the frozen request, only once at a time, with guards', async () => {
  const calls = [],
    hold = deferred();
  let output = source,
    held = false;
  const env = await open(
    { generate: async (_tree, _text, emit) => complete(emit, 'See this.' + block()) },
    {
      generate: async (tree, text, emit) => {
        calls.push({ tree, input: JSON.parse(text) });
        if (held) await hold.promise;
        complete(emit, output);
      },
    },
  );
  try {
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw rounds' })).text();
    const before = await env.get(`/api/trees/${env.tree.id}`),
      artifact = before.artifacts[0];
    assert.equal(artifact.status, 'ready');
    assert.equal(calls.length, 1);
    const url = `/api/trees/${env.tree.id}/artifacts/${artifact.id}/regenerate`;
    assert.equal(
      (
        await fetch(env.origin + url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await env.post(
          `/api/trees/${env.store.create('Foreign').id}/artifacts/${artifact.id}/regenerate`,
        )
      ).status,
      404,
    );
    await env.post('/api/settings/smart', {
      model: { provider: 'claude', model: 'smart' },
      followEffort: false,
      effort: 'low',
    });
    output = source.replace('A → Final ← B', 'Bracket view');
    held = true;
    const response = await env.post(url, { input: 'UNTRUSTED', source: '<p>x</p>' });
    assert.equal(response.status, 200);
    const pending = await response.json();
    assert.equal(pending.id, artifact.id);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.source, null);
    assert.equal(pending.input, undefined);
    await until(() => calls.length === 2);
    assert.equal((await env.post(url)).status, 409, 'one generation at a time');
    assert.equal(
      (await env.post(`/api/trees/${env.tree.id}/artifacts/${artifact.id}/retry`)).status,
      409,
    );
    hold.resolve();
    await until(
      async () =>
        (await env.get(`/api/trees/${env.tree.id}/artifacts/${artifact.id}`)).status === 'ready',
    );
    const after = await env.get(`/api/trees/${env.tree.id}`);
    assert.equal(after.artifacts.length, 1, 'no history is kept');
    assert.deepEqual(
      { ...after.artifacts[0], source: undefined },
      { ...artifact, source: undefined },
    );
    assert.match(after.artifacts[0].source, /Bracket view/);
    assert.deepEqual(after.messages, before.messages);
    assert.deepEqual(
      calls[1].input,
      calls[0].input,
      'same frozen request; previous source is never sent',
    );
    assert.doesNotMatch(JSON.stringify(calls[1]), /A → Final|UNTRUSTED/);
    assert.equal(calls[1].tree.effort, 'high', 'frozen smart selection');
    assert.equal(calls[1].tree.thread, null);
    assert.match(calls[1].tree.instructions, /different approach than the previous version/);
    assert.doesNotMatch(calls[0].tree.instructions, /different approach than the previous version/);
    assert.equal(
      (await env.get('/api/usage')).events.filter((e) => e.task === 'diagram').length,
      2,
    );
    // Only ready visuals regenerate.
    output = '<script>fetch("/api/state")</script>';
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw again' })).text();
    const failed = (await env.get(`/api/trees/${env.tree.id}`)).artifacts.at(-1);
    assert.equal(failed.status, 'failed');
    assert.equal(
      (await env.post(`/api/trees/${env.tree.id}/artifacts/${failed.id}/regenerate`)).status,
      409,
    );
  } finally {
    hold.resolve();
    await env.close();
  }
});

test('branch compaction keeps passage detail and sees a visual only as one title and description line, never the question', async () => {
  const compactions = [];
  const env = await open(
    {
      generate: async (tree, text, emit, save) => {
        if (text.startsWith('Compact')) {
          compactions.push(text);
          return complete(emit, 'Rounds summary.');
        }
        save('chat-thread', 'chat');
        complete(emit, 'Rounds pair winners.' + block() + '\nThe final decides.');
      },
    },
    { generate: async (tree, text, emit) => complete(emit, source) },
  );
  try {
    await (await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show rounds' })).text();
    await until(
      async () => (await env.get(`/api/trees/${env.tree.id}`)).artifacts?.[0]?.status === 'ready',
    );
    const reply = (await env.get(`/api/trees/${env.tree.id}`)).messages.at(-1);
    const response = await env.post(`/api/trees/${env.tree.id}/branches`, {
      messageId: reply.id,
      start: 0,
      end: 6,
      text: 'Rounds',
      question: 'SECRET BRANCH QUESTION?',
    });
    assert.equal(response.status, 201);
    const [text] = compactions;
    assert.match(text, /Keep the sentences around "passage" in its message in close detail/);
    const [message] = JSON.parse(text.slice(text.indexOf('\n') + 1)).messages.filter(
      (m) => m.role === 'assistant',
    );
    assert.equal(
      message.text,
      'Rounds pair winners.\n[Visual: Rounds — Two winners meet in the final.]\n\nThe final decides.',
    );
    assert.doesNotMatch(
      text,
      /treetutor-visual|"intent"|Show the winners advancing|<svg|A → Final|SECRET BRANCH QUESTION/,
    );
  } finally {
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
