// Fixture server for verify-diagram-rendering.mjs, forked with --serve <dir> <port>: synthetic tutor and a Mermaid
// worker held until the 'release' IPC message; 'stop' exits.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../../../server/store.mjs';
import { createApp } from '../../../server/app.mjs';

if (process.argv[2] === '--serve') {
  const dir = process.argv[3],
    store = new Store(join(dir, 'trees.sqlite'));
  let release;
  const provider = {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => {
      const worker = tree.instructions?.includes('one Mermaid diagram');
      appendFileSync(
        join(dir, 'calls.jsonl'),
        JSON.stringify({ kind: worker ? 'worker' : tree.id ? 'tutor' : 'compaction' }) + '\n',
      );
      if (worker)
        await new Promise((resolve) => {
          release = resolve;
        });
      const task = {
        title: 'Streaming rounds',
        description: 'A winner advances from the round to the final.',
        intent: 'Show two rounds.',
        excerpt: 'Winners advance.',
      };
      const output = worker
        ? 'flowchart LR\n A[Round] --> B[Final]'
        : text === 'Diagram please'
          ? 'Winners advance.\n```treetutor-diagram\n' + JSON.stringify(task) + '\n```'
          : 'Fixture follow-up.';
      emit({ type: 'item', item: 'answer', text: output });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  process.on('message', (message) => {
    if (message === 'release') release?.();
    if (message === 'stop') {
      app.stop();
      store.close();
      process.exit(0);
    }
  });
  await new Promise((resolve) => app.server.listen(Number(process.argv[4]), '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}`, pid: process.pid });
}
