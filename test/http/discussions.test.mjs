import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.mjs';
import { open } from '../support/diagram-kit.mjs';
import { discussion, publicDiscussion, discussionBlock } from '../fixtures/discussion.mjs';

test('a streamed discussion opens in place, persists its hidden levels and exposes only names and lines', async (t) => {
  let env, id;
  let raw = 'Before.' + discussionBlock() + '\nAfter.';
  const calls = [];
  const provider = {
    generate: async (tree, question, emit) => {
      calls.push({ tree, question });
      for (const character of raw) {
        emit({ type: 'delta', item: 'answer', text: character });
        assert.doesNotMatch(
          env.store.tree(id).messages.at(-1).text,
          /rabbithole|classmates|speaker|Theo/,
        );
      }
      emit({ type: 'status', status: 'completed' });
    },
  };
  env = await open(provider);
  t.after(env.close);
  id = (await (await env.post('/api/trees')).json()).id;
  const response = await env.post(`/api/trees/${id}/messages`, {
    text: 'Discuss this with classmates.',
  });
  assert.equal(response.status, 200);
  const events = (await response.text())
    .split('\n\n')
    .filter((s) => s.startsWith('data: '))
    .map((s) => JSON.parse(s.slice(6)));
  const artifacts = events.filter((e) => e.type === 'artifact').map((e) => e.artifact);
  assert.ok(artifacts.some((a) => a.status === 'pending'));
  const ready = artifacts.at(-1);
  assert.equal(ready.kind, 'discussion');
  assert.equal(ready.status, 'ready');
  assert.equal(ready.position, 7);
  assert.deepEqual(ready.discussion, publicDiscussion);
  assert.equal(ready.classmates, 3);
  assert.doesNotMatch(JSON.stringify(artifacts), /"level"|below|above/);
  assert.deepEqual(JSON.parse(env.store.tree(id).artifacts[0].source), discussion);
  const saved = await (await env.get(`/api/trees/${id}`)).json();
  assert.equal(saved.messages.at(-1).text, 'Before.\nAfter.');
  assert.deepEqual(saved.artifacts, [ready]);
  const previews = await (await env.get(`/api/previews?id=${id}`)).json();
  assert.deepEqual(previews[id].at(-1).artifacts, [
    {
      id: ready.id,
      kind: 'discussion',
      title: 'Discussion',
      status: 'ready',
      classmates: 3,
    },
  ]);
  assert.doesNotMatch(JSON.stringify(previews), /Theo|speaker|level/);
  assert.equal(calls.length, 1, 'the chat model writes the discussion with no worker call');
  const reopened = new Store(env.path);
  assert.deepEqual(JSON.parse(reopened.tree(id).artifacts[0].source), discussion);
  reopened.close();

  raw = 'Ordinary answer.';
  await (await env.post(`/api/trees/${id}/messages`, { text: 'Explain the trade.' })).text();
  assert.equal(env.store.tree(id).artifacts.length, 1, 'ordinary answers add no discussion');
});

test('malformed and cut-off discussion openings become unavailable at their original position', async (t) => {
  let raw;
  const env = await open({
    generate: async (_, __, emit) => {
      emit({ type: 'item', item: 'answer', text: raw });
      emit({ type: 'status', status: 'completed' });
    },
  });
  t.after(env.close);
  const { id } = await (await env.post('/api/trees')).json();
  for (raw of [
    'Before.\n```rabbithole-discussion\n{}\n```\nAfter.',
    'Before.\n```rabbithole-discussion\n{"classmates":',
  ]) {
    const wire = await (
      await env.post(`/api/trees/${id}/messages`, { text: 'Start a discussion.' })
    ).text();
    assert.doesNotMatch(wire, /rabbithole-discussion/);
    const saved = await (await env.get(`/api/trees/${id}`)).json();
    const artifact = saved.artifacts.at(-1);
    assert.equal(artifact.kind, 'discussion');
    assert.equal(artifact.status, 'failed');
    assert.equal(artifact.position, 7);
    assert.match(artifact.error, /Discussion request could not be read/);
    assert.doesNotMatch(saved.messages.at(-1).text, /classmates|rabbithole/);
  }
});

test('a provider failure finishes a pending discussion and retry replaces it without judging simulated speakers', async (t) => {
  let fail = true;
  const env = await open({
    generate: async (_, __, emit) => {
      emit({
        type: 'item',
        item: 'answer',
        text: 'Before.' + (fail ? discussionBlock().slice(0, -4) : discussionBlock()),
      });
      if (fail) throw new Error('Fixture provider failure');
      emit({ type: 'status', status: 'completed' });
    },
  });
  t.after(env.close);
  const { id } = await (await env.post('/api/trees')).json();
  await (await env.post(`/api/trees/${id}/messages`, { text: 'Start a discussion.' })).text();
  const failed = env.store.tree(id);
  assert.equal(failed.messages.at(-1).status, 'failed');
  assert.equal(failed.artifacts[0].status, 'failed');
  assert.equal(failed.artifacts[0].position, 7);
  fail = false;
  const retry = await env.post(`/api/trees/${id}/retry`);
  assert.equal(retry.status, 200);
  await retry.text();
  const saved = env.store.tree(id);
  assert.equal(saved.messages[0].id, failed.messages[0].id);
  assert.equal(saved.artifacts.length, 1);
  assert.equal(saved.artifacts[0].status, 'ready');
  assert.notEqual(saved.artifacts[0].id, failed.artifacts[0].id);
  assert.deepEqual(
    env.store.graph().concepts,
    [],
    'classmate and Tutor lines create no familiarity evidence',
  );
});
