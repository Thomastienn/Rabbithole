import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

test('search matches learning-tree titles only, case-insensitively, newest first', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-search-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({ store, provider: { generate: async () => { throw new Error('search must not call a model'); } }, dir, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const search = async q => (await fetch(`http://127.0.0.1:${app.server.address().port}/api/search?q=${encodeURIComponent(q)}`)).json();
  try {
    const photo = store.create('Photosynthesis basics');
    store.message(photo.id, 'user', 'How do leaves make sugar?', 'completed');
    const reply = store.message(photo.id, 'assistant', 'Leaves use **chlorophyll** to capture light.', 'completed');
    const child = store.branch(store.tree(photo.id), { messageId: reply, start: 0, end: 6, text: 'Leaves', question: 'Why green?' }, 'ctx');
    store.message(child.id, 'assistant', 'Green light is reflected by the Thylakoid membranes.', 'completed');
    store.rename(child.id, 'Chlorophyll colour');
    const rome = store.create('Roman roads');
    store.message(rome.id, 'user', 'Who built the roads?', 'completed');

    assert.deepEqual(await search('PHOTO'), [{ root: photo.id, title: 'Photosynthesis basics' }], 'title match, any case');
    assert.deepEqual(await search('thylakoid'), [], 'branch message-only match no longer appears');
    assert.deepEqual(await search('sugar'), [], 'question message-only match no longer appears');
    assert.deepEqual(await search('colour'), [], 'branch titles are not separate learning trees');
    assert.deepEqual((await search('roads')).map(r => r.root), [rome.id]);
    assert.deepEqual((await search('o')).map(r => r.root), [rome.id, photo.id], 'newest tree first');
    assert.deepEqual(await search('   '), []);
    assert.deepEqual(await search('no such words'), []);
    store.remove(photo.id, photo.id, () => {});
    assert.deepEqual(await search('photo'), [], 'deleted trees drop out');
  } finally { app.stop(); store.close(); }
});
