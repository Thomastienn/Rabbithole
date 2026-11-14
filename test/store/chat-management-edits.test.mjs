import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { Store } from '../../server/store.mjs';
import { fixture, snapshot } from '../support/chat-management-kit.mjs';

test('rename validates the bound, persists across restart, and manually named New chat never auto-retitles', async () => {
  const env = await fixture();
  try {
    const blank = env.store.create(undefined, 'codex');
    for (const title of ['', '  ', null, 10, 'x'.repeat(201)])
      assert.equal((await env.post(blank.id, 'rename', { title })).status, 400);
    assert.equal((await env.post('missing', 'rename', { title: 'Title' })).status, 404);
    assert.equal((await env.post(blank.id, 'rename', { title: '  New chat  ' })).status, 200);
    await (await env.post(blank.id, 'messages', { text: 'First question changes nothing' })).text();
    assert.equal(env.store.tree(blank.id).title, 'New chat');
    const title = 'T'.repeat(200);
    assert.equal((await env.post(env.child.id, 'rename', { title })).status, 200);
    env.close();
    const restarted = new Store(env.path);
    try {
      assert.equal(restarted.tree(blank.id).title, 'New chat');
      assert.equal(restarted.tree(blank.id).title_renamed, 1);
      assert.equal(restarted.tree(env.child.id).title, title);
    } finally {
      restarted.close();
    }
  } finally {
    if (env.app.server.listening) env.close();
  }
});

test('delete a branch cascades only its descendants, cleans files and layout, and leaves parent history and sibling anchors unchanged', async () => {
  const env = await fixture();
  try {
    const before = snapshot(env.store),
      parent = env.store.tree(env.root.id),
      sibling = env.store.tree(env.sibling.id),
      other = env.store.tree(env.other.id);
    const response = await env.post(env.root.id, 'delete', { conversation: env.child.id });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      deleted: [env.child.id, env.grandchild.id],
      parent: env.root.id,
    });
    assert.equal(env.store.tree(env.child.id), undefined);
    assert.equal(env.store.tree(env.grandchild.id), undefined);
    assert.deepEqual(env.store.tree(env.root.id), parent);
    assert.deepEqual(env.store.tree(env.sibling.id), sibling);
    assert.deepEqual(env.store.tree(env.other.id), other);
    assert.deepEqual(env.store.list().find((t) => t.id === env.root.id).layout, {
      folded: [env.sibling.id],
      selected: env.root.id,
      panel: 'beside',
      viewport: { x: 10, y: 20, zoom: 0.8 },
    });
    const deleted = new Set([env.child.id, env.grandchild.id]),
      after = snapshot(env.store);
    for (const [table, key] of [
      ['messages', 'tree'],
      ['branches', 'child'],
      ['artifacts', 'conversation'],
    ])
      assert.deepEqual(
        after[table],
        before[table].filter((row) => !deleted.has(row[key])),
      );
    for (const path of env.paths)
      assert.equal(
        existsSync(path),
        path.endsWith('.mp4') || !deleted.has(readFileOwner(path, before)),
        path,
      ); // library keeps ready media
    assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(
      (
        await env.post(env.root.id, 'layout', {
          folded: [],
          selected: env.child.id,
          panel: 'beside',
        })
      ).status,
      400,
      'stale selected IDs cannot be saved again',
    );
    assert.equal(
      (
        await env.post(env.root.id, 'layout', {
          folded: [env.child.id],
          selected: env.root.id,
          panel: 'beside',
        })
      ).status,
      400,
    );
  } finally {
    env.close();
  }
});

function readFileOwner(path, before) {
  // The fixture embeds artifact/attempt IDs in server-chosen paths, matching real storage ownership.
  return before.artifacts.find(
    (a) => a.kind === 'video' && (path.includes(a.id) || path.includes(a.attempt)),
  ).conversation;
}

test('delete a whole chat removes every owned row and private work file; another chat stays byte-identical', async () => {
  const env = await fixture();
  try {
    const other = env.store.tree(env.other.id),
      before = snapshot(env.store);
    const response = await env.post(env.root.id, 'delete', { conversation: env.root.id });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).deleted.length, 4);
    assert.deepEqual(
      env.store.list().map((t) => t.id),
      [env.other.id],
    );
    assert.deepEqual(env.store.tree(env.other.id), other);
    for (const path of env.paths)
      assert.equal(
        existsSync(path),
        path.endsWith('.mp4') || readFileOwner(path, before) === env.other.id,
        path,
      );
    for (const [table, key] of [
      ['messages', 'tree'],
      ['artifacts', 'conversation'],
    ])
      assert.ok(snapshot(env.store)[table].every((row) => row[key] === env.other.id));
    assert.equal(snapshot(env.store).branches.length, 0);
    assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    env.close();
  }
});

test('rename and delete enforce CSRF, origin, content type and root ownership with server-derived descendants', async () => {
  const env = await fixture();
  try {
    const before = snapshot(env.store);
    for (const action of ['rename', 'delete'])
      for (const headers of [
        { 'X-TreeTutor-CSRF': '' },
        { Origin: 'https://foreign.example' },
        { 'Sec-Fetch-Site': 'cross-site' },
        { 'Content-Type': 'text/plain' },
      ]) {
        assert.equal(
          (
            await env.post(
              env.root.id,
              action,
              { title: 'Wrong', conversation: env.root.id },
              headers,
            )
          ).status,
          403,
        );
      }
    for (const [root, conversation] of [
      [env.root.id, env.other.id],
      [env.other.id, env.child.id],
      [env.child.id, env.grandchild.id],
      [env.root.id, 'missing'],
    ])
      assert.equal((await env.post(root, 'delete', { conversation })).status, 404);
    assert.equal((await env.post(env.root.id, 'delete')).status, 404);
    assert.equal(
      (await env.post(env.root.id, 'delete', { conversation: env.child.id, count: 1 })).status,
      409,
    );
    assert.equal(
      (
        await env.post(env.root.id, 'delete', {
          conversation: env.child.id,
          title: 'Outdated title',
        })
      ).status,
      409,
    );
    assert.deepEqual(snapshot(env.store), before);
    assert.equal(
      (
        await env.post(env.root.id, 'delete', {
          conversation: env.child.id,
          descendants: [env.other.id],
        })
      ).status,
      200,
    );
    assert.ok(env.store.tree(env.other.id), 'client cannot expand the server-derived subtree');
  } finally {
    env.close();
  }
});
