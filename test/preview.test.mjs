import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';

test('previews follow the latest question, bound content and survive reload without copies', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-preview-')), 'trees.sqlite');
  let store = new Store(path);
  const a = store.create('A'), b = store.create('B');
  store.message(a.id, 'user', 'old', 'completed');
  store.message(a.id, 'assistant', 'old answer', 'completed');
  store.message(a.id, 'user', 'Q'.repeat(600), 'completed');
  assert.deepEqual(store.previews([a.id])[a.id], { question: 'Q'.repeat(512) + '…', answer: null, status: null });
  const reply = store.message(a.id, 'assistant', 'partial', 'streaming');
  store.message(b.id, 'user', 'short', 'completed');
  store.message(b.id, 'assistant', 'answer', 'failed');
  assert.deepEqual(store.previews([a.id, b.id])[b.id], { question: 'short', answer: 'answer', status: 'failed' });
  assert.equal(store.previews([a.id])[a.id].status, 'streaming');
  store.update(reply, 'partial', 'interrupted');
  store.close();
  store = new Store(path);
  assert.deepEqual(store.previews([a.id])[a.id], { question: 'Q'.repeat(512) + '…', answer: 'partial', status: 'interrupted' });
  assert.equal(store.tree(a.id).messages[2].text.length, 600);
  assert.deepEqual(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name), ['branches', 'messages', 'trees']);
  store.close();
});
