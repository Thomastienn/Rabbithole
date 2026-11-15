import { observe, observeStore, observeProvider } from './events.mjs';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { mediaPath } from '../../server/media/videos.mjs';

export const complete = async (tree, text, emit) => {
  emit({ type: 'item', item: 'a', text: 'Completed answer' });
  emit({ type: 'status', status: 'completed' });
};

export async function fixture(provider = { generate: complete }, options = {}) {
  observe(options, ['videoRender', 'videoNarrate']);
  provider = { models: async () => [{ model: 'fixture-model', isDefault: true }], ...provider };
  const dir = mkdtempSync(join(tmpdir(), 'tt-chat-management-')),
    path = join(dir, 'trees.sqlite');
  const store = observeStore(new Store(path));
  const app = createApp({
    store,
    provider: observeProvider(provider),
    dir,
    auth: { status: () => ({ connected: true }) },
    videoSnapshot: async () => {},
    ...options,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    state = await (await fetch(origin + '/api/state')).json();
  const post = (id, action, body = {}, headers = {}) =>
    fetch(`${origin}/api/trees/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': state.csrf, ...headers },
      body: JSON.stringify(body),
    });
  const reply = (id) => store.message(id, 'assistant', 'Roots exchange nutrients.', 'completed');
  const branch = (parent) => {
    const messageId = reply(parent.id);
    return store.branch(
      parent,
      { messageId, start: 0, end: 5, text: 'Roots', question: 'Branch question' },
      'Frozen context',
    );
  };
  const root = store.create('Main chat', 'codex'),
    child = branch(root),
    grandchild = branch(child),
    sibling = branch(root),
    other = store.create('Other chat', 'codex');
  for (const t of [root, child, grandchild, sibling, other]) {
    reply(t.id);
    store.position(t.id, 100, 200);
  }
  store.layout(root.id, {
    folded: [child.id, sibling.id],
    selected: grandchild.id,
    panel: 'beside',
    viewport: { x: 10, y: 20, zoom: 0.8 },
  });
  const paths = [];
  const file = (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    paths.push(path);
  };
  for (const t of [root, child, grandchild, sibling, other]) {
    const message = store.tree(t.id).messages.at(-1).id;
    const diagram = store.pendingArtifact(t.id, message, 'Diagram', 'Description');
    store.finishArtifact(t.id, diagram.id, 'flowchart LR\n A-->B');
    const video = store.pendingArtifact(t.id, message, 'Video', 'Description', 'video', '{}');
    store.finishVideo(t.id, video.id, video.attempt, { description: 'Ready video', duration: 1 });
    file(mediaPath(dir, video.id), `${t.id} media`);
    file(join(dir, 'video-work', video.id, video.attempt, 'Video.tsx'), `${t.id} source`);
    file(join(dir, 'video-work', video.id, 'old-attempt', 'Video.tsx'), `${t.id} old source`);
    file(join(dir, 'video-work', video.attempt, 'Video.tsx'), `${t.id} legacy source`);
  }
  return {
    dir,
    path,
    store,
    app,
    post,
    origin,
    root,
    child,
    grandchild,
    sibling,
    other,
    paths,
    close: () => {
      app.stop();
      store.close();
    },
  };
}

export const snapshot = (store) =>
  Object.fromEntries(
    ['trees', 'messages', 'branches', 'artifacts'].map((table) => [
      table,
      store.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
