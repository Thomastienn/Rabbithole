import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// Branch-first failure: built app, isolated store, fake compaction that fails at form open and twice after submit, then succeeds on the second Retry.
const run = promisify(execFile),
  session = `compaction-retry-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'compaction-retry-')), 'data.sqlite'));
const root = store.create('Roots tree');
store.message(root.id, 'user', 'How do roots work?', 'completed');
store.message(root.id, 'assistant', 'Roots exchange nutrients with fungi.', 'completed');
let failures = 3,
  compactions = 0;
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    generate: async (tree, _text, emit) => {
      if (!tree.id) {
        compactions++;
        if (failures-- > 0) throw new Error(`Synthetic compaction failure ${compactions}`);
        emit({ type: 'item', item: 's', text: 'Retried context.' });
      } else emit({ type: 'item', item: 'a', text: 'Focused answer.' });
      emit({ type: 'status', status: 'completed' });
    },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Roots tree"]');
  await b('find', 'role', 'button', 'click', '--name', 'Open Roots tree', '--exact');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Roots tree'`);
  await b(
    'eval',
    '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true',
  );
  await b('press', 'Enter');
  await wait(`document.activeElement?.tagName === 'TEXTAREA'`);
  await b('press', 'Home');
  for (let i = 0; i < 5; i++) await b('press', 'Shift+ArrowRight');
  await b('press', 'Tab');
  await b('press', 'Enter');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Why fungi?');
  await b('find', 'role', 'button', 'click', '--name', 'Create focused chat', '--exact');
  const chat = `document.querySelector('.focused-chat')?.innerText ?? ''`;
  // The form-open run fails first (failure 1); submit runs again because a failed prepared run is never reused.
  for (const n of [2, 3]) {
    await wait(
      `(${chat}).includes('Synthetic compaction failure ${n}') && [...document.querySelectorAll('.focused-chat button')].some(e => e.textContent.trim() === 'Retry reply' && !e.disabled)`,
    );
    assert.ok(
      await ev(
        `(${chat}).includes('no reply was written without its context') && (${chat}).includes('Why fungi?')`,
      ),
      `inline error ${n} kept the child with its question`,
    );
    const child = store.list().find((t) => t.parent === root.id);
    assert.equal(store.tree(child.id).branch.snapshot, '');
    assert.equal(
      store.tree(child.id).messages.at(-1).text,
      '',
      'no tutor reply without inherited context',
    );
    await b('find', 'role', 'button', 'click', '--name', 'Retry reply', '--exact');
  }
  await wait(
    `(${chat}).includes('Focused answer.') && !(${chat}).includes('Synthetic compaction failure')`,
  );
  const child = store.list().find((t) => t.parent === root.id);
  assert.equal(store.tree(child.id).branch.snapshot, 'Retried context.');
  assert.equal(compactions, 4);
  console.log(
    'PASS: failed compaction kept the child with inline error and Retry; second failure showed the error again; Retry then compacted and answered (Focused answer.)',
  );
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
