import { until, observeProvider } from '../support/events.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { compacted } from '../support/branch-first.mjs';

test('branch-first: the child is saved and listed before a held compaction finishes; its first reply waits for the inherited context', async () => {
  const store = new Store(
    join(mkdtempSync(join(tmpdir(), 'rabbithole-branch-first-')), 'trees.sqlite'),
  );
  let release,
    replied = false,
    chat;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const provider = {
    generate: async (tree, text, emit) => {
      if (!tree.id) {
        await held;
        emit({ type: 'item', item: 's', text: 'Held compacted context.' });
      } else {
        replied = true;
        chat = tree;
        emit({ type: 'item', item: 'a', text: 'Focused answer.' });
      }
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    provider: observeProvider(provider),
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body) =>
    fetch(`${origin}/api/trees/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  try {
    const parent = store.create('Parent', 'codex');
    const messageId = store.message(
      parent.id,
      'assistant',
      'Roots exchange nutrients.',
      'completed',
    );
    const response = await post(`${parent.id}/branches`, {
      messageId,
      start: 0,
      end: 5,
      text: 'Roots',
      question: 'Why roots?',
    });
    assert.equal(response.status, 201);
    const child = await response.json();
    assert.equal(child.branch.snapshot, '');
    const state = await (await fetch(`${origin}/api/state`)).json();
    assert.ok(state.trees.some((t) => t.id === child.id && t.parent === parent.id));
    assert.deepEqual(state.compacting, [child.id]);
    assert.deepEqual(state.active, [], 'the parent is free while the child compacts');
    // Read the stream incrementally: compacting status arrives while compaction is still held.
    const stream = (await post(`${child.id}/messages`, { text: 'Why roots?' })).body.getReader();
    let seen = '';
    while (!seen.includes('"compacting"'))
      seen += new TextDecoder().decode((await stream.read()).value);
    assert.match(seen, /"type":"saved"/);
    assert.equal(replied, false);
    release();
    while (true) {
      const { value, done } = await stream.read();
      if (done) break;
      seen += new TextDecoder().decode(value);
    }
    assert.ok(
      seen.indexOf('"compacting"') < seen.indexOf('"thinking"') &&
        seen.indexOf('"thinking"') < seen.indexOf('Focused answer.'),
    );
    assert.equal(chat.branch.snapshot, 'Held compacted context.');
    assert.equal(store.tree(child.id).branch.snapshot, 'Held compacted context.');
    assert.deepEqual((await (await fetch(`${origin}/api/state`)).json()).compacting, []);
    // Fixed from then on: a second write never replaces it.
    store.compacted(child.id, 'Other');
    assert.equal(store.tree(child.id).branch.snapshot, 'Held compacted context.');
  } finally {
    release();
    app.stop();
    store.close();
  }
});

test('branch-first: a failed compaction keeps the child with a readable error; Retry compacts again then replies', async () => {
  const store = new Store(
    join(mkdtempSync(join(tmpdir(), 'rabbithole-compaction-retry-')), 'trees.sqlite'),
  );
  let fail = true,
    compactions = 0,
    chat = null;
  const provider = {
    generate: async (tree, text, emit) => {
      if (!tree.id) {
        compactions++;
        if (fail) throw new Error(`Synthetic compaction failure ${compactions}`);
        emit({ type: 'item', item: 's', text: 'Retried compacted context.' });
      } else {
        chat = tree;
        emit({ type: 'item', item: 'a', text: 'Focused answer.' });
      }
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    provider: observeProvider(provider),
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body = {}) =>
    fetch(`${origin}/api/trees/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const get = async (id) => (await fetch(`${origin}/api/trees/${id}`)).json();
  try {
    const parent = store.create('Parent', 'codex');
    const messageId = store.message(
      parent.id,
      'assistant',
      'Roots exchange nutrients.',
      'completed',
    );
    const branch = async () => {
      const child = await compacted(
        app,
        origin,
        (
          await (
            await post(`${parent.id}/branches`, {
              messageId,
              start: 0,
              end: 5,
              text: 'Roots',
              question: 'Why roots?',
            })
          ).json()
        ).id,
      );
      assert.equal(child.branch.snapshot, '');
      assert.deepEqual(child.compaction, {
        status: 'failed',
        error:
          'Context preparation failed. Synthetic compaction failure 1 Retry, or choose another quick thinking model in Settings if this repeats.',
      });
      return child;
    };
    const child = await branch();
    assert.ok(
      (await (await fetch(`${origin}/api/state`)).json()).trees.some((t) => t.id === child.id),
      'the failed child stays saved',
    );
    // The first reply fails without calling the tutor; no reply text is written.
    assert.match(
      await (await post(`${child.id}/messages`, { text: 'Why roots?' })).text(),
      /Context preparation failed\. Synthetic compaction failure 1/,
    );
    assert.equal(chat, null);
    let saved = await get(child.id);
    assert.deepEqual(
      saved.messages.map((m) => [m.role, m.text, m.status]),
      [
        ['user', 'Why roots?', 'completed'],
        ['assistant', '', 'failed'],
      ],
    );
    assert.equal(saved.compaction.status, 'failed');
    assert.equal(
      (await post(`${child.id}/messages`, { text: 'Again?' })).status,
      409,
      'only Retry prepares the context again',
    );
    // A second failure shows the error again.
    assert.match(
      await (await post(`${child.id}/retry`)).text(),
      /Context preparation failed\. Synthetic compaction failure 2/,
    );
    assert.equal(compactions, 2);
    assert.equal(chat, null);
    saved = await get(child.id);
    assert.match(saved.compaction.error, /Synthetic compaction failure 2/);
    assert.deepEqual(
      saved.messages.map((m) => [m.role, m.status]),
      [
        ['user', 'completed'],
        ['assistant', 'failed'],
      ],
    );
    // Retry compacts again, then answers the question with the inherited context.
    fail = false;
    const stream = await (await post(`${child.id}/retry`)).text();
    assert.ok(
      stream.indexOf('"compacting"') < stream.indexOf('"thinking"') &&
        stream.indexOf('"thinking"') < stream.indexOf('Focused answer.'),
    );
    assert.equal(chat.branch.snapshot, 'Retried compacted context.');
    saved = await get(child.id);
    assert.equal(saved.compaction, undefined);
    assert.deepEqual(
      saved.messages.map((m) => [m.role, m.text, m.status]),
      [
        ['user', 'Why roots?', 'completed'],
        ['assistant', 'Focused answer.', 'completed'],
      ],
    );
    // Deleting a failed child still works.
    fail = true;
    compactions = 0;
    const failed = await branch();
    assert.equal((await post(`${parent.id}/delete`, { conversation: failed.id })).status, 200);
    assert.equal(store.tree(failed.id), undefined);
    assert.equal((await get(failed.id)).error, 'Learning tree not found.');
  } finally {
    app.stop();
    store.close();
  }
});

test('opening the branch form prepares compaction: submit reuses it, cancel aborts it, a changed parent reruns it; every run is in Usage history', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-prepare-')), 'trees.sqlite'));
  const calls = [];
  const provider = {
    generate: async (tree, text, emit, save, signal) => {
      if (!tree.id) {
        const call = { text, aborted: false };
        calls.push(call);
        await new Promise((resolve, reject) => {
          call.release = resolve;
          signal.addEventListener(
            'abort',
            () => {
              call.aborted = true;
              reject(new Error('Stopped.'));
            },
            { once: true },
          );
        });
        emit({ type: 'usage', usage: { input: 10, output: 2 } });
        emit({ type: 'item', item: 's', text: `Prepared context ${calls.length}.` });
      } else emit({ type: 'item', item: 'a', text: 'Focused answer.' });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    provider: observeProvider(provider),
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body = {}) =>
    fetch(`${origin}/api/trees/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  try {
    const parent = store.create('Parent', 'codex');
    const messageId = store.message(
      parent.id,
      'assistant',
      'Roots exchange nutrients.',
      'completed',
    );
    const anchor = { messageId, start: 0, end: 5, text: 'Roots' };
    assert.equal(
      (await post(`${parent.id}/prepare`, { messageId, start: 0, end: 3, text: 'Nope' })).status,
      400,
    );

    // Prepare then submit while still in flight: exactly one compaction call, reused by the child.
    assert.equal((await post(`${parent.id}/prepare`, anchor)).status, 202);
    assert.equal(
      (await post(`${parent.id}/prepare`, anchor)).status,
      202,
      'reopening on the same passage keeps the run',
    );
    await until(() => calls.length === 1);
    assert.equal(calls.length, 1);
    const child = await (
      await post(`${parent.id}/branches`, { ...anchor, question: 'Why roots?' })
    ).json();
    calls[0].release();
    assert.equal((await compacted(app, origin, child.id)).branch.snapshot, 'Prepared context 1.');
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /Roots/);
    assert.doesNotMatch(calls[0].text, /Why roots\?/, 'compaction never sees the question');

    // Prepare then cancel aborts the call; no child is created.
    const before = store.list().length;
    await post(`${parent.id}/prepare`, anchor);
    await until(() => calls.length === 2);
    assert.equal(
      (await post(`${parent.id}/unprepare`, { messageId, start: 6, end: 14, text: 'exchange' }))
        .status,
      200,
    );
    assert.equal(calls[1].aborted, false, 'closing another passage leaves this run');
    assert.equal((await post(`${parent.id}/unprepare`, anchor)).status, 200);
    assert.equal(calls[1].aborted, true);
    assert.equal(store.list().length, before);

    // Prepare, parent gains a message, submit: the prepared run is discarded and compaction reruns.
    await post(`${parent.id}/prepare`, anchor);
    await until(() => calls.length === 3);
    store.message(parent.id, 'user', 'And leaves?', 'completed');
    const rerun = await (
      await post(`${parent.id}/branches`, { ...anchor, question: 'Why roots?' })
    ).json();
    await until(() => calls.length === 4);
    assert.equal(calls[2].aborted, true);
    assert.equal(calls.length, 4);
    assert.match(calls[3].text, /And leaves\?/);
    calls[3].release();
    assert.equal((await compacted(app, origin, rerun.id)).branch.snapshot, 'Prepared context 4.');

    // Usage history records every quick-thinking compaction call, cancelled ones included.
    const events = (await (await fetch(`${origin}/api/usage`)).json()).events.filter(
      (e) => e.task === 'compaction',
    );
    assert.equal(events.length, 4);
  } finally {
    app.stop();
    store.close();
  }
});
