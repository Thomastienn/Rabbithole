import test from 'node:test';
import assert from 'node:assert/strict';
import { notify } from '../support/events.mjs';
import { block, complete, deferred, until, open } from '../support/visual-kit.mjs';

const final = '<p>First Second</p><script>window.finished = true</script>';

async function stream(env) {
  const response = await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Draw' });
  const events = [];
  const done = (async () => {
    let buffer = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice(6)));
      }
      notify();
    }
  })();
  return { events, done };
}

test('chunked visual publishes accumulated partial artifacts before ready, without persisting partials', async () => {
  const chatHold = deferred(),
    workerHold = deferred();
  let emit;
  const env = await open(
    {
      generate: async (_tree, _text, send) => {
        send({ type: 'item', item: 'answer', text: 'Look.' + block() });
        await chatHold.promise;
        send({ type: 'status', status: 'completed' });
      },
    },
    {
      generate: async (_tree, _text, send) => {
        emit = send;
        await workerHold.promise;
      },
    },
  );
  try {
    const { events, done } = await stream(env);
    await until(() => emit);
    const partials = () =>
      events.filter((e) => e.artifact?.status === 'pending' && e.artifact.source);
    emit({ type: 'delta', item: 'answer', text: '<p>First' });
    await until(() => partials().length === 1);
    assert.equal(partials()[0].artifact.source, '<p>First</p>');
    emit({ type: 'delta', item: 'answer', text: ' Second</p><script>window.finished = ' });
    await until(() => partials().length === 2);
    assert.equal(partials()[1].artifact.source, '<p>First Second</p>');
    const id = partials()[0].artifact.id;
    assert.equal(env.store.artifact(env.tree.id, id).source, null);
    assert.equal(
      (await env.get(`/api/trees/${env.tree.id}/artifacts/${id}`)).source,
      '<p>First Second</p>',
    );
    emit({ type: 'delta', item: 'answer', text: 'true</script>' });
    complete(emit, final); // A provider's final item replaces its accumulated deltas.
    workerHold.resolve();
    await until(() => events.some((e) => e.artifact?.status === 'ready'));
    const ready = events.find((e) => e.artifact?.status === 'ready').artifact;
    assert.equal(ready.source, final);
    assert.equal(env.store.artifact(env.tree.id, id).source, final);
    assert.equal(ready.id, id);
    assert.ok(partials().every((e) => !e.artifact.source.includes('<script')));
    chatHold.resolve();
    await done;
  } finally {
    chatHold.resolve();
    workerHold.resolve();
    await env.close();
  }
});

for (const stop of [false, true]) {
  test(`${stop ? 'Stop' : 'mid-stream provider failure'} discards partial markup and late output`, async () => {
    const chatHold = deferred(),
      workerHold = deferred();
    let emit, signal;
    const env = await open(
      {
        generate: async (_tree, _text, send) => {
          send({ type: 'item', item: 'answer', text: 'Look.' + block() });
          await chatHold.promise;
          send({ type: 'status', status: 'completed' });
        },
      },
      {
        generate: async (_tree, _text, send, _save, s) => {
          emit = send;
          signal = s;
          await workerHold.promise;
          if (!stop) throw new Error('Quota exceeded for sk-PRIVATE');
        },
      },
    );
    try {
      const { events, done } = await stream(env);
      await until(() => emit);
      emit({ type: 'delta', item: 'answer', text: '<svg onload="run()"><text>Partial' });
      await until(() => events.some((e) => e.artifact?.source?.includes('Partial')));
      const partial = events.find((e) => e.artifact?.source?.includes('Partial')).artifact;
      assert.doesNotMatch(partial.source, /onload/);
      if (stop) await env.post(`/api/trees/${env.tree.id}/stop`);
      else workerHold.resolve();
      await until(() => events.some((e) => e.artifact?.status === 'failed'));
      const failed = events.find((e) => e.artifact?.status === 'failed').artifact;
      assert.equal(failed.source, null);
      assert.match(
        failed.error,
        stop ? /canceled/ : /could not generate a result: Quota exceeded for \[redacted\]/,
      );
      assert.doesNotMatch(failed.error, /PRIVATE/);
      if (stop) assert.ok(signal.aborted);
      complete(emit, final);
      workerHold.resolve();
      chatHold.resolve();
      await done;
      await env.app.settled();
      const saved = (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0];
      assert.equal(saved.status, 'failed');
      assert.equal(saved.source, null);
      assert.equal(env.store.artifact(env.tree.id, saved.id).source, null);
      assert.equal(
        events.some((e) => e.artifact?.status === 'ready'),
        false,
      );
    } finally {
      workerHold.resolve();
      chatHold.resolve();
      await env.close();
    }
  });
}

test('detached visual exposes partial markup through existing polling after the reply ends', async () => {
  const workerHold = deferred();
  let emit;
  const env = await open(
    { generate: async (_tree, _text, send) => complete(send, 'Look.' + block()) },
    {
      generate: async (_tree, _text, send) => {
        emit = send;
        await workerHold.promise;
        complete(send, final);
      },
    },
  );
  try {
    const { events, done } = await stream(env);
    await done;
    await until(() => emit);
    assert.equal(events.at(-1).type, 'done');
    emit({ type: 'delta', item: 'answer', text: '<p>After reply' });
    const partial = (await env.get(`/api/trees/${env.tree.id}`)).artifacts[0];
    assert.equal(partial.status, 'pending');
    assert.equal(partial.source, '<p>After reply</p>');
    assert.equal(env.store.artifact(env.tree.id, partial.id).source, null);
    workerHold.resolve();
    await env.app.settled();
    assert.equal((await env.get(`/api/trees/${env.tree.id}`)).artifacts[0].source, final);
  } finally {
    workerHold.resolve();
    await env.close();
  }
});
