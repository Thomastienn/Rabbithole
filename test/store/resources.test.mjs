import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

const page = (n) => ({
  url: `https://example.com/${n}`,
  title: `Page ${n}`,
  site: 'example.com',
  kind: 'page',
});

test('resources are numbered per learning tree, shared by branches, cited by reply links and go with the tree', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-resources-')), 'trees.sqlite');
  let store = new Store(path);
  const root = store.create('Root', 'openai', 'm');
  const asked = store.message(root.id, 'user', 'Q', 'completed');
  const reply = store.message(root.id, 'assistant', '', 'streaming');
  const child = store.branch(
    root,
    { messageId: asked, start: 0, end: 1, text: 'Q', question: 'Why?' },
    'Snapshot',
  );
  const other = store.create('Other', 'openai', 'm');

  assert.equal(store.addResource(root.id, page('a')), 1);
  assert.equal(store.addResource(child.id, page('b')), 2);
  assert.equal(store.addResource(child.id, { ...page('a'), title: 'Changed' }), 1);
  assert.equal(store.addResource(other.id, page('b')), 1);

  // Only link syntax cites; prose like a[2] and unknown numbers are not citations.
  store.update(reply, 'See [1](resource:1), a[2] and [9](resource:9).', 'completed');
  const childReply = store.message(
    child.id,
    'assistant',
    'Both [1](resource:1) [2](resource:2)',
    'completed',
  );
  store.update(childReply, 'Both [1](resource:1) [2](resource:2)', 'completed');
  store.close();

  store = new Store(path);
  const listed = store.tree(child.id).resources;
  assert.ok(listed[0].firstSeen > 0);
  assert.deepEqual(
    listed.map(({ firstSeen, ...r }) => r),
    [
      { number: 1, ...page('a'), conversations: [root.id, child.id] },
      { number: 2, ...page('b'), conversations: [child.id] },
    ],
  );
  assert.deepEqual(store.tree(root.id).resources, listed);
  assert.deepEqual(
    store.resources(other.id).map((r) => r.number),
    [1],
  );

  // Rewriting a reply replaces its citations; deleting the branch drops its citations.
  store.update(reply, 'No links now.', 'completed');
  assert.deepEqual(store.resources(root.id)[0].conversations, [child.id]);
  store.remove(root.id, child.id, () => {});
  assert.deepEqual(
    store.resources(root.id).map((r) => r.conversations),
    [[], []],
  );
  store.remove(root.id, root.id, () => {});
  assert.equal(store.db.prepare('SELECT count(*) n FROM resources').get().n, 1);
  store.close();
});
