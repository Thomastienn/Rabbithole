import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  task,
  directive,
  composition,
  videoResponse,
  complete,
  until,
  open,
  job,
} from '../support/video-kit.mjs';

test('a malformed video block the learner asked for becomes a visible failed video with a reason, and Retry runs it from the stored request', async () => {
  const workers = [];
  let block;
  const provider = {
    generate: async (tree, text, emit) => {
      if (!tree.id) {
        if (tree.instructions.startsWith('You plan')) workers.push(JSON.parse(text));
        return complete(emit, videoResponse(tree));
      }
      complete(emit, 'Sure.\n```treetutor-video\n' + block);
    },
  };
  const env = await open(provider);
  try {
    // Regression replay: tutors have sent a stray key plus a missing field, which used to be dropped silently.
    const request = 'Make a video of how Earth orbits the Sun.';
    for (const [value, reason, expected = {}, closed = true] of [
      [
        JSON.stringify({
          title: 'Orbits',
          description: 'Earth orbits.',
          excerpt: 'Earth',
          style: 'fun',
        }),
        /missing intent/,
        { excerpt: 'Earth' },
      ],
      ['{"title": "Orbits",', /not valid JSON/],
      [JSON.stringify({ ...task, intent: '  ' }), /missing intent/, { excerpt: task.excerpt }],
      [
        JSON.stringify({ ...task, description: 12 }),
        /missing description/,
        { intent: task.intent, excerpt: task.excerpt },
      ],
      ['null', /not a JSON object/],
      ['[]', /not a JSON object/],
      [JSON.stringify(task), /cut off before it closed/, {}, false],
    ]) {
      block = value + (closed ? '\n```' : '');
      const tree = env.store.create('Bad video');
      const stream = await (
        await env.post(`/api/trees/${tree.id}/messages`, { text: request })
      ).text();
      assert.ok(!stream.includes('treetutor-video'));
      const [failed] = (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts;
      assert.equal(failed.kind, 'video');
      assert.equal(failed.status, 'failed');
      assert.match(failed.error, /^Video request could not be read: /);
      assert.match(failed.error, reason);
      assert.equal(failed.input, undefined);
      assert.equal(failed.position, 'Sure.'.length);
      assert.equal(workers.length, 0, 'a rejected request never starts by itself');
      assert.equal(
        (await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`)).status,
        200,
      );
      await until(() => env.store.artifact(tree.id, failed.id).status === 'ready');
      const sent = workers.pop();
      assert.equal(sent.request, request);
      assert.equal(
        sent.intent,
        expected.intent ?? request,
        'readable fields survive; missing intent falls back to the learner request',
      );
      assert.equal(sent.excerpt, expected.excerpt ?? '');
      assert.equal(env.store.tree(tree.id).messages.length, 2);
    }
    // Valid tolerant slip: unknown keys and long fields still start the job directly.
    block = JSON.stringify({ ...task, style: 'fun', intent: 'i'.repeat(17000) }) + '\n```';
    const tree = env.store.create('Slip');
    await (
      await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of the final.' })
    ).text();
    await until(() => env.store.tree(tree.id).artifacts[0]?.status === 'ready');
    assert.equal(workers.pop().intent, 'i'.repeat(600));
  } finally {
    env.close();
  }
});

test('mixed and duplicate video blocks each leave a failed artifact of their own kind without starting workers', async () => {
  let blocks;
  let workers = 0;
  const env = await open({
    generate: async (tree, text, emit) => {
      if (!tree.id) {
        workers++;
        return complete(emit, videoResponse(tree));
      }
      complete(emit, 'Visible answer.' + blocks);
    },
  });
  try {
    for (const kinds of [
      ['diagram', 'video'],
      ['video', 'video'],
    ]) {
      blocks = kinds
        .map((kind) => `\n\`\`\`treetutor-${kind}\n${JSON.stringify(task)}\n\`\`\``)
        .join('');
      const tree = env.store.create('Multiple requests');
      const stream = await (
        await env.post(`/api/trees/${tree.id}/messages`, {
          text: 'Make a video of winners advancing.',
        })
      ).text();
      const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
      assert.equal(saved.messages.at(-1).text, 'Visible answer.');
      assert.doesNotMatch(stream, /treetutor-(diagram|video)/);
      assert.deepEqual(
        saved.artifacts.map((a) => [a.kind, a.status]),
        kinds.map((kind) => [kind === 'diagram' ? 'mermaid' : kind, 'failed']),
      );
      assert.ok(saved.artifacts.every((a) => a.error && a.input === undefined));
    }
    assert.equal(workers, 0);
  } finally {
    env.close();
  }
});

test('provider failure and learner Stop preserve legacy diagram request failures without starting media work', async () => {
  let mode, entered;
  let workers = 0;
  const env = await open({
    generate: async (tree, text, emit, save, signal) => {
      if (!tree.id) {
        workers++;
        return complete(emit, videoResponse(tree));
      }
      emit({
        type: 'item',
        item: 'answer',
        text: `Saved text.\n\`\`\`treetutor-diagram\n${JSON.stringify(task)}\n\`\`\``,
      });
      entered?.();
      if (mode === 'throw') throw new Error('private provider failure');
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    },
  });
  try {
    for (mode of ['throw', 'stop']) {
      const tree = env.store.create('Interrupted requests');
      const ready = new Promise((resolve) => {
        entered = resolve;
      });
      const response = env
        .post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of winners advancing.' })
        .then((r) => r.text());
      await ready;
      if (mode === 'stop') assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
      await response;
      const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
      assert.deepEqual(
        saved.artifacts.map((a) => [a.kind, a.status, a.error]),
        [['mermaid', 'failed', 'Tutor reply did not complete.']],
      );
      assert.equal(saved.messages.at(-1).text, 'Saved text.');
    }
    assert.equal(workers, 0);
  } finally {
    env.close();
  }
});

test('deleting a conversation while its request block is streaming cannot recreate its artifacts', async () => {
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const env = await open({
    generate: async (tree, text, emit, save, signal) => {
      emit({ type: 'item', item: 'answer', text: 'Saved text.' + directive });
      entered();
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    },
  });
  try {
    const tree = env.store.create('Delete requests');
    const response = env
      .post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of winners advancing.' })
      .then((r) => r.text());
    await started;
    assert.equal(
      (await env.post(`/api/trees/${tree.id}/delete`, { conversation: tree.id })).status,
      200,
    );
    await response;
    assert.equal((await env.get(`/api/trees/${tree.id}`)).status, 404);
    assert.deepEqual((await (await env.get('/api/state')).json()).active, []);
  } finally {
    env.close();
  }
});

test('Try a different version gives a ready video a new job; the chat shows only the newest and the library keeps both', async () => {
  const workers = [];
  let release,
    held = false;
  const env = await open({
    generate: async (tree, text, emit) => {
      if (tree.instructions?.includes('Remotion')) {
        if (tree.instructions.startsWith('You plan')) workers.push({ tree, text });
        if (held && tree.instructions.startsWith('You plan'))
          await new Promise((r) => {
            release = r;
          });
        return complete(emit, videoResponse(tree));
      }
      complete(emit, 'Here is the idea.' + directive);
    },
  });
  try {
    const tree = env.store.create('Videos');
    await (
      await env.post(`/api/trees/${tree.id}/messages`, {
        text: 'Make a video of the winners advancing.',
      })
    ).text();
    const first = await until(() =>
      env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
    );
    const url = `/api/trees/${tree.id}/artifacts/${first.id}/regenerate`;
    assert.equal(
      (
        await env.post(
          `/api/trees/${env.store.create('Foreign').id}/artifacts/${first.id}/regenerate`,
        )
      ).status,
      404,
    );
    held = true;
    const response = await env.post(url, { input: 'UNTRUSTED' });
    assert.equal(response.status, 200);
    const next = await response.json();
    assert.notEqual(next.id, first.id);
    assert.equal(next.status, 'pending');
    assert.equal(next.input, undefined);
    assert.equal(next.message, first.message);
    assert.equal(next.position, first.position);
    await until(() => workers.length === 2);
    assert.equal(
      (await env.post(`/api/trees/${tree.id}/artifacts/${next.id}/regenerate`)).status,
      409,
      'one generation at a time',
    );
    assert.equal((await env.post(url)).status, 404, 'the previous id is no longer in the chat');
    // The previous video stays playable in the library while the new one is made.
    assert.deepEqual(
      (await (await env.get('/api/videos')).json()).map((v) => v.id),
      [first.id],
    );
    assert.equal((await env.get(`/api/videos/${first.id}/media`)).status, 200);
    release();
    await until(() =>
      env.store.tree(tree.id).artifacts.find((a) => a.id === next.id && a.status === 'ready'),
    );
    const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
    assert.deepEqual(
      saved.artifacts.map((a) => a.id),
      [next.id],
      'the chat shows only the newest',
    );
    assert.deepEqual(
      (await (await env.get('/api/videos')).json()).map((v) => v.id).sort(),
      [first.id, next.id].sort(),
    );
    assert.equal((await env.get(`/api/videos/${first.id}/media`)).status, 200);
    assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${next.id}/media`)).status, 200);
    const [a, b] = workers.map((w) => JSON.parse(w.text));
    assert.deepEqual(
      { ...b, differentVersion: undefined },
      { ...a, differentVersion: undefined },
      'same frozen request and selection',
    );
    assert.equal(b.differentVersion, true);
    assert.match(workers[1].tree.instructions, /different approach than the previous version/);
    assert.doesNotMatch(workers[1].text, /UNTRUSTED/);
    assert.equal(workers[1].tree.thread, null);
  } finally {
    release?.();
    env.close();
  }
});
