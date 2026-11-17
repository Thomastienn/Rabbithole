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

test('an older database gains quote resources for video exhibits and keeps its citations', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const path = join(mkdtempSync(join(tmpdir(), 'tt-resources-')), 'trees.sqlite');
  let store = new Store(path);
  const tree = store.create('Root', 'openai', 'm');
  store.addResource(tree.id, page('a'));
  const reply = store.message(tree.id, 'assistant', '', 'streaming');
  store.update(reply, 'See [1](resource:1).', 'completed');
  assert.equal(store.resources(tree.id)[0].conversations.length, 1);
  store.close();
  // Rebuild the resources table with the check older builds created.
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=OFF;
    CREATE TABLE r_old (tree TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE, number INTEGER NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, site TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('page','image','file')), first_seen INTEGER NOT NULL, PRIMARY KEY(tree, number), UNIQUE(tree, url));
    INSERT INTO r_old SELECT * FROM resources; DROP TABLE resources; ALTER TABLE r_old RENAME TO resources;`);
  assert.match(
    db.prepare("SELECT sql FROM sqlite_master WHERE name='citations'").get().sql,
    /REFERENCES resources\(/,
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM citations').get().n, 1);
  db.close();
  store = new Store(path);
  try {
    assert.equal(
      store.addResource(tree.id, {
        url: 'https://q.example',
        title: 'Q',
        site: 'q.example',
        kind: 'quote',
      }),
      2,
    );
    assert.deepEqual(
      store.resources(tree.id).map((r) => [r.kind, r.conversations.length]),
      [
        ['page', 1],
        ['quote', 0],
      ],
    );
  } finally {
    store.close();
  }
});

test('streaming saves skip citations; a restart after a crash cites the cut-off reply', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-resources-')), 'trees.sqlite');
  let store = new Store(path);
  const root = store.create('Root', 'openai', 'm');
  store.message(root.id, 'user', 'Q', 'completed');
  const reply = store.message(root.id, 'assistant', '', 'streaming');
  store.addResource(root.id, page('a'));
  store.update(reply, 'See [1](resource:1)', 'streaming');
  assert.deepEqual(store.resources(root.id)[0].conversations, []);
  store.close();
  store = new Store(path);
  assert.equal(store.tree(root.id).messages[1].status, 'interrupted');
  assert.deepEqual(store.resources(root.id)[0].conversations, [root.id]);
  store.close();
});
