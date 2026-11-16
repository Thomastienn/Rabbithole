import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { compacted } from '../support/branch-first.mjs';

const passage =
  'Visual: Tournament rounds\nTwo winners advance to the final.\nPart: Final\nThe winners of the two semifinals meet here.';
const part = { label: 'Final', explanation: 'The winners of the two semifinals meet here.' };
async function open(path = join(mkdtempSync(join(tmpdir(), 'tt-visual-branch-')), 'trees.sqlite')) {
  const store = new Store(path),
    calls = [];
  const app = createApp({
    store,
    auth: { status: () => ({ connected: true }) },
    provider: {
      models: async () => [{ model: 'chat', isDefault: true, efforts: ['low'] }],
      generate: async (tree, text, emit) => {
        calls.push({ tree, text });
        emit({
          type: 'item',
          item: 'answer',
          text: tree.instructions
            ? 'The learner is studying tournament rounds.'
            : 'The final decides the winner.',
        });
        emit({ type: 'status', status: 'completed' });
      },
    },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(origin + '/api/state')).json();
  const get = async (path) => (await fetch(origin + path)).json();
  const post = (path, body) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  return {
    store,
    app,
    calls,
    app,
    path,
    origin,
    get,
    post,
    close: async () => {
      await app.stop();
      store.close();
    },
  };
}

test('visual branches freeze the visual and part passage, inherit compact context, and survive reopen without offsets or source input', async () => {
  let env = await open();
  try {
    const parent = env.store.create('Rounds', 'codex', 'chat', 'low');
    env.store.thread(parent.id, 'private-parent-session', 'chat');
    env.store.message(parent.id, 'user', 'Explain tournament rounds.', 'completed');
    const messageId = env.store.message(
      parent.id,
      'assistant',
      'Read this explanation.',
      'completed',
    );
    const visual = env.store.pendingArtifact(
      parent.id,
      messageId,
      'Tournament rounds',
      'Two winners advance to the final.',
      'visual',
      null,
      5,
    );
    env.store.finishArtifact(parent.id, visual.id, '<p>PRIVATE VISUAL SOURCE</p>');
    const before = await env.get(`/api/trees/${parent.id}`);
    const response = await env.post(`/api/trees/${parent.id}/branches`, {
      messageId,
      artifactId: visual.id,
      ...part,
      text: 'Untrusted replacement title and description',
      question: 'Why do they meet?',
    });
    assert.equal(response.status, 201);
    const child = await compacted(env.app, env.origin, (await response.json()).id);
    assert.deepEqual(child.branch, {
      parent: parent.id,
      messageId,
      artifactId: visual.id,
      ...part,
      start: null,
      end: null,
      text: passage,
      question: 'Why do they meet?',
      snapshot: 'The learner is studying tournament rounds.',
    });
    assert.equal(child.thread, null);
    assert.equal(child.model, 'chat');
    assert.equal(child.effort, 'low');
    const compact = env.calls[0];
    assert.equal(compact.tree.thread, null);
    assert.equal(JSON.parse(compact.text.slice(compact.text.indexOf('\n') + 1)).passage, passage);
    assert.doesNotMatch(
      JSON.stringify(compact),
      /PRIVATE VISUAL SOURCE|Why do they meet\?|Untrusted replacement/,
    );
    await (await env.post(`/api/trees/${child.id}/messages`, { text: 'Why do they meet?' })).text();
    const tutor = env.calls.at(-1);
    assert.equal(tutor.tree.branch.text, passage);
    assert.equal(tutor.tree.branch.snapshot, 'The learner is studying tournament rounds.');
    assert.equal(tutor.text, 'Why do they meet?');
    assert.doesNotMatch(
      JSON.stringify(tutor),
      /PRIVATE VISUAL SOURCE|private-parent-session|Untrusted replacement/,
    );
    assert.deepEqual(
      await env.get(`/api/trees/${parent.id}`),
      before,
      'child discussion never changes the parent',
    );
    const summary = (await env.get('/api/state')).trees.find((t) => t.id === child.id);
    assert.equal(summary.artifactId, visual.id);
    assert.equal(summary.label, part.label);
    assert.equal(summary.explanation, part.explanation);
    assert.equal(summary.start, null);
    assert.equal(summary.end, null);
    assert.equal(summary.passage, passage);
    const path = env.path;
    await env.close();
    env = await open(path);
    assert.equal((await env.get(`/api/trees/${child.id}`)).branch.text, passage);
    assert.equal(
      (await env.get('/api/state')).trees.find((t) => t.id === child.id).artifactId,
      visual.id,
    );
    assert.equal(env.calls.length, 0, 'reopening starts no inference');
  } finally {
    await env.close();
  }
});

test('visual branch API rejects invalid parts, foreign or unfinished visuals and forged text offsets before inference', async () => {
  const env = await open();
  try {
    const root = env.store.create('Root', 'codex'),
      other = env.store.create('Other', 'codex');
    const messageId = env.store.message(root.id, 'assistant', 'Original answer', 'completed');
    const user = env.store.message(root.id, 'user', 'A question', 'completed');
    const unfinished = env.store.message(root.id, 'assistant', 'Partial answer', 'interrupted');
    const foreign = env.store.message(other.id, 'assistant', 'Foreign answer', 'completed');
    const visual = (conversation, message, kind = 'visual', status = 'ready') => {
      const a = env.store.pendingArtifact(
        conversation,
        message,
        'Tournament rounds',
        'Two winners advance to the final.',
        kind,
      );
      if (status === 'ready') env.store.finishArtifact(conversation, a.id, '<p>Source</p>');
      if (status === 'failed')
        env.store.finishArtifact(conversation, a.id, null, 'Synthetic failure');
      return a.id;
    };
    const artifactId = visual(root.id, messageId);
    const body = { messageId, artifactId, ...part, question: 'Why?' };
    const invalid = [
      { label: '' },
      { label: ' ' },
      { label: 1 },
      { label: 'x'.repeat(121) },
      { label: 'Two\nlines' },
      { explanation: '' },
      { explanation: null },
      { explanation: {} },
      { explanation: 'x'.repeat(281) },
      { explanation: 'Two\nlines' },
      { artifactId: 'missing' },
      { artifactId: null },
      { artifactId: visual(other.id, foreign), messageId: foreign },
      { messageId: user },
      { artifactId: visual(root.id, unfinished), messageId: unfinished },
      { artifactId: visual(root.id, messageId, 'mermaid') },
      { artifactId: visual(root.id, messageId, 'visual', 'pending') },
      { artifactId: visual(root.id, messageId, 'visual', 'failed') },
      { start: 0, end: 3 },
      { start: null, end: null },
      { suggestion: true },
      { question: ' ' },
    ];
    for (const change of invalid)
      assert.equal(
        (await env.post(`/api/trees/${root.id}/branches`, { ...body, ...change })).status,
        400,
        JSON.stringify(change),
      );
    const noCsrf = await fetch(`${env.origin}/api/trees/${root.id}/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(noCsrf.status, 403);
    assert.equal((await env.get('/api/state')).trees.length, 2);
    assert.equal(env.calls.length, 0);
    const boundary = await env.post(`/api/trees/${root.id}/branches`, {
      ...body,
      label: '🌲'.repeat(60),
      explanation: 'x'.repeat(280),
    });
    assert.equal(boundary.status, 201, 'bounded UTF-16 strings work at the exact limits');
    const child = await boundary.json();
    assert.equal(child.branch.label.length, 120);
    assert.equal(child.branch.explanation.length, 280);
    const deleted = await env.post(`/api/trees/${root.id}/delete`, { conversation: child.id });
    assert.equal(deleted.status, 200);
    assert.equal(
      (await env.get('/api/state')).trees.some((t) => t.artifactId === artifactId),
      false,
      'deleted children no longer mark the part explored',
    );
    assert.equal(
      (await env.get(`/api/trees/${root.id}`)).artifacts.find((a) => a.id === artifactId).status,
      'ready',
    );
  } finally {
    await env.close();
  }
});

test('current databases migrate saved text branches without loss and accept visual branches with null offsets', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-visual-branch-migration-')), 'trees.sqlite');
  const seed = new Store(path),
    parent = seed.create('Old parent', 'codex'),
    messageId = seed.message(parent.id, 'assistant', 'Original answer', 'completed');
  const existing = seed.branch(
    parent,
    { messageId, start: 0, end: 8, text: 'Original', question: 'Old question' },
    'Old fixed context',
  );
  seed.close();
  // Fixture represents the immediately preceding schema, whose start/end columns were mandatory.
  const old = new DatabaseSync(path);
  old.exec(`ALTER TABLE branches RENAME TO current_branches;
    CREATE TABLE branches (child TEXT PRIMARY KEY REFERENCES trees(id), parent TEXT NOT NULL REFERENCES trees(id), messageId TEXT NOT NULL REFERENCES messages(id), start INTEGER NOT NULL, end INTEGER NOT NULL, text TEXT NOT NULL, question TEXT NOT NULL, snapshot TEXT NOT NULL);
    INSERT INTO branches SELECT child,parent,messageId,start,end,text,question,snapshot FROM current_branches;
    DROP TABLE current_branches;`);
  old.close();
  const env = await open(path);
  try {
    assert.deepEqual((await env.get(`/api/trees/${existing.id}`)).branch, existing.branch);
    const a = env.store.pendingArtifact(
      parent.id,
      messageId,
      'Tournament rounds',
      'Two winners advance to the final.',
      'visual',
    );
    env.store.finishArtifact(parent.id, a.id, '<p>Visual</p>');
    const response = await env.post(`/api/trees/${parent.id}/branches`, {
      messageId,
      artifactId: a.id,
      ...part,
      question: 'New question',
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).branch.start, null);
    assert.deepEqual((await env.get(`/api/trees/${existing.id}`)).branch, existing.branch);
  } finally {
    await env.close();
  }
});
