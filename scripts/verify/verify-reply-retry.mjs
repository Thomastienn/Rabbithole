// Built-app browser fixture (in-process fake provider, not a live model) for reply Retry.
// Covers: Retry on a failed latest reply, none after a learner Stop, keyboard activation, in-place replacement, both appearances.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
  session = `reply-retry-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'reply-retry-')), 'data.sqlite'));
// One chat: first its latest reply was stopped by the learner, then the same reply is saved as failed.
const failedTree = store.create('Retry fixture');
store.message(failedTree.id, 'user', 'Why is the sky blue?', 'completed');
const reply = store.message(failedTree.id, 'assistant', 'Sunlight scatters', 'interrupted');
store.update(reply, 'Sunlight scatters', 'interrupted', 'learner');
let release;
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => {
      emit({ type: 'delta', item: 'a', text: 'Retrying: ' });
      await new Promise((resolve) => {
        release = resolve;
      });
      emit({ type: 'item', item: 'a', text: `Retried answer to ${text}` });
      emit({ type: 'status', status: 'completed' });
    },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
const chat = `document.querySelector('.focused-chat')`;
const retryButton = `[...${chat}.querySelectorAll('button')].find(e => e.textContent.trim() === 'Retry reply')`;
const openChat = async (title) => {
  await b('wait', `[aria-label="Open ${title}"]`);
  await b('find', 'role', 'button', 'click', '--name', `Open ${title}`, '--exact');
  await wait(`${chat}?.querySelector('.reply-status')`);
};
try {
  await b('set', 'viewport', '1400', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');

  await openChat('Retry fixture');
  assert.equal(await ev(`!!(${retryButton})`), false, 'no Retry after a learner Stop');
  steps.push('Learner-stopped reply shows "Reply interrupted" with no Retry');

  store.update(reply, 'Sunlight scatters', 'failed');
  await ev(`localStorage.setItem('treetutor.appearance', 'light'); location.reload(); true`);
  await openChat('Retry fixture');
  await wait(retryButton);
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') {
      await ev(`localStorage.setItem('treetutor.appearance', 'dark'); location.reload(); true`);
      await openChat('Retry fixture');
      await wait(retryButton);
    }
    const file = join(verifyOut, `reply-retry-failed-${mode}.png`);
    await b('screenshot', file);
    steps.push(`${mode}: failed latest reply shows Retry reply; ${file}`);
  }

  // Keyboard: focus Retry and press Enter.
  await ev(`${retryButton}.focus(); true`);
  await b('press', 'Enter');
  await wait(
    `${chat}.textContent.includes('Retrying:') && !${chat}.textContent.includes('Sunlight scatters')`,
  );
  assert.equal(await ev(`!!(${retryButton})`), false, 'Retry hidden while streaming');
  steps.push('Enter on Retry reply: failed text replaced in place by the streaming reply');
  release();
  await wait(
    `${chat}.textContent.includes('Retried answer to Why is the sky blue?') && !${chat}.querySelector('.reply-status')`,
  );
  assert.equal(
    await ev(`${chat}.querySelectorAll('.question-bubble').length`),
    1,
    'learner question not duplicated',
  );
  assert.equal(
    await ev(`${chat}.querySelectorAll('.chat-reply').length`),
    1,
    'one reply, replaced in place',
  );
  const file = join(verifyOut, 'reply-retry-replaced-dark.png');
  await b('screenshot', file);
  steps.push(`Completed retry: one question, one completed reply, no Retry; ${file}`);
  assert.deepEqual(
    store.tree(failedTree.id).messages.map((m) => [m.role, m.status]),
    [
      ['user', 'completed'],
      ['assistant', 'completed'],
    ],
  );
  await ev(`localStorage.removeItem('treetutor.appearance'); true`);
  const result = { pass: true, fixture: 'in-process fake provider (no paid inference)', steps };
  writeFileSync(join(verifyOut, 'reply-retry-ui.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error(steps);
  throw e;
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
