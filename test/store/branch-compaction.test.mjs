import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { compacted } from '../support/branch-first.mjs';

test('recursive branches compact fixed ancestor context without reading live ancestors or descendants', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-nested-')), 'trees.sqlite');
  let store = new Store(path),
    app;
  const calls = [];
  const provider = {
    generate: async (tree, text, emit) => {
      calls.push({ tree, text });
      emit({
        type: 'item',
        item: 'answer',
        text: tree.id ? 'A focused answer.' : 'Luma has 37 branches.',
      });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const start = async () => {
    app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    return {
      get: async (id) => (await fetch(`${origin}/api/trees/${id}`)).json(),
      compacted: (id) => compacted(app, origin, id),
      post: (route, body) =>
        fetch(`${origin}/api/trees${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
          body: JSON.stringify(body),
        }),
    };
  };
  try {
    let api = await start();
    const root = await (await api.post('', {})).json();
    store.thread(root.id, 'root-thread', 'fixture-model');
    const source = store.message(root.id, 'assistant', 'Luma has 37 branches.', 'completed');
    const anchor = { messageId: source, start: 0, end: 4, text: 'Luma', question: 'Explain Luma' };
    const rootBefore = await api.get(root.id);
    const first = await api.compacted(
      (await (await api.post(`/${root.id}/branches`, anchor)).json()).id,
    );
    assert.deepEqual(await api.get(root.id), rootBefore);
    const snapshots = [first.branch];
    store.message(root.id, 'user', 'Later root change: Nova has 99 branches.', 'completed');
    let parent = first;
    // Reuse identical branch/chat endpoints beyond grandchild depth.
    for (let depth = 0; depth < 6; depth++) {
      await (await api.post(`/${parent.id}/messages`, { text: parent.branch.question })).text();
      parent = await api.get(parent.id);
      const message = parent.messages.at(-1);
      const body = {
        messageId: message.id,
        start: 2,
        end: 9,
        text: 'focused',
        question: `Explain focused at depth ${depth + 2}`,
      };
      const before = await api.get(parent.id);
      const response = await api.post(`/${parent.id}/branches`, body);
      assert.equal(response.status, 201);
      const child = await api.compacted((await response.json()).id);
      const call = calls.at(-1);
      const context = JSON.parse(call.text.slice(call.text.indexOf('\n') + 1));
      assert.deepEqual(context.inheritedContext, {
        snapshot: 'Luma has 37 branches.',
        selectedPassage: parent.branch.text,
        question: parent.branch.question,
      });
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
    const records = await Promise.all(store.list().map((t) => api.get(t.id)));
    app.stop();
    store.close();
    store = new Store(path);
    api = await start();
    for (const record of records) assert.deepEqual(await api.get(record.id), record);
    assert.deepEqual(
      records
        .filter((t) => t.branch)
        .map((t) => t.branch)
        .reverse(),
      snapshots,
    );
    // Continue chatting and nesting after restart using the same endpoints.
    await (await api.post(`/${parent.id}/messages`, { text: parent.branch.question })).text();
    assert.deepEqual(calls.at(-1).tree.branch, parent.branch);
    const saved = await api.get(parent.id);
    const response = await api.post(`/${saved.id}/branches`, {
      messageId: saved.messages.at(-1).id,
      start: 2,
      end: 9,
      text: 'focused',
      question: 'Continue nesting',
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).branch.parent, saved.id);
    assert.equal((await api.get(first.id)).branch.snapshot, 'Luma has 37 branches.');
  } finally {
    app?.stop();
    store.close();
  }
});

test('quick thinking recursively compacts root, child and grandchild context without the new question, truncation or partial branches', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-quick-')), 'trees.sqlite');
  let store = new Store(path),
    app;
  const compactions = [],
    chats = [];
  let limit = null;
  // Longer than the rejected 80–150-word target, so any cap would show.
  const long = (depth) =>
    `Depth ${depth} summary: ` +
    Array.from({ length: 100 }, (_, i) => `idea${depth}-${i}`).join(' kept, ') +
    '.\nSecond line joins the paragraph.';
  const quick = {
    models: async () => [{ model: 'quick-model', efforts: ['low', 'high'] }],
    generate: async (tree, text, emit) => {
      compactions.push({ tree, text });
      if (limit) {
        emit({ type: 'status', status: 'failed' });
        throw new Error(limit);
      }
      emit({ type: 'item', item: 'summary', text: long(compactions.length) });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const chat = {
    generate: async (tree, text, emit, save) => {
      chats.push({ tree, text });
      save(`thread-${tree.id}`, 'chat-model');
      emit({ type: 'item', item: 'answer', text: `😀 Fact for ${text}: focused detail.` });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const start = async () => {
    app = createApp({
      store,
      providers: { codex: chat, claude: quick },
      auth: { status: () => ({ connected: true }) },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    return {
      get: async (id) => (await fetch(`${origin}/api/trees/${id}`)).json(),
      compacted: (id) => compacted(app, origin, id),
      post: (route, body) =>
        fetch(`${origin}/api/trees${route}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
          body: JSON.stringify(body),
        }),
    };
  };
  try {
    store.saveSuggestionSettings({
      enabled: false,
      model: { provider: 'claude', model: 'quick-model' },
      effort: 'low',
    });
    let api = await start();
    const root = await (await api.post('', {})).json();
    await (await api.post(`/${root.id}/messages`, { text: 'Root fact Alpha' })).text();
    const sibling = store.branch(
      store.tree(root.id),
      {
        messageId: store.tree(root.id).messages[1].id,
        start: 0,
        end: 2,
        text: '😀',
        question: 'Sibling',
      },
      'Sibling secret Omega',
    );
    store.message(sibling.id, 'user', 'Sibling history Omega', 'completed');
    let parent = await api.get(root.id),
      snapshots = [],
      prior = null;
    for (const [depth, question] of [
      [1, 'Child question Beta?'],
      [2, 'Grandchild question Gamma?'],
    ]) {
      const source = parent.messages.at(-1);
      // UTF-16 offsets: the emoji is two code units, so "Fact" starts at 3.
      const body = { messageId: source.id, start: 3, end: 7, text: 'Fact', question };
      assert.equal(source.text.slice(3, 7), 'Fact');
      const before = await api.get(parent.id);
      limit = "Claude: Prompt is too long for this model's context window.";
      const failed = await api.post(`/${parent.id}/branches`, body);
      assert.equal(failed.status, 201);
      const orphan = await api.compacted((await failed.json()).id);
      assert.match(
        await (await api.post(`/${orphan.id}/messages`, { text: question })).text(),
        /Context preparation failed\. Claude: Prompt is too long/,
      );
      await api.post(`/${root.id}/delete`, { conversation: orphan.id });
      assert.equal(store.list().length, depth + 1, 'the kept failed child was deleted');
      limit = null;
      const response = await api.post(`/${parent.id}/branches`, body);
      assert.equal(response.status, 201);
      const child = await api.compacted((await response.json()).id);
      const call = compactions.at(-1);
      assert.deepEqual(
        [call.tree.provider, call.tree.model, call.tree.effort, call.tree.thread],
        ['claude', 'quick-model', 'low', null],
      );
      assert.doesNotMatch(
        call.text,
        new RegExp(question.replace('?', '\\?')),
        'the new question is not summarizer input',
      );
      assert.doesNotMatch(call.text, /Omega|Later parent/);
      const input = JSON.parse(call.text.slice(call.text.indexOf('\n') + 1));
      assert.deepEqual(Object.keys(input), ['inheritedContext', 'messages', 'passage']);
      assert.deepEqual(input.inheritedContext, prior);
      assert.deepEqual(
        input.messages.map((m) => m.text),
        parent.messages.map((m) => m.text),
      );
      assert.equal(input.passage, 'Fact');
      // Full text kept as one paragraph, exact passage and question saved separately.
      assert.equal(child.branch.snapshot, long(compactions.length).replace('\n', ' '));
      assert.ok(child.branch.snapshot.split(' ').length > 150);
      assert.deepEqual(
        [child.branch.text, child.branch.question, child.branch.start, child.branch.end],
        ['Fact', question, 3, 7],
      );
      assert.deepEqual(
        [child.provider, child.model],
        ['codex', 'chat-model'],
        'child keeps the chat choice, not quick thinking',
      );
      assert.deepEqual(await api.get(parent.id), before, 'parent and source messages unchanged');
      await (await api.post(`/${child.id}/messages`, { text: question })).text();
      assert.equal(chats.at(-1).text, question);
      assert.equal(chats.at(-1).tree.branch.snapshot, child.branch.snapshot);
      store.message(parent.id, 'user', 'Later parent change', 'completed');
      snapshots.push(child.branch);
      prior = { snapshot: child.branch.snapshot, selectedPassage: 'Fact', question };
      parent = await api.get(child.id);
    }
    app.stop();
    store.close();
    store = new Store(path);
    api = await start();
    const reopened = (await Promise.all(store.list().map((t) => api.get(t.id)))).filter(
      (t) => t.branch && t.id !== sibling.id,
    );
    assert.deepEqual(
      reopened.map((t) => t.branch).sort((a, b) => a.question.localeCompare(b.question)),
      snapshots,
    );
  } finally {
    app?.stop();
    store.close();
  }
});
