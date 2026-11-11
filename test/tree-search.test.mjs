import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('search matches saved tree titles and conversation text case-insensitively, one result per tree', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-search-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({ store, provider: { generate: async () => {} }, dir, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const search = async q => (await fetch(`http://127.0.0.1:${app.server.address().port}/api/search?q=${encodeURIComponent(q)}`)).json();
  try {
    const photo = store.create('Photosynthesis basics');
    store.message(photo.id, 'user', 'How do leaves make sugar?', 'completed');
    const reply = store.message(photo.id, 'assistant', 'Leaves use **chlorophyll** to capture light.', 'completed');
    const child = store.branch(store.tree(photo.id), { messageId: reply, start: 0, end: 6, text: 'Leaves', question: 'Why green?' }, 'ctx');
    store.message(child.id, 'assistant', 'Green light is reflected by the Thylakoid membranes.', 'completed');
    const rome = store.create('Roman roads');
    store.message(rome.id, 'user', 'Who built the roads?', 'completed');

    assert.deepEqual(await search('PHOTO'), [{ root: photo.id, conversation: null, snippet: null }], 'title match opens the tree');
    assert.deepEqual(await search('thylakoid'), [{ root: photo.id, conversation: child.id, snippet: '…een light is reflected by the Thylakoid membranes.' }], 'branch message match names its conversation');
    assert.deepEqual(await search('chlorophyll'), [{ root: photo.id, conversation: photo.id, snippet: 'Leaves use chlorophyll to capture light.' }], 'reply snippet is plain text');
    assert.deepEqual((await search('roads')).map(r => [r.root, r.conversation]), [[rome.id, null]], 'title wins over message match');
    assert.deepEqual((await search('o')).map(r => r.root), [rome.id, photo.id], 'newest tree first');
    assert.deepEqual(await search('   '), []);
    assert.deepEqual(await search('no such words'), []);
    store.remove(photo.id, photo.id, () => {});
    assert.deepEqual(await search('thylakoid'), [], 'deleted trees drop out');
  } finally { app.stop(); store.close(); }
});
