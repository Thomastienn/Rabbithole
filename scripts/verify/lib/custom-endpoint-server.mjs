// Fixture server for verify-custom-endpoint.mjs, forked with --serve <dir>: synthetic native providers plus the
// real OpenAI-compatible endpoint store. IPC: 'offline' fails model lists, 'stop' exits.
import { join } from 'node:path';
import { Store } from '../../../server/store.mjs';
import { OpenAI } from '../../../server/providers/openai.mjs';
import { createApp } from '../../../server/app.mjs';

process.umask(0o077);
if (process.argv[2] === '--serve') {
  const dir = process.argv[3],
    store = new Store(join(dir, 'trees.sqlite')),
    endpoint = new OpenAI(dir);
  let offline = false;
  const native = (model, label) => ({
    models: async () => {
      if (offline) throw new Error('Fixture offline');
      return [{ model, label, isDefault: true }];
    },
    generate: async (tree, _text, emit, save) => {
      save(tree.thread ?? `fixture-${tree.id}`, tree.model);
      emit({ type: 'item', item: 'a', text: 'Peterson fixture continuation.' });
      emit({ type: 'status', status: 'completed' });
    },
  });
  const app = createApp({
    store,
    dir,
    endpoint,
    providers: { claude: native('sonnet', 'Sonnet'), codex: native('codex-model', 'Codex model') },
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: true }) },
  });
  process.on('message', async (message) => {
    if (message === 'stop') {
      await app.stop();
      store.close();
      process.exit(0);
    }
    offline = message === 'offline';
    process.send({ ack: message });
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}`, pid: process.pid });
}
