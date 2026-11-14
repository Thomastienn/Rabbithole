import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';

const task = {
  title: 'Winners advance',
  description: 'Two winners meet in the final.',
  intent: 'Show two winners combining.',
  excerpt: 'A and B advance.',
};
const complete = (emit, text) => {
  emit({ type: 'item', item: 'answer', text });
  emit({ type: 'status', status: 'completed' });
};
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(4096, 1),
]);

// Tag-style requests, as sent live by an opencode model, become artifacts exactly like the fenced form.
test('tag-style visual, diagram and video blocks become artifacts; broken JSON shows the unreadable-request card', async () => {
  let reply;
  const provider = {
    models: async () => [{ model: 'm', isDefault: true }],
    generate: async (tree, text, emit) => {
      if (tree.id) {
        for (const ch of reply) emit({ type: 'delta', item: 'answer', text: ch });
        return complete(emit, reply);
      }
      complete(
        emit,
        tree.instructions?.includes('Remotion')
          ? '// Description: d\nexport default () => null;'
          : tree.instructions?.includes('Mermaid')
            ? 'flowchart TD\n  A --> B'
            : '<svg viewBox="0 0 10 10"></svg>',
      );
    },
  };
  const dir = mkdtempSync(join(tmpdir(), 'tt-tags-')),
    store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({
    store,
    diagramParse: async () => true,
    provider,
    auth: { status: () => ({ connected: true }) },
    dir,
    videoNarrate: fakeNarration,
    videoRender: async (w, out) => {
      writeFileSync(out, mp4);
      return { durationInFrames: 60, fps: 30 };
    },
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(origin + '/api/state')).json();
  const send = async (value, question = 'Explain winners.') => {
    reply = 'Before. ' + value + ' After.';
    const tree = store.create('Tags');
    const stream = await (
      await fetch(`${origin}/api/trees/${tree.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify({ text: question }),
      })
    ).text();
    const saved = store.tree(tree.id);
    assert.doesNotMatch(stream, /treetutor-|intent/);
    assert.equal(saved.messages.at(-1).text, 'Before.  After.');
    assert.equal(saved.artifacts.length, 1);
    assert.equal(saved.artifacts[0].position, 'Before. '.length);
    return saved.artifacts[0];
  };
  try {
    for (const [value, kind] of [
      ['<treetutor-visual>' + JSON.stringify(task) + '</treetutor-visual>', 'visual'],
      ['< "treetutor-diagram" >\n' + JSON.stringify(task) + '\n</treetutor-diagram>', 'mermaid'],
    ]) {
      const artifact = await send(value);
      assert.deepEqual(
        [artifact.kind, artifact.title, artifact.error ?? null],
        [kind, task.title, null],
      );
    }
    const video = await send(
      '<treetutor-video">' + JSON.stringify(task) + '</treetutor-video>',
      'Make a video of winners advancing.',
    );
    assert.deepEqual([video.kind, video.title, video.error ?? null], ['video', task.title, null]);
    const broken = await send('<treetutor-visual>{broken json}</treetutor-visual>');
    assert.equal(broken.status, 'failed');
    assert.match(broken.error, /^Visual request could not be read: the request was not valid JSON/);
  } finally {
    await app.stop();
    store.close();
  }
});
