import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

const call = (id, status, output = null) => ({
  id,
  name: 'read_page',
  input: { url: `https://example.com/${id}` },
  status,
  output,
  elapsed: status === 'running' ? 0 : 12,
});

test('tool calls are kept per reply in call order, updated in place, survive reopening and go with their conversation', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-toolcalls-')), 'trees.sqlite');
  let store = new Store(path);
  const id = store.create('Tools', 'openai', 'm').id;
  store.message(id, 'user', 'Read it', 'completed');
  const reply = store.message(id, 'assistant', '', 'streaming');
  store.toolCall(id, reply, { ...call('b', 'running'), input: {} });
  store.toolCall(id, reply, call('a', 'running'));
  store.toolCall(id, reply, call('b', 'done', 'Page text'));
  store.stopToolCalls(reply);
  store.close();

  store = new Store(path);
  const tools = store.tree(id).messages.at(-1).tools;
  assert.ok(tools[1].elapsed >= 0);
  assert.deepEqual(tools, [
    { ...call('b', 'done', 'Page text') },
    { ...call('a', 'failed', 'Stopped before it finished.'), elapsed: tools[1].elapsed },
  ]);
  assert.equal(store.tree(id).messages[0].tools, undefined);

  // Retry discards the reply and its calls; deleting the conversation deletes the rest.
  store.discardReply(id, reply);
  assert.deepEqual(store.toolCalls(reply), []);
  const next = store.message(id, 'assistant', 'Done', 'completed');
  store.toolCall(id, next, call('c', 'done', 'x'));
  store.remove(id, id, () => {});
  assert.equal(store.db.prepare('SELECT count(*) n FROM tool_calls').get().n, 0);
  store.close();
});

test('reopening after a crash ends running tools without resuming them', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-tool-crash-')), 'trees.sqlite');
  let store = new Store(path);
  const id = store.create('Crash', 'openai', 'm').id;
  const reply = store.message(id, 'assistant', 'Reading', 'streaming');
  store.toolCall(id, reply, call('a', 'running'));
  store.toolCall(id, reply, call('b', 'done', 'Saved page'));
  store.close();
  store = new Store(path);
  try {
    const message = store.tree(id).messages.at(-1);
    assert.equal(message.status, 'interrupted');
    assert.equal(message.tools[0].status, 'failed');
    assert.match(message.tools[0].output, /interrupted/i);
    assert.deepEqual(message.tools[1], call('b', 'done', 'Saved page'));
  } finally {
    store.close();
  }
});
