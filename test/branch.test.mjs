import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { compacted } from './branch-first.mjs';

test('sibling branches interleave independent saved turns while another tree submits', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-interleaving-')), 'trees.sqlite');
  const store = new Store(path);
  const turns = new Map();
  const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {
    generate: (tree, text, emit, save) => new Promise(resolve => {
      save(`thread-${tree.id}`, 'fixture-model');
      turns.set(tree.id, { emit, resolve });
    }),
  } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (id, text) => fetch(`${origin}/api/trees/${id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify({ text }) });
  const get = async id => (await fetch(`${origin}/api/trees/${id}`)).json();
  try {
    const root = store.create('Root');
    const source = store.message(root.id, 'assistant', 'Roots exchange nutrients.', 'completed');
    const anchor = { messageId: source, start: 0, end: 5, text: 'Roots' };
    const a = store.branch(root, { ...anchor, question: 'Branch A' }, 'Fixed A context');
    const b = store.branch(root, { ...anchor, question: 'Branch B' }, 'Fixed B context');
    const other = store.create('Other tree');
    const owners = [a, b, other];
    const responses = await Promise.all(owners.map(t => post(t.id, t.title)));
    assert.equal(app.active.size, 3);
    assert.equal((await post(a.id, 'Duplicate')).status, 409);
    const transcripts = responses.map(r => r.text());
    for (let step = 1; step <= 3; step++) {
      for (const tree of [b, other, a]) {
        turns.get(tree.id).emit({ type: 'delta', item: 'same-item-id', text: `${tree.title}:${step} ` });
        const saved = await get(tree.id);
        assert.equal(saved.messages.length, 2);
        assert.equal(saved.messages[0].text, tree.title);
        assert.equal(saved.messages[1].text, Array.from({ length: step }, (_, i) => `${tree.title}:${i + 1} `).join(''));
        assert.equal(saved.messages[1].status, 'streaming');
      }
    }
    for (const tree of [b, a, other]) {
      turns.get(tree.id).emit({ type: 'status', status: 'completed' });
      turns.get(tree.id).resolve();
    }
    const streams = await Promise.all(transcripts);
    const records = await Promise.all(owners.map(t => get(t.id)));
    for (let i = 0; i < owners.length; i++) {
      const events = streams[i].trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
      assert.equal(events[0].id, records[i].messages[1].id);
      assert.deepEqual(events[0].user, records[i].messages[0]);
      assert.equal(events.at(-1).status, 'completed');
      for (const foreign of owners.filter(t => t.id !== owners[i].id)) assert.ok(!streams[i].includes(foreign.title));
    }
    assert.equal(app.active.size, 0);
    assert.equal((await get(root.id)).messages.length, 1);
    app.stop(); store.close();
    const reopened = new Store(path);
    try { for (const record of records) assert.deepEqual(JSON.parse(JSON.stringify(reopened.tree(record.id))), record); }
    finally { reopened.close(); }
  } finally {
    for (const turn of turns.values()) turn.resolve();
    if (app.server.listening) { app.stop(); store.close(); }
  }
});

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
    // Branch-first: a failed compaction keeps the child; its first reply fails with the reason.
    fail = true;
    const failed = await post(body);
    assert.equal(failed.status, 201);
    const orphan = await compacted(origin, (await failed.json()).id);
    assert.equal(orphan.branch.snapshot, '');
    const stream = await (await fetch(`${origin}/api/trees/${orphan.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify({ text: body.question }) })).text();
    assert.match(stream, /Context preparation failed\. Synthetic compaction failure/);
    assert.equal(store.tree(orphan.id).messages.at(-1).status, 'failed');
    await fetch(`${origin}/api/trees/${parent.id}/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify({ conversation: orphan.id }) });
    assert.equal(store.list().length, 1);
    fail = false;
    store.db.exec("CREATE TRIGGER reject_branch BEFORE INSERT ON branches BEGIN SELECT RAISE(ABORT, 'synthetic save failure'); END");
    assert.equal((await post(body)).status, 500);
    assert.equal(store.list().length, 1);
    store.db.exec('DROP TRIGGER reject_branch');
    const response = await post(body);
    assert.equal(response.status, 201);
    const child = await compacted(origin, (await response.json()).id);
    assert.equal(child.model, 'fixture-model');
    assert.equal(child.provider, 'codex');
    assert.equal(child.thread, null);
    assert.deepEqual(child.branch, { parent: parent.id, messageId, start: 19, end: 30, text: body.text, question: body.question, snapshot: 'Relevant fixed context.' });
    assert.equal(captured.tree.thread, null);
    assert.equal(captured.tree.model, child.model);
    assert.equal(captured.tree.effort, null, 'unset quick thinking never borrows the chat effort');
    assert.doesNotMatch(captured.text, /Explain second occurrence/);
    assert.match(captured.text, /🌲 same phrase and same phrase/);
    assert.deepEqual(store.tree(parent.id), before);
    store.message(parent.id, 'user', 'Later parent change', 'completed');
    await (await fetch(`${origin}/api/trees/${child.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify({ text: body.question }) })).text();
    assert.equal(captured.tree.branch.snapshot, child.branch.snapshot);
    // The focused chat's inherited section reads passage, question and snapshot straight from GET; roots carry none.
    const get = async id => (await fetch(`${origin}/api/trees/${id}`)).json();
    assert.deepEqual(((await get(child.id)).branch), child.branch);
    assert.equal((await get(parent.id)).branch, null);
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
      compacted: id => compacted(origin, id),
      post: (route, body) => fetch(`${origin}/api/trees${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }),
    };
  };
  try {
    let api = await start();
    const root = await (await api.post('', {})).json();
    store.thread(root.id, 'root-thread', 'fixture-model');
    const source = store.message(root.id, 'assistant', 'Luma has 37 branches.', 'completed');
    const anchor = { messageId: source, start: 0, end: 4, text: 'Luma', question: 'Explain Luma' };
    const rootBefore = await api.get(root.id);
    const first = await api.compacted((await (await api.post(`/${root.id}/branches`, anchor)).json()).id);
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
      const child = await api.compacted((await response.json()).id);
      const call = calls.at(-1);
      const context = JSON.parse(call.text.slice(call.text.indexOf('\n') + 1));
      assert.deepEqual(context.inheritedContext, { snapshot: 'Luma has 37 branches.', selectedPassage: parent.branch.text, question: parent.branch.question });
      assert.deepEqual(context.messages, parent.messages);
      assert.equal(context.passage, body.text);
      assert.equal(Object.hasOwn(context, 'question'), false);
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

test('quick thinking recursively compacts root, child and grandchild context without the new question, truncation or partial branches', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-quick-')), 'trees.sqlite');
  let store = new Store(path), app;
  const compactions = [], chats = [];
  let limit = null;
  // Longer than the rejected 80–150-word target, so any cap would show.
  const long = depth => `Depth ${depth} summary: ` + Array.from({ length: 100 }, (_, i) => `idea${depth}-${i}`).join(' kept, ') + '.\nSecond line joins the paragraph.';
  const quick = { models: async () => [{ model: 'quick-model', efforts: ['low', 'high'] }], generate: async (tree, text, emit) => {
    compactions.push({ tree, text });
    if (limit) { emit({ type: 'status', status: 'failed' }); throw new Error(limit); }
    emit({ type: 'item', item: 'summary', text: long(compactions.length) });
    emit({ type: 'status', status: 'completed' });
  } };
  const chat = { generate: async (tree, text, emit, save) => {
    chats.push({ tree, text });
    save(`thread-${tree.id}`, 'chat-model');
    emit({ type: 'item', item: 'answer', text: `😀 Fact for ${text}: focused detail.` });
    emit({ type: 'status', status: 'completed' });
  } };
  const start = async () => {
    app = createApp({ store, providers: { codex: chat, claude: quick }, auth: { status: () => ({ connected: true }) } });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    return {
      get: async id => (await fetch(`${origin}/api/trees/${id}`)).json(),
      compacted: id => compacted(origin, id),
      post: (route, body) => fetch(`${origin}/api/trees${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }),
    };
  };
  try {
    store.saveSuggestionSettings({ enabled: false, model: { provider: 'claude', model: 'quick-model' }, effort: 'low' });
    let api = await start();
    const root = await (await api.post('', {})).json();
    await (await api.post(`/${root.id}/messages`, { text: 'Root fact Alpha' })).text();
    const sibling = store.branch(store.tree(root.id), { messageId: store.tree(root.id).messages[1].id, start: 0, end: 2, text: '😀', question: 'Sibling' }, 'Sibling secret Omega');
    store.message(sibling.id, 'user', 'Sibling history Omega', 'completed');
    let parent = await api.get(root.id), snapshots = [], prior = null;
    for (const [depth, question] of [[1, 'Child question Beta?'], [2, 'Grandchild question Gamma?']]) {
      const source = parent.messages.at(-1);
      // UTF-16 offsets: the emoji is two code units, so "Fact" starts at 3.
      const body = { messageId: source.id, start: 3, end: 7, text: 'Fact', question };
      assert.equal(source.text.slice(3, 7), 'Fact');
      const before = await api.get(parent.id);
      limit = 'Claude: Prompt is too long for this model\'s context window.';
      const failed = await api.post(`/${parent.id}/branches`, body);
      assert.equal(failed.status, 201);
      const orphan = await api.compacted((await failed.json()).id);
      assert.match(await (await api.post(`/${orphan.id}/messages`, { text: question })).text(), /Context preparation failed\. Claude: Prompt is too long/);
      await api.post(`/${root.id}/delete`, { conversation: orphan.id });
      assert.equal(store.list().length, depth + 1, 'the kept failed child was deleted');
      limit = null;
      const response = await api.post(`/${parent.id}/branches`, body);
      assert.equal(response.status, 201);
      const child = await api.compacted((await response.json()).id);
      const call = compactions.at(-1);
      assert.deepEqual([call.tree.provider, call.tree.model, call.tree.effort, call.tree.thread], ['claude', 'quick-model', 'low', null]);
      assert.doesNotMatch(call.text, new RegExp(question.replace('?', '\\?')), 'the new question is not summarizer input');
      assert.doesNotMatch(call.text, /Omega|Later parent/);
      const input = JSON.parse(call.text.slice(call.text.indexOf('\n') + 1));
      assert.deepEqual(Object.keys(input), ['inheritedContext', 'messages', 'passage']);
      assert.deepEqual(input.inheritedContext, prior);
      assert.deepEqual(input.messages.map(m => m.text), parent.messages.map(m => m.text));
      assert.equal(input.passage, 'Fact');
      // Full text kept as one paragraph, exact passage and question saved separately.
      assert.equal(child.branch.snapshot, long(compactions.length).replace('\n', ' '));
      assert.ok(child.branch.snapshot.split(' ').length > 150);
      assert.deepEqual([child.branch.text, child.branch.question, child.branch.start, child.branch.end], ['Fact', question, 3, 7]);
      assert.deepEqual([child.provider, child.model], ['codex', 'chat-model'], 'child keeps the chat choice, not quick thinking');
      assert.deepEqual(await api.get(parent.id), before, 'parent and source messages unchanged');
      await (await api.post(`/${child.id}/messages`, { text: question })).text();
      assert.equal(chats.at(-1).text, question);
      assert.equal(chats.at(-1).tree.branch.snapshot, child.branch.snapshot);
      store.message(parent.id, 'user', 'Later parent change', 'completed');
      snapshots.push(child.branch);
      prior = { snapshot: child.branch.snapshot, selectedPassage: 'Fact', question };
      parent = await api.get(child.id);
    }
    app.stop(); store.close();
    store = new Store(path);
    api = await start();
    const reopened = (await Promise.all(store.list().map(t => api.get(t.id)))).filter(t => t.branch && t.id !== sibling.id);
    assert.deepEqual(reopened.map(t => t.branch).sort((a, b) => a.question.localeCompare(b.question)), snapshots);
  } finally { app?.stop(); store.close(); }
});

test('branch-first: the child is saved and listed before a held compaction finishes; its first reply waits for the inherited context', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-branch-first-')), 'trees.sqlite'));
  let release, replied = false, chat;
  const held = new Promise(resolve => { release = resolve; });
  const provider = { generate: async (tree, text, emit) => {
    if (!tree.id) { await held; emit({ type: 'item', item: 's', text: 'Held compacted context.' }); }
    else { replied = true; chat = tree; emit({ type: 'item', item: 'a', text: 'Focused answer.' }); }
    emit({ type: 'status', status: 'completed' });
  } };
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body) => fetch(`${origin}/api/trees/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  try {
    const parent = store.create('Parent');
    const messageId = store.message(parent.id, 'assistant', 'Roots exchange nutrients.', 'completed');
    const response = await post(`${parent.id}/branches`, { messageId, start: 0, end: 5, text: 'Roots', question: 'Why roots?' });
    assert.equal(response.status, 201);
    const child = await response.json();
    assert.equal(child.branch.snapshot, '');
    const state = await (await fetch(`${origin}/api/state`)).json();
    assert.ok(state.trees.some(t => t.id === child.id && t.parent === parent.id));
    assert.deepEqual(state.compacting, [child.id]);
    assert.deepEqual(state.active, [], 'the parent is free while the child compacts');
    // Read the stream incrementally: compacting status arrives while compaction is still held.
    const stream = (await post(`${child.id}/messages`, { text: 'Why roots?' })).body.getReader();
    let seen = '';
    while (!seen.includes('"compacting"')) seen += new TextDecoder().decode((await stream.read()).value);
    assert.match(seen, /"type":"saved"/);
    assert.equal(replied, false);
    release();
    while (true) { const { value, done } = await stream.read(); if (done) break; seen += new TextDecoder().decode(value); }
    assert.ok(seen.indexOf('"compacting"') < seen.indexOf('"thinking"') && seen.indexOf('"thinking"') < seen.indexOf('Focused answer.'));
    assert.equal(chat.branch.snapshot, 'Held compacted context.');
    assert.equal(store.tree(child.id).branch.snapshot, 'Held compacted context.');
    assert.deepEqual((await (await fetch(`${origin}/api/state`)).json()).compacting, []);
    // Fixed from then on: a second write never replaces it.
    store.compacted(child.id, 'Other');
    assert.equal(store.tree(child.id).branch.snapshot, 'Held compacted context.');
  } finally { release(); app.stop(); store.close(); }
});

test('branch-first: a failed compaction keeps the child with a readable error; Retry compacts again then replies', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-compaction-retry-')), 'trees.sqlite'));
  let fail = true, compactions = 0, chat = null;
  const provider = { generate: async (tree, text, emit) => {
    if (!tree.id) {
      compactions++;
      if (fail) throw new Error(`Synthetic compaction failure ${compactions}`);
      emit({ type: 'item', item: 's', text: 'Retried compacted context.' });
    } else { chat = tree; emit({ type: 'item', item: 'a', text: 'Focused answer.' }); }
    emit({ type: 'status', status: 'completed' });
  } };
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body = {}) => fetch(`${origin}/api/trees/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  const get = async id => (await fetch(`${origin}/api/trees/${id}`)).json();
  try {
    const parent = store.create('Parent');
    const messageId = store.message(parent.id, 'assistant', 'Roots exchange nutrients.', 'completed');
    const branch = async () => {
      const child = await compacted(origin, (await (await post(`${parent.id}/branches`, { messageId, start: 0, end: 5, text: 'Roots', question: 'Why roots?' })).json()).id);
      assert.equal(child.branch.snapshot, '');
      assert.deepEqual(child.compaction, { status: 'failed', error: 'Context preparation failed. Synthetic compaction failure 1 Retry, or choose another quick thinking model in Settings if this repeats.' });
      return child;
    };
    const child = await branch();
    assert.ok((await (await fetch(`${origin}/api/state`)).json()).trees.some(t => t.id === child.id), 'the failed child stays saved');
    // The first reply fails without calling the tutor; no reply text is written.
    assert.match(await (await post(`${child.id}/messages`, { text: 'Why roots?' })).text(), /Context preparation failed\. Synthetic compaction failure 1/);
    assert.equal(chat, null);
    let saved = await get(child.id);
    assert.deepEqual(saved.messages.map(m => [m.role, m.text, m.status]), [['user', 'Why roots?', 'completed'], ['assistant', '', 'failed']]);
    assert.equal(saved.compaction.status, 'failed');
    assert.equal((await post(`${child.id}/messages`, { text: 'Again?' })).status, 409, 'only Retry prepares the context again');
    // A second failure shows the error again.
    assert.match(await (await post(`${child.id}/retry`)).text(), /Context preparation failed\. Synthetic compaction failure 2/);
    assert.equal(compactions, 2);
    assert.equal(chat, null);
    saved = await get(child.id);
    assert.match(saved.compaction.error, /Synthetic compaction failure 2/);
    assert.deepEqual(saved.messages.map(m => [m.role, m.status]), [['user', 'completed'], ['assistant', 'failed']]);
    // Retry compacts again, then answers the question with the inherited context.
    fail = false;
    const stream = await (await post(`${child.id}/retry`)).text();
    assert.ok(stream.indexOf('"compacting"') < stream.indexOf('"thinking"') && stream.indexOf('"thinking"') < stream.indexOf('Focused answer.'));
    assert.equal(chat.branch.snapshot, 'Retried compacted context.');
    saved = await get(child.id);
    assert.equal(saved.compaction, undefined);
    assert.deepEqual(saved.messages.map(m => [m.role, m.text, m.status]), [['user', 'Why roots?', 'completed'], ['assistant', 'Focused answer.', 'completed']]);
    // Deleting a failed child still works.
    fail = true; compactions = 0;
    const failed = await branch();
    assert.equal((await post(`${parent.id}/delete`, { conversation: failed.id })).status, 200);
    assert.equal(store.tree(failed.id), undefined);
    assert.equal((await get(failed.id)).error, 'Learning tree not found.');
  } finally { app.stop(); store.close(); }
});

test('opening the branch form prepares compaction: submit reuses it, cancel aborts it, a changed parent reruns it; every run is in Usage history', async () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-prepare-')), 'trees.sqlite'));
  const calls = [];
  const provider = { generate: async (tree, text, emit, save, signal) => {
    if (!tree.id) {
      const call = { text, aborted: false };
      calls.push(call);
      await new Promise((resolve, reject) => { call.release = resolve; signal.addEventListener('abort', () => { call.aborted = true; reject(new Error('Stopped.')); }, { once: true }); });
      emit({ type: 'usage', usage: { input: 10, output: 2 } });
      emit({ type: 'item', item: 's', text: `Prepared context ${calls.length}.` });
    } else emit({ type: 'item', item: 'a', text: 'Focused answer.' });
    emit({ type: 'status', status: 'completed' });
  } };
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body = {}) => fetch(`${origin}/api/trees/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  try {
    const parent = store.create('Parent');
    const messageId = store.message(parent.id, 'assistant', 'Roots exchange nutrients.', 'completed');
    const anchor = { messageId, start: 0, end: 5, text: 'Roots' };
    assert.equal((await post(`${parent.id}/prepare`, { messageId, start: 0, end: 3, text: 'Nope' })).status, 400);

    // Prepare then submit while still in flight: exactly one compaction call, reused by the child.
    assert.equal((await post(`${parent.id}/prepare`, anchor)).status, 202);
    assert.equal((await post(`${parent.id}/prepare`, anchor)).status, 202, 'reopening on the same passage keeps the run');
    await tick();
    assert.equal(calls.length, 1);
    const child = await (await post(`${parent.id}/branches`, { ...anchor, question: 'Why roots?' })).json();
    calls[0].release();
    assert.equal((await compacted(origin, child.id)).branch.snapshot, 'Prepared context 1.');
    assert.equal(calls.length, 1);
    assert.match(calls[0].text, /Roots/);
    assert.doesNotMatch(calls[0].text, /Why roots\?/, 'compaction never sees the question');

    // Prepare then cancel aborts the call; no child is created.
    const before = store.list().length;
    await post(`${parent.id}/prepare`, anchor);
    await tick();
    assert.equal((await post(`${parent.id}/unprepare`, { messageId, start: 6, end: 14, text: 'exchange' })).status, 200);
    await tick();
    assert.equal(calls[1].aborted, false, 'closing another passage leaves this run');
    assert.equal((await post(`${parent.id}/unprepare`, anchor)).status, 200);
    await tick();
    assert.equal(calls[1].aborted, true);
    assert.equal(store.list().length, before);

    // Prepare, parent gains a message, submit: the prepared run is discarded and compaction reruns.
    await post(`${parent.id}/prepare`, anchor);
    await tick();
    store.message(parent.id, 'user', 'And leaves?', 'completed');
    const rerun = await (await post(`${parent.id}/branches`, { ...anchor, question: 'Why roots?' })).json();
    await tick();
    assert.equal(calls[2].aborted, true);
    assert.equal(calls.length, 4);
    assert.match(calls[3].text, /And leaves\?/);
    calls[3].release();
    assert.equal((await compacted(origin, rerun.id)).branch.snapshot, 'Prepared context 4.');

    // Usage history records every quick-thinking compaction call, cancelled ones included.
    const events = (await (await fetch(`${origin}/api/usage`)).json()).events.filter(e => e.task === 'compaction');
    assert.equal(events.length, 4);
  } finally { app.stop(); store.close(); }
});
