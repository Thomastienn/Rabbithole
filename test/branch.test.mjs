import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('branch validates exact UTF-16 anchors, saves atomically, inherits model and stays isolated after reopen', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-branch-')), 'trees.sqlite');
  const store = new Store(path);
  let fail = false, captured;
  const provider = { generate: async (tree, text, emit) => {
    captured = { tree, text };
    if (fail) throw new Error('Synthetic compaction failure');
    emit({ type: 'item', item: 'summary', text: 'Relevant fixed context.' });
    emit({ type: 'status', status: 'completed' });
  } };
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const parent = store.create('Parent');
  store.thread(parent.id, 'parent-thread', 'fixture-model');
  const original = '🌲 same phrase and same phrase';
  const messageId = store.message(parent.id, 'assistant', original, 'completed');
  const body = { messageId, start: 19, end: 30, text: 'same phrase', question: 'Explain second occurrence' };
  assert.equal(original.slice(body.start, body.end), body.text);
  const post = body => fetch(`${origin}/api/trees/${parent.id}/branches`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  try {
    for (const invalid of [{ ...body, start: 18 }, { ...body, messageId: 'missing' }, { ...body, start: 1, end: 2, text: original.slice(1, 2) }, { ...body, question: '' }]) assert.equal((await post(invalid)).status, 400);
    const before = store.tree(parent.id);
    fail = true;
    assert.equal((await post(body)).status, 500);
    assert.equal(store.list().length, 1);
    fail = false;
    store.db.exec("CREATE TRIGGER reject_branch BEFORE INSERT ON branches BEGIN SELECT RAISE(ABORT, 'synthetic save failure'); END");
    assert.equal((await post(body)).status, 500);
    assert.equal(store.list().length, 1);
    store.db.exec('DROP TRIGGER reject_branch');
    const response = await post(body);
    assert.equal(response.status, 201);
    const child = await response.json();
    assert.equal(child.model, 'fixture-model');
    assert.equal(child.provider, 'codex');
    assert.equal(child.thread, null);
    assert.deepEqual(child.branch, { parent: parent.id, messageId, start: 19, end: 30, text: body.text, question: body.question, snapshot: 'Relevant fixed context.' });
    assert.equal(captured.tree.thread, null);
    assert.equal(captured.tree.model, child.model);
    assert.match(captured.text, /Explain second occurrence/);
    assert.match(captured.text, /🌲 same phrase and same phrase/);
    assert.deepEqual(store.tree(parent.id), before);
    store.message(parent.id, 'user', 'Later parent change', 'completed');
    await (await fetch(`${origin}/api/trees/${child.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify({ text: body.question }) })).text();
    assert.equal(captured.tree.branch.snapshot, child.branch.snapshot);
    assert.equal(store.tree(parent.id).messages.length, 2);
    assert.deepEqual(store.tree(child.id).branch, child.branch);
    app.stop(); store.close();
    const reopened = new Store(path);
    assert.deepEqual(reopened.tree(child.id).branch, child.branch);
    assert.equal(reopened.tree(child.id).messages[0].text, body.question);
    reopened.close();
  } finally { if (app.server.listening) { app.stop(); store.close(); } }
});

test('recursive branches compact fixed ancestor context without reading live ancestors or descendants', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-nested-')), 'trees.sqlite');
  let store = new Store(path), app;
  const calls = [];
  const provider = { generate: async (tree, text, emit) => {
    calls.push({ tree, text });
    emit({ type: 'item', item: 'answer', text: tree.id ? 'A focused answer.' : 'Luma has 37 branches.' });
    emit({ type: 'status', status: 'completed' });
  } };
  const start = async () => {
    app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    return {
      get: async id => (await fetch(`${origin}/api/trees/${id}`)).json(),
      post: (route, body) => fetch(`${origin}/api/trees${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }),
    };
  };
  try {
    let api = await start();
    const root = await (await api.post('', { title: 'Root' })).json();
    store.thread(root.id, 'root-thread', 'fixture-model');
    const source = store.message(root.id, 'assistant', 'Luma has 37 branches.', 'completed');
    const anchor = { messageId: source, start: 0, end: 4, text: 'Luma', question: 'Explain Luma' };
    const rootBefore = await api.get(root.id);
    const first = await (await api.post(`/${root.id}/branches`, anchor)).json();
    assert.deepEqual(await api.get(root.id), rootBefore);
    const snapshots = [first.branch];
    store.message(root.id, 'user', 'Later root change: Nova has 99 branches.', 'completed');
    let parent = first;
    // Reuse identical branch/chat endpoints beyond grandchild depth.
    for (let depth = 0; depth < 6; depth++) {
      await (await api.post(`/${parent.id}/messages`, { text: parent.branch.question })).text();
      parent = await api.get(parent.id);
      const message = parent.messages.at(-1);
      const body = { messageId: message.id, start: 2, end: 9, text: 'focused', question: `Explain focused at depth ${depth + 2}` };
      const before = await api.get(parent.id);
      const response = await api.post(`/${parent.id}/branches`, body);
      assert.equal(response.status, 201);
      const child = await response.json();
      const call = calls.at(-1);
      const context = JSON.parse(call.text.slice(call.text.indexOf('\n') + 1));
      assert.deepEqual(context.inheritedContext, { snapshot: 'Luma has 37 branches.', selectedPassage: parent.branch.text, question: parent.branch.question });
      assert.deepEqual(context.messages, parent.messages);
      assert.equal(context.passage, body.text);
      assert.equal(context.question, body.question);
      assert.doesNotMatch(call.text, /Later root change|Nova has 99 branches|root-thread/);
      assert.equal(call.tree.thread, null);
      assert.equal(child.model, 'fixture-model');
      assert.equal(child.branch.snapshot, 'Luma has 37 branches.');
      assert.deepEqual(await api.get(parent.id), before);
      snapshots.push(child.branch);
      parent = child;
    }
    // Descendant turns never become input for a root turn.
    await (await api.post(`/${root.id}/messages`, { text: 'Continue root only' })).text();
    assert.equal(calls.at(-1).tree.branch, null);
    assert.doesNotMatch(JSON.stringify(calls.at(-1)), /focused|Explain Luma/);
    const records = await Promise.all(store.list().map(t => api.get(t.id)));
    app.stop(); store.close();
    store = new Store(path);
    api = await start();
    for (const record of records) assert.deepEqual(await api.get(record.id), record);
    assert.deepEqual(records.filter(t => t.branch).map(t => t.branch).reverse(), snapshots);
    // Continue chatting and nesting after restart using the same endpoints.
    await (await api.post(`/${parent.id}/messages`, { text: parent.branch.question })).text();
    assert.deepEqual(calls.at(-1).tree.branch, parent.branch);
    const saved = await api.get(parent.id);
    const response = await api.post(`/${saved.id}/branches`, { messageId: saved.messages.at(-1).id, start: 2, end: 9, text: 'focused', question: 'Continue nesting' });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).branch.parent, saved.id);
    assert.equal((await api.get(first.id)).branch.snapshot, 'Luma has 37 branches.');
  } finally { app?.stop(); store.close(); }
});

test('saved overview metadata preserves nested passage connections without transcripts or inherited context', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-overview-')), 'trees.sqlite');
  let store = new Store(path);
  try {
    const root = store.create('Root');
    const source = store.message(root.id, 'assistant', 'same and same', 'completed');
    const child = store.branch(root, { messageId: source, start: 9, end: 13, text: 'same', question: 'Child' }, 'Private inherited context');
    const nestedSource = store.message(child.id, 'assistant', 'Nested passage', 'completed');
    const nested = store.branch(child, { messageId: nestedSource, start: 0, end: 6, text: 'Nested', question: 'Grandchild' }, 'Other inherited context');
    const separate = store.create('Separate');
    const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {} });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    let trees;
    try { ({ trees } = await (await fetch(`http://127.0.0.1:${app.server.address().port}/api/state`)).json()); }
    finally { app.stop(); }
    assert.equal(new Set(trees.map(t => t.id)).size, 4);
    assert.deepEqual(trees.filter(t => !t.parent).map(t => t.id).sort(), [root.id, separate.id].sort());
    for (const [id, parent, messageId, start, end, passage] of [
      [child.id, root.id, source, 9, 13, 'same'],
      [nested.id, child.id, nestedSource, 0, 6, 'Nested'],
    ]) {
      const summary = trees.find(t => t.id === id);
      assert.deepEqual([summary.parent, summary.messageId, summary.start, summary.end, summary.passage], [parent, messageId, start, end, passage]);
    }
    assert.doesNotMatch(JSON.stringify(trees), /Private inherited context|Other inherited context|messages|snapshot/);
    store.close(); store = new Store(path);
    assert.deepEqual(JSON.parse(JSON.stringify(store.list())), trees);
  } finally { store.close(); }
});
