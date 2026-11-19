import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';
import { until } from '../support/events.mjs';

const SVG =
  '<svg viewBox="0 0 10 10" role="img" aria-label="Dot"><circle cx="5" cy="5" r="2"/></svg>';
const call = {
  title: 'Halving',
  shows: 'A list cut in half',
  alt: 'A list split at its midpoint.',
  after: 'Cut.',
};

test('a custom endpoint gets "queued" for show_visual and its repeated continuation shows once', async (t) => {
  const fake = await fakeOpenAI(t);
  fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
  const dir = mkdtempSync(join(tmpdir(), 'tt-show-visual-')),
    store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({
    store,
    dir,
    endpoint: new OpenAI(dir),
    providers: {},
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: false }) },
    log: () => {},
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const endpoint = (
    await (
      await post('/api/settings/endpoints', {
        name: 'Local',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-test',
      })
    ).json()
  ).at(-1).id;

  let writerStarted = false;
  fake.reply = async (req, res, body) => {
    if (body.messages[0].content.startsWith('You create one self-contained visual')) {
      writerStarted = true;
      return streamReply(res, [SVG]);
    }
    const results = body.messages.filter((m) => m.role === 'tool');
    if (!results.length)
      return streamToolCalls(res, [{ name: 'show_visual', input: { ...call, alt: '' } }], 'Cut.');
    if (results.length === 1) return streamToolCalls(res, [{ name: 'show_visual', input: call }]);
    // The visual is placed and its writer called before the reply ends; the continuation repeats the shown text first.
    assert.equal(store.tree(id).artifacts.length, 1);
    await until(() => writerStarted);
    return streamReply(res, ['Cut', '. Then', ' search one half.']);
  };
  const id = store.create('Visuals', endpoint, 'tooled').id;
  const response = await post(`/api/trees/${id}/messages`, { text: 'Show binary search.' });
  const events = (await response.text())
    .split('\n\n')
    .filter((f) => f.startsWith('data: '))
    .map((f) => JSON.parse(f.slice(6)));
  assert.deepEqual(events.at(-1), { type: 'done', status: 'completed' });
  assert.ok(!events.some((e) => e.type === 'tool'));

  // The visual writer also carries a tool (load_skill); count only the tutor's calls.
  const chats = fake.calls.filter(
    (c) =>
      c.path === '/v1/chat/completions' &&
      c.body.tools?.some((tool) => tool.function.name === 'show_visual'),
  );
  assert.equal(chats.length, 3);
  assert.match(chats[1].body.messages.at(-1).content, /^Error: show_visual needs alt/);
  assert.deepEqual(chats[2].body.messages.at(-1), {
    role: 'tool',
    tool_call_id: 'call-0',
    content: 'queued',
  });

  await until(() => store.tree(id).artifacts[0]?.status === 'ready');
  const saved = store.tree(id);
  assert.equal(saved.messages.at(-1).text, 'Cut.\n\nThen search one half.');
  assert.equal(saved.artifacts.length, 1);
  assert.equal(saved.artifacts[0].position, 'Cut.'.length);
});

test('a custom endpoint that writes the whole reply and then calls show_visual places each visual at its passage', async (t) => {
  const fake = await fakeOpenAI(t);
  fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
  const dir = mkdtempSync(join(tmpdir(), 'tt-show-visual-after-')),
    store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({
    store,
    dir,
    endpoint: new OpenAI(dir),
    providers: {},
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: false }) },
    log: () => {},
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const endpoint = (
    await (
      await post('/api/settings/endpoints', {
        name: 'Local',
        baseUrl: fake.baseUrl,
        apiKey: 'sk-test',
      })
    ).json()
  ).at(-1).id;
  const reply = 'Halve the list. Compare the middle. Search one half.';
  fake.reply = async (req, res, body) => {
    if (body.messages[0].content.startsWith('You create one self-contained visual'))
      return streamReply(res, [SVG]);
    if (body.messages.some((m) => m.role === 'tool')) return streamReply(res, []);
    return streamToolCalls(
      res,
      [
        { name: 'show_visual', input: { ...call, after: 'Halve the list.', side: 'right' } },
        { name: 'show_visual', input: { ...call, after: 'compare  THE middle.' } },
        { name: 'show_visual', input: { ...call, after: 'Split the array.' } },
      ],
      reply,
    );
  };
  const id = store.create('Visuals', endpoint, 'tooled').id;
  await (await post(`/api/trees/${id}/messages`, { text: 'Show binary search.' })).text();
  const saved = store.tree(id);
  assert.equal(saved.messages.at(-1).text, reply);
  assert.deepEqual(
    saved.artifacts.map((a) => a.position),
    [' Compare', ' Search', null].map((s) => (s ? reply.indexOf(s) : reply.length)),
  );
  // Reopening reads the stored side; a visual without side sits in the flow.
  assert.deepEqual(
    saved.artifacts.map((a) => a.side),
    ['right', null, null],
  );
});
