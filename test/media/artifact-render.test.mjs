import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { artifactsAt, mergeArtifact, renderArtifact } from '../../src/media/artifacts.ts';
import { withTurn } from '../../src/chat/turn.ts';

test('HTTP/SSE artifacts drive client states, owned map metadata and exact anchors; restart never infers', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-render-')), 'trees.sqlite');
  let store = new Store(path),
    calls = 0,
    release;
  const workerReady = new Promise((resolve) => {
    release = resolve;
  });
  const source = 'flowchart TD\n A[Round] --> B[Final]';
  const text = 'repeat 😀 repeat 😀 end';
  const task = {
    title: 'Rounds',
    description: 'Round winners advance to the final.',
    intent: 'Show rounds.',
    excerpt: text,
  };
  const provider = {
    generate: async (tree, _, emit) => {
      calls++;
      if (!tree.id) await workerReady;
      emit({
        type: 'item',
        item: 'answer',
        text: tree.id ? text + '\n```treetutor-diagram\n' + JSON.stringify(task) + '\n```' : source,
      });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const root = store.create('Render fixture', 'codex'),
    other = store.create('Other', 'codex');
  let app, origin;
  async function start() {
    app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  try {
    const { csrf } = await (await fetch(origin + '/api/state')).json();
    const post = (url, body) =>
      fetch(origin + url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(body),
      });
    const response = await post(`/api/trees/${root.id}/messages`, { text: 'Explain rounds' });
    const scriptPolicy = response.headers
      .get('Content-Security-Policy')
      .split(';')
      .find((rule) => rule.trim().startsWith('script-src'));
    assert.equal(scriptPolicy.trim(), "script-src 'self'");
    let buffer = '',
      pending,
      ready,
      turn = {},
      renders = 0;
    for await (const chunk of response.body) {
      buffer += new TextDecoder().decode(chunk);
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (!frame.startsWith('data: ')) continue;
        const event = JSON.parse(frame.slice(6));
        if (event.type === 'saved') {
          turn.user = event.user;
          turn.reply = { id: event.id, role: 'assistant', text: '', status: 'streaming' };
        }
        if (event.type === 'text' || event.type === 'done')
          turn.reply = {
            ...turn.reply,
            text: event.text ?? turn.reply.text,
            status: event.status ?? turn.reply.status,
          };
        if (event.type !== 'artifact') continue;
        turn.artifacts = mergeArtifact(turn.artifacts ?? [], event.artifact, root.id, [turn.reply]);
        const state = withTurn({ ...root, messages: [], artifacts: [] }, turn);
        assert.equal(artifactsAt(state.artifacts, root.id, turn.reply.id).length, 1);
        const render = async (s) => {
          renders++;
          assert.equal(s, source);
          return 'data:image/svg+xml,fixture';
        };
        if (event.artifact.status === 'pending') {
          pending = event.artifact;
          assert.deepEqual(await renderArtifact(pending, render), { status: 'pending' });
          assert.equal(renders, 0);
          release();
        } else {
          ready = event.artifact;
          assert.deepEqual(await renderArtifact(ready, render), {
            status: 'ready',
            url: 'data:image/svg+xml,fixture',
          });
          assert.equal(
            state.artifacts.length,
            1,
            'final record replaces pending, without duplicates',
          );
        }
      }
    }
    assert.ok(pending && ready);
    assert.equal(renders, 1);
    assert.equal(calls, 2);
    const saved = await (await fetch(origin + `/api/trees/${root.id}`)).json();
    assert.deepEqual(saved.artifacts, [ready]);
    assert.equal(saved.messages.at(-1).text, text);
    assert.equal(artifactsAt(saved.artifacts, other.id, ready.message).length, 0);
    assert.equal(artifactsAt(saved.artifacts, root.id, saved.messages[0].id).length, 0);
    for (const bad of [
      { ...ready, conversation: other.id },
      { ...ready, message: saved.messages[0].id },
      { ...ready, message: 'missing' },
    ]) {
      assert.deepEqual(mergeArtifact([], bad, root.id, saved.messages), []);
    }
    assert.deepEqual(withTurn({ ...saved, id: other.id, artifacts: [] }, turn).artifacts, []);
    const previews = await (
      await fetch(origin + `/api/previews?id=${root.id}&id=${other.id}`)
    ).json();
    assert.deepEqual(previews[root.id].at(-1).artifacts, [
      { id: ready.id, kind: 'mermaid', title: task.title, status: 'ready' },
    ]);
    assert.doesNotMatch(JSON.stringify(previews), /flowchart|description|intent|excerpt/);
    assert.deepEqual(previews[other.id], []);
    const branch = await (
      await post(`/api/trees/${root.id}/branches`, {
        messageId: ready.message,
        start: 10,
        end: 19,
        text: 'repeat 😀',
        question: 'Why?',
      })
    ).json();
    assert.deepEqual(
      [branch.branch.messageId, branch.branch.start, branch.branch.end, branch.branch.text],
      [ready.message, 10, 19, 'repeat 😀'],
    );
    assert.deepEqual(branch.artifacts, []);
    assert.deepEqual(
      await renderArtifact(ready, async () => {
        throw new Error('Layout failed');
      }),
      { status: 'failed' },
    );
    for (const badSource of [
      'flowchart TD\n click A href "https://example.test"',
      'flowchart TD\n A["<script>alert(1)</script>"]',
      '%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\n A --> B',
      'flowchart TD\n A["&lt;b&gt;HTML&lt;/b&gt;"]',
      'flowchart TD\n A["🌲'.repeat(4100) + '"]',
      null,
    ]) {
      assert.deepEqual(
        await renderArtifact({ ...ready, source: badSource }, async () => {
          assert.fail('unsafe or missing source must not enter renderer');
        }),
        { status: 'failed' },
      );
    }
    assert.deepEqual(
      await renderArtifact(
        { ...pending, status: 'failed', error: 'Generation failed' },
        async () => {
          assert.fail('failed artifacts never render');
        },
      ),
      { status: 'failed' },
    );
    const callsBeforeRestart = calls;
    app.stop();
    store.close();
    store = new Store(path);
    await start();
    const reopened = await (await fetch(origin + `/api/trees/${root.id}`)).json();
    assert.deepEqual(reopened.artifacts, saved.artifacts);
    assert.deepEqual(reopened.messages, saved.messages);
    assert.equal(
      calls,
      callsBeforeRestart,
      'GET and SQLite/server restart must never call a provider',
    );
  } finally {
    release();
    app.stop();
    store.close();
  }
});
