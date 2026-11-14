import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';

test('previews list every message in order, bound each text and survive reload without copies', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'treetutor-preview-')), 'trees.sqlite');
  let store = new Store(path);
  const a = store.create('A'),
    b = store.create('B'),
    empty = store.create('Empty');
  const q1 = store.message(a.id, 'user', 'old', 'completed');
  const a1 = store.message(a.id, 'assistant', 'old answer', 'completed');
  const q2 = store.message(a.id, 'user', '🌳'.repeat(600), 'completed');
  assert.deepEqual(store.previews([a.id])[a.id], [
    { id: q1, role: 'user', text: 'old', status: 'completed' },
    { id: a1, role: 'assistant', text: 'old answer', status: 'completed' },
    { id: q2, role: 'user', text: '🌳'.repeat(512) + '…', status: 'completed' },
  ]);
  const reply = store.message(a.id, 'assistant', 'partial', 'streaming');
  store.message(b.id, 'user', 'short', 'completed');
  store.message(b.id, 'assistant', 'answer', 'failed');
  const both = store.previews([a.id, b.id, empty.id]);
  assert.deepEqual(
    both[b.id].map((m) => [m.role, m.text, m.status]),
    [
      ['user', 'short', 'completed'],
      ['assistant', 'answer', 'failed'],
    ],
  );
  assert.deepEqual(both[empty.id], []);
  assert.equal(both[a.id][3].status, 'streaming');
  store.update(reply, 'partial', 'interrupted');
  store.close();
  store = new Store(path);
  assert.deepEqual(
    store.previews([a.id])[a.id].map((m) => m.status),
    ['completed', 'completed', 'completed', 'interrupted'],
  );
  assert.equal(store.tree(a.id).messages[2].text.length, 1200);
  assert.deepEqual(
    store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name),
    [
      'active_profile',
      'artifacts',
      'branches',
      'chat_settings',
      'concept_aliases',
      'concept_links',
      'concept_topics',
      'concepts',
      'evidence',
      'messages',
      'profiles',
      'smart_settings',
      'suggestion_settings',
      'suggestions',
      'topics',
      'trees',
      'usage_events',
      'videos',
    ],
  );
  store.close();
});

test('reply previews strip syntax before truncation without changing raw questions or replies', () => {
  const store = new Store(
    join(mkdtempSync(join(tmpdir(), 'treetutor-markdown-preview-')), 'trees.sqlite'),
  );
  try {
    const tree = store.create('Markdown');
    const raw =
      '## Topic\n\n- **bold** item\n- `code` [link](https://example.com)\n\n' +
      '*'.repeat(600) +
      '\n\nend';
    store.message(tree.id, 'user', '**literal question**', 'completed');
    store.message(tree.id, 'assistant', raw, 'completed');
    const preview = store.previews([tree.id])[tree.id];
    assert.equal(preview[0].text, '**literal question**');
    assert.equal(preview[1].text, 'Topic bold item code link end');
    assert.equal(store.tree(tree.id).messages[1].text, raw);
  } finally {
    store.close();
  }
});
