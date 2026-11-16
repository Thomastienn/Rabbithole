import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import { Auth } from '../../server/providers/auth.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// Explicit live check: existing app-owned consent; synthetic branches and isolated data.
// Stop the app first: this lock protects its rotating OAuth refresh token.
process.umask(0o077);
const authDir =
  process.env.RABBITHOLE_DATA_DIR ??
  join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'rabbithole');
const release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
const dir = mkdtempSync(join(tmpdir(), 'rabbithole-live-streaming-'));
const store = new Store(join(dir, 'trees.sqlite'));
const auth = new Auth(authDir);
const provider = new Codex(auth, dir);
const app = createApp({ store, auth, provider });
const active = new Set();
let peak = 0;
provider.listeners.add((message) => {
  if (message.method === 'turn/started') active.add(message.params.threadId);
  if (message.method === 'turn/completed') active.delete(message.params.threadId);
  peak = Math.max(peak, active.size);
});
try {
  assert.ok(auth.status().connected, 'App-owned authentication unavailable');
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const root = store.create('Synthetic concurrency root');
  const source = store.message(root.id, 'assistant', 'Fictional groves have trees.', 'completed');
  const anchor = { messageId: source, start: 0, end: 9, text: 'Fictional' };
  const a = store.branch(
    root,
    { ...anchor, question: 'Copper grove' },
    'Our fictional copper grove is named Aster-731 and contains exactly 47 trees.',
  );
  const b = store.branch(
    root,
    { ...anchor, question: 'Silver grove' },
    'Our fictional silver grove is named Beryl-962 and contains exactly 83 trees.',
  );
  const question =
    'Start with the fictional grove name, material, and exact tree count from inherited context. Then explain binary trees in about 350 words. Use only your own grove facts.';
  const report = await Promise.all(
    [a, b].map(async (tree) => {
      const started = performance.now();
      const response = await fetch(`${origin}/api/trees/${tree.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
        body: JSON.stringify({ text: question }),
        signal: AbortSignal.timeout(120000),
      });
      assert.equal(response.status, 200);
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        last = '',
        deltas = 0,
        status;
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (!frame.startsWith('data: ')) continue;
          const event = JSON.parse(frame.slice(6));
          assert.notEqual(event.type, 'error');
          if (event.type === 'text') {
            last = event.text;
            deltas++;
            const saved = await (await fetch(`${origin}/api/trees/${tree.id}`)).json();
            assert.ok(saved.messages[1].text.startsWith(last) || saved.messages[1].text === last);
          }
          if (event.type === 'done') status = event.status;
        }
        if (chunk.done) break;
      }
      assert.equal(status, 'completed');
      const saved = store.tree(tree.id);
      assert.equal(saved.messages.length, 2);
      assert.equal(saved.messages[0].text, question);
      assert.equal(saved.messages[1].text, last);
      const facts =
        tree.id === a.id
          ? ['Aster-731', 'copper', '47', 'Beryl-962']
          : ['Beryl-962', 'silver', '83', 'Aster-731'];
      for (const fact of facts.slice(0, 3))
        assert.ok(last.includes(fact), `Missing own fact ${fact}`);
      assert.ok(!last.includes(facts[3]), 'Foreign branch fact leaked');
      assert.ok(deltas > 0);
      return {
        branch: tree.title,
        model: saved.model,
        elapsedMs: Math.round(performance.now() - started),
        textEvents: deltas,
        characters: last.length,
        status,
      };
    }),
  );
  assert.ok(peak >= 2, 'Need actual overlapping provider turns');
  assert.notEqual(store.tree(a.id).thread, store.tree(b.id).thread);
  assert.equal(app.active.size, 0);
  console.log(
    JSON.stringify(
      {
        result: 'PASS',
        date: new Date().toISOString(),
        peakProviderTurns: peak,
        distinctThreads: true,
        report,
      },
      null,
      2,
    ),
  );
} finally {
  app.stop();
  store.close();
  await release();
}
