import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const exec = promisify(execFile),
  session = `bulk-fold-${process.pid}`;
const b = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const ev = async (s) => JSON.parse(await b('eval', s, '--json')).data.result;
const wait = (s) => b('wait', '--fn', s);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const action = async (name) => {
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', name, '--exact');
};
const store = new Store(join(mkdtempSync(join(tmpdir(), 'bulk-fold-')), 'trees.sqlite'));
const root = store.create('Root');
function branch(parent, title) {
  const messageId = store.message(parent.id, 'assistant', 'Source passage', 'completed');
  return store.branch(
    parent,
    { messageId, start: 0, end: 6, text: 'Source', question: title },
    `Context for ${title}`,
  );
}
const a = branch(root, 'A'),
  bnode = branch(a, 'B'),
  c = branch(bnode, 'C');
const sibling = branch(a, 'Side'),
  hidden = branch(sibling, 'Side child'),
  descendant = branch(c, 'C child');
for (const [i, item] of [root, a, bnode, c, sibling, hidden, descendant].entries())
  store.position(item.id, i * 400, i * 200);
const before = [root, a, bnode, c, sibling, hidden, descendant].map((t) => store.tree(t.id));
const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {} });
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const node = (id) => `.react-flow__node[data-id="${id}"]`;
try {
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await wait(`!!document.querySelector(${JSON.stringify(node(descendant.id))})`);
  await action('Collapse all');
  await wait(`document.querySelectorAll('.react-flow__node').length === 1`);
  await action('Expand all');
  await wait(`document.querySelectorAll('.react-flow__node').length === 7`);
  await b('focus', `#open-${bnode.id}`);
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'B'`);
  await click('Return to tree');
  await wait(`getComputedStyle(document.querySelector('.focused-chat')).display === 'none'`);
  await b('focus', '[aria-label="Map menu"]:not([aria-hidden])');
  await b('press', 'Enter');
  await b('press', 'Home');
  for (let i = 0; i < 4; i++) await b('press', 'ArrowDown');
  await b('press', 'Enter');
  await wait(
    `!!document.querySelector(${JSON.stringify(node(bnode.id))}) && !!document.querySelector(${JSON.stringify(node(descendant.id))}) && !!document.querySelector(${JSON.stringify(node(sibling.id))}) && !document.querySelector(${JSON.stringify(node(hidden.id))})`,
  );
  assert.deepEqual(
    [root, a, bnode, c, sibling, hidden, descendant].map((t) => store.tree(t.id)),
    before,
  );
  await action('Collapse all');
  await action('Keep current branch');
  await wait(
    `!!document.querySelector(${JSON.stringify(node(bnode.id))}) && !!document.querySelector(${JSON.stringify(node(descendant.id))})`,
  );
  await action('Expand all');
  await wait(`document.querySelectorAll('.react-flow__node').length === 7`);
  const singleStore = new Store(join(mkdtempSync(join(tmpdir(), 'single-fold-')), 'trees.sqlite'));
  singleStore.message(singleStore.create('Single').id, 'user', 'Earlier question', 'completed');
  const singleApp = createApp({
    store: singleStore,
    auth: { status: () => ({ connected: false }) },
    provider: {},
  });
  await new Promise((resolve) => singleApp.server.listen(0, '127.0.0.1', resolve));
  try {
    await b('open', `http://127.0.0.1:${singleApp.server.address().port}`);
    await wait(`document.querySelectorAll('.react-flow__node').length === 1`);
    for (const name of ['Collapse all', 'Expand all', 'Keep current branch']) await action(name);
    assert.equal(await ev(`document.querySelectorAll('.react-flow__node').length`), 1);
  } finally {
    singleApp.stop();
    singleStore.close();
  }
  console.log(
    'PASS: bulk folds, keyboard action, collapsed-panel selection, path and descendants, sibling fold, saved content.',
  );
} catch (error) {
  console.error(await b('snapshot'));
  throw error;
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
