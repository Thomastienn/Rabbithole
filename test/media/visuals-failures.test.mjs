import { test } from 'node:test';
import assert from 'node:assert/strict';
import { task, block, source, complete, deferred, until, open } from '../support/visual-kit.mjs';

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
    const foreign = env.store.create('Foreign', 'codex');
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
      '<p>Model</p><script>new GLTFLoader().parse(bytes)</script>',
      '<p>Texture</p><script>new THREE.TextureLoader()</script>',
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
      assert.equal(a.error ?? null, null, 'a recovered repair shows no error');
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

test('provider failures show their redacted first line and deadlines do not automatically retry; late output cannot publish', async () => {
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
        if (fail)
          throw new Error('Model gpt-x is not in the catalog with api_key=PRIVATE-CREDENTIAL');
        signal = s;
        late = emit;
        await hold.promise;
      },
    },
    { visualTimeout: 25 },
  );
  try {
    for (const reason of [
      /^Visual provider could not generate a result: Model gpt-x is not in the catalog with api_key=\[redacted\]\. Check Smart/,
      /Visual generation timed out/,
    ]) {
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
      assert.doesNotMatch(stream + a.error, /PRIVATE-CREDENTIAL/);
      assert.equal(calls, before + 1);
      fail = false;
    }
    assert.ok(signal.aborted);
    complete(late, source);
    hold.resolve();
    await hold.promise;
    await env.app.settled();
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
        complete(emit, 'Look.\n```rabbithole-visual\n{broken}\n```'),
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
    await hold.promise;
    await env.app.settled();
    assert.equal((await env.get(`/api/trees/${tree.id}`)).artifacts[0].status, 'failed');
  } finally {
    hold.resolve();
    if (!closed) await env.close();
  }
});
