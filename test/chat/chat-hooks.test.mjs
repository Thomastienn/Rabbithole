import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const [
  { useChatState },
  { useLearningTrees },
  { useChatModel },
  { useReplyStream },
  { useBranchForm },
  { useTreeActions },
  { useLayoutSaving },
] = await Promise.all([
  import('../../src/chat/useChatState.ts'),
  import('../../src/chat/useLearningTrees.ts'),
  import('../../src/chat/useChatModel.ts'),
  import('../../src/chat/useReplyStream.ts'),
  import('../../src/chat/useBranchForm.ts'),
  import('../../src/chat/useTreeActions.ts'),
  import('../../src/map/useLayoutSaving.ts'),
]);

const conversation = (id) => ({
  id,
  title: id,
  provider: 'claude',
  model: 'opus',
  effort: 'high',
  branch: null,
  artifacts: [],
  messages: [],
});
const summary = (id, parent = null) => ({
  id,
  title: id,
  parent,
  created: 0,
  layout: { folded: [], selected: id, panel: 'beside' },
});
const deferred = () => Promise.withResolvers();
const json = (body, ok = true) => ({ ok, json: async () => structuredClone(body) });

// Mount the same hook composition as ChatPage without the map or media DOM.
async function mount(t, intercept = () => {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const savedFetch = globalThis.fetch;
  const data = new Map(['a', 'b'].map((id) => [id, conversation(id)]));
  const state = {
    csrf: 'csrf',
    auth: { connected: true, email: null },
    trees: [summary('a'), summary('b')],
    active: [],
    videos: [],
  };
  const calls = [];
  globalThis.fetch = async (path, init) => {
    const call = { path, body: init?.body && JSON.parse(init.body), init };
    calls.push(call);
    const response = intercept(call, { data, state });
    if (response !== undefined) return response;
    if (path === '/api/state') return json(state);
    if (path === '/api/models')
      return json({
        models: [
          { provider: 'claude', model: 'opus', label: 'Opus', isDefault: true, efforts: ['high'] },
          { provider: 'codex', model: 'gpt', label: 'GPT', isDefault: true, efforts: [] },
        ],
        providers: {
          claude: { label: 'Claude', connected: true },
          codex: { label: 'Codex', connected: true },
        },
      });
    if (path === '/api/settings/chat')
      return json({ provider: 'claude', model: 'opus', effort: null });
    if (path.startsWith('/api/previews?')) return json({});
    if (data.has(path.split('/').at(-1))) return json(data.get(path.split('/').at(-1)));
    if (/\/(layout|prepare|unprepare|stop)$/.test(path)) return json({});
    throw new Error(`Unexpected request: ${path}`);
  };
  let current;
  function Fixture() {
    const c = useChatState();
    const layout = useLayoutSaving(c);
    const trees = useLearningTrees(c, layout);
    const model = useChatModel(c);
    const stream = useReplyStream(c, trees, model, { name: 'paperback', mode: 'light' });
    const actions = useTreeActions(c, layout, trees, model, stream);
    const branch = useBranchForm(c, trees, model, stream);
    current = { c, layout, trees, model, stream, actions, branch };
    return h('section', { ref: c.workspace });
  }
  const page = await render(h(Fixture), ui);
  t.after(async () => {
    await page.cleanup();
    globalThis.fetch = savedFetch;
  });
  return {
    ...page,
    get current() {
      return current;
    },
    calls,
    data,
    state,
  };
}

test('slow selections cannot replace the current conversation and drafts stay per conversation', async (t) => {
  const slow = deferred();
  let delay = false;
  const page = await mount(t, ({ path }) =>
    delay && path === '/api/trees/a' ? slow.promise : undefined,
  );
  const { act } = page;
  assert.equal(page.current.c.tree.id, 'a');
  await act(async () => page.current.c.setDrafts({ a: 'Draft A', b: 'Draft B' }));
  delay = true;
  let selecting;
  await act(async () => {
    selecting = page.current.trees.select('a');
  });
  await act(async () => page.current.trees.openConversation('b'));
  await act(async () => {
    slow.resolve(json(conversation('a')));
    await selecting;
  });
  assert.equal(page.current.c.tree.id, 'b');
  assert.equal(page.current.c.loading, false);
  assert.equal(page.current.c.overview, false);
  assert.deepEqual(page.current.c.drafts, { a: 'Draft A', b: 'Draft B' });
});

test('model saving never replaces a newly selected conversation', async (t) => {
  const save = deferred();
  const page = await mount(t, ({ path }) =>
    path === '/api/trees/a/model' ? save.promise : undefined,
  );
  let saving;
  await page.act(async () => {
    saving = page.current.model.chooseModel('codex', 'gpt', null);
  });
  await page.act(async () => page.current.trees.select('b'));
  await page.act(async () => {
    save.resolve(json({ provider: 'codex', model: 'gpt', effort: null }));
    await saving;
  });
  assert.equal(page.current.c.tree.id, 'b');
  assert.equal(page.current.c.tree.provider, 'claude');
  assert.equal(page.current.model.modelNotice, '');
  assert.equal(page.current.model.savingModel, undefined);
  assert.deepEqual(page.calls.find((c) => c.path.endsWith('/model')).body, {
    provider: 'codex',
    model: 'gpt',
    effort: null,
  });
});

test('interleaved replies update their own previews and retry preserves the composer draft', async (t) => {
  const streams = new Map();
  const page = await mount(t, ({ path }) => {
    if (!/\/(messages|retry)$/.test(path)) return;
    const id = path.split('/')[3];
    return new Response(
      new ReadableStream({
        start(controller) {
          streams.set(id, controller);
        },
      }),
    );
  });
  const emit = (id, events) =>
    streams
      .get(id)
      .enqueue(
        new TextEncoder().encode(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')),
      );
  const replies = [];
  await page.act(async () => {
    replies.push(page.current.stream.send('Question A'));
  });
  await page.act(async () => page.current.trees.openConversation('b'));
  await page.act(async () => {
    replies.push(page.current.stream.send('Question B'));
  });
  for (const id of ['b', 'a']) {
    const user = {
      id: `${id}-q`,
      role: 'user',
      text: `Question ${id.toUpperCase()}`,
      status: 'completed',
    };
    await page.act(async () =>
      emit(id, [
        { type: 'saved', id: `${id}-r`, title: id, user },
        { type: 'text', text: `Reply ${id}` },
      ]),
    );
    page.data.set(id, {
      ...conversation(id),
      messages: [
        user,
        {
          id: `${id}-r`,
          role: 'assistant',
          text: `Reply ${id}`,
          status: 'completed',
        },
      ],
    });
  }
  assert.equal(page.current.c.tree.id, 'b');
  assert.equal(page.current.c.tree.messages.at(-1).text, 'Reply b');
  assert.equal(page.current.c.previews.a.at(-1).text, 'Reply a');
  assert.equal(page.current.c.previews.b.at(-1).text, 'Reply b');
  assert.deepEqual(new Set(page.current.c.state.active), new Set(['a', 'b']));
  await page.act(async () => page.current.stream.stop('a'));
  assert.ok(page.calls.some((c) => c.path === '/api/trees/a/stop'));
  await page.act(async () => {
    streams.get('a').close();
    streams.get('b').close();
    await Promise.all(replies);
  });
  assert.deepEqual(page.current.c.state.active, []);
  await page.act(async () => page.current.c.setDrafts({ b: 'Keep this draft' }));
  let retry;
  await page.act(async () => {
    retry = page.current.stream.retryFromMap('b');
  });
  const retryCall = page.calls.find((c) => c.path.endsWith('/retry'));
  assert.deepEqual(retryCall.body, { theme: { name: 'paperback', mode: 'light' } });
  assert.equal(retryCall.init.headers['X-TreeTutor-CSRF'], 'csrf');
  await page.act(async () => {
    streams.get('b').close();
    await retry;
  });
  assert.equal(page.current.c.drafts.b, 'Keep this draft');
});

test('layout changes survive stale refreshes and batch into one write with the latest CSRF', async (t) => {
  const page = await mount(t);
  await page.act(async () => {
    page.current.c.setFolds({ root: 'a', ids: [] });
    page.current.c.setOverview(false);
  });
  await page.act(async () => {
    page.current.layout.savePositions({ a: { x: 120, y: 70 } });
    page.current.layout.saveViewport({ x: -3, y: 10, zoom: 0.8 });
  });
  page.state.csrf = 'latest-csrf';
  await page.act(async () => page.current.trees.refresh());
  const root = page.current.c.state.trees.find((t) => t.id === 'a');
  assert.equal(root.x, 120);
  assert.deepEqual(root.layout.viewport, { x: -3, y: 10, zoom: 0.8 });
  assert.equal(page.calls.filter((c) => c.path.endsWith('/layout')).length, 0);
  await page.act(async () => t.mock.timers.tick(60_000));
  const writes = page.calls.filter((c) => c.path.endsWith('/layout'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].init.headers['X-TreeTutor-CSRF'], 'latest-csrf');
  assert.deepEqual(writes[0].body.positions, { a: { x: 120, y: 70 } });
  assert.deepEqual(writes[0].body.viewport, root.layout.viewport);
  await page.act(async () => t.mock.timers.tick(60_000));
  assert.equal(page.calls.filter((c) => c.path.endsWith('/layout')).length, 1);
});

test('reopened replies poll saved checkpoints until the server reports completion', async (t) => {
  const page = await mount(t, ({ path }, { state, data }) => {
    if (path === '/api/state' && !data.get('a').messages.length) state.active = ['a'];
  });
  assert.deepEqual(page.current.c.state.active, ['a']);
  page.data.set('a', {
    ...conversation('a'),
    messages: [
      {
        id: 'answer',
        role: 'assistant',
        text: 'Recovered reply',
        status: 'completed',
      },
    ],
  });
  page.state.active = [];
  await page.act(async () => t.mock.timers.tick(1500));
  assert.equal(page.current.c.tree.messages[0].text, 'Recovered reply');
  assert.deepEqual(page.current.c.state.active, []);
});

test('a failed send restores the unsaved question and reports its error', async (t) => {
  const page = await mount(t, ({ path }) =>
    path.endsWith('/messages') ? json({ error: 'Provider unavailable' }, false) : undefined,
  );
  await page.act(async () => page.current.stream.send('Keep my question'));
  assert.equal(page.current.c.drafts.a, 'Keep my question');
  assert.equal(page.current.c.error, 'Provider unavailable');
  assert.deepEqual(page.current.c.tree.messages, []);
  assert.deepEqual(page.current.c.state.active, []);
});

test('branch preparation excludes the question and the saved child opens before its reply finishes', async (t) => {
  let controller;
  const page = await mount(t, ({ path, body }, { data, state }) => {
    if (path === '/api/trees/a/branches') {
      const child = {
        ...conversation('child'),
        branch: {
          parent: 'a',
          messageId: 'reply',
          text: 'Thin threads',
          question: body.question,
          snapshot: 'Context',
        },
      };
      data.set('child', child);
      state.trees.push(summary('child', 'a'));
      return json(child);
    }
    if (path === '/api/trees/child/messages')
      return new Response(
        new ReadableStream({
          start(value) {
            controller = value;
          },
        }),
      );
  });
  const anchor = {
    messageId: 'reply',
    start: 0,
    end: 12,
    text: 'Thin threads',
    at: { x: 1, y: 2 },
  };
  await page.act(async () => page.current.branch.startBranch('a', anchor, { current: null }));
  await page.act(async () => page.current.c.setBranch((b) => ({ ...b, question: 'Why threads?' })));
  assert.deepEqual(page.calls.find((c) => c.path.endsWith('/prepare')).body, {
    messageId: 'reply',
    start: 0,
    end: 12,
    text: 'Thin threads',
  });
  let submitted;
  await page.act(async () => {
    submitted = page.current.branch.submitBranch({ preventDefault() {} });
  });
  assert.equal(page.current.c.tree.id, 'child');
  assert.equal(page.current.c.overview, false);
  assert.equal(page.current.c.branch, undefined);
  assert.ok(page.current.c.state.trees.some((t) => t.id === 'child'));
  assert.deepEqual(page.calls.find((c) => c.path.endsWith('/branches')).body, {
    messageId: 'reply',
    start: 0,
    end: 12,
    text: 'Thin threads',
    question: 'Why threads?',
  });
  assert.equal(page.calls.filter((c) => c.path.endsWith('/prepare')).length, 1);
  assert.ok(page.calls.some((c) => c.path.endsWith('/unprepare')));
  await page.act(async () => {
    controller.close();
    await submitted;
  });
});

test('deleting the open learning tree discards pending layout and opens the next saved conversation', async (t) => {
  const page = await mount(t, ({ path }, { state, data }) => {
    if (path === '/api/trees/a/delete') {
      state.trees = state.trees.filter((t) => t.id !== 'a');
      data.delete('a');
      return json({ deleted: ['a'], parent: null });
    }
  });
  await page.act(async () => {
    page.current.layout.savePositions({ a: { x: 1, y: 2 } });
    page.current.c.setDrafts({ a: 'Delete me', b: 'Keep me' });
    page.current.actions.askDelete('a', null);
  });
  await page.act(async () => page.current.actions.deleteConversation());
  assert.equal(page.current.c.tree.id, 'b');
  assert.equal(page.current.c.root, 'b');
  assert.equal(page.current.c.focusComposer.current, true);
  assert.equal(page.current.layout.saver.current.pending().has('a'), false);
  assert.deepEqual(page.current.c.drafts, { b: 'Keep me' });
  assert.deepEqual(
    page.current.c.state.trees.map((t) => t.id),
    ['b'],
  );
  assert.equal(page.current.actions.deletion, undefined);
});
