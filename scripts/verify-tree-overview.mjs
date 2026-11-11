import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Requires a built app and agent-browser. Uses synthetic data and no provider credentials.
const exec = promisify(execFile);
const session = `treetutor-overview-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const click = name => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const check = expression => browser('eval', `if (!(${expression})) throw new Error('Overview check failed: ' + ${JSON.stringify(expression)}); true`);
const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-overview-')), 'trees.sqlite'));
store.message(store.create('Separate ocean tree').id, 'user', 'Earlier question', 'completed');
const root = store.create('Forest ecology');
const source = store.message(root.id, 'assistant', 'Roots share nutrients through fungi.', 'completed');
const child = store.branch(root, { messageId: source, start: 0, end: 5, text: 'Roots', question: 'How do roots share nutrients?' }, 'Synthetic context');
const nestedSource = store.message(child.id, 'assistant', 'Fungi carry nutrients.', 'completed');
const grandchild = store.branch(child, { messageId: nestedSource, start: 0, end: 5, text: 'Fungi', question: 'How do fungi help?' }, 'Synthetic nested context');
let generations = 0;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: {
  models: async () => [{ model: 'fixture', label: 'Fixture', isDefault: true }],
  async generate(tree, text, emit) {
    if (!text.startsWith('Compact "inheritedContext"')) {
      generations++;
      emit({ type: 'item', item: 'reply', text: 'Synthetic response' });
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    emit({ type: 'item', item: 'reply', text: 'Synthetic response complete' });
    emit({ type: 'status', status: 'completed' });
  },
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
try {
  await browser('set', 'viewport', '1440', '900');
  await browser('open', `http://127.0.0.1:${app.server.address().port}`);
  await browser('wait', '[aria-label="Open Forest ecology"]');
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__node").length === 3 && document.querySelectorAll(".react-flow__edge").length === 2');
  await browser('wait', `[data-message="${nestedSource}"] .react-flow__handle`);
  await check(`document.querySelector('.react-flow__handle[data-source="${child.id}"]').closest('.node-message').dataset.message === '${source}'`);
  await check(`document.querySelector('.react-flow__handle[data-source="${grandchild.id}"]').closest('.node-message').dataset.message === '${nestedSource}'`);
  await check('document.querySelectorAll(".passage-anchor").length === 0');
  await browser('focus', `#reveal-${grandchild.id}`);
  await browser('press', 'Enter');
  await browser('wait', '--fn', 'document.activeElement?.tagName === "MARK" && document.activeElement.textContent === "Fungi"');
  await click('Return to tree');
  await browser('wait', '--fn', '!document.documentElement.matches(":active-view-transition")');
  await click('Zoom in');
  await click('Open Forest ecology');
  await browser('wait', '.focused-chat [aria-label="Your question"]');
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Explain nutrient sharing');
  await click('Send');
  await browser('wait', '--text', 'Responding…');
  // Opening chat may move the map to reveal its box; returning keeps that view (verify-canvas-navigation).
  await browser('eval', 'window.savedViewport = document.querySelector(".react-flow__viewport").getAttribute("style")');
  await click('Return to tree');
  await browser('wait', '--fn', 'document.activeElement?.id.startsWith("open-")');
  await check('window.savedViewport === document.querySelector(".react-flow__viewport").getAttribute("style")');
  await click('Open Forest ecology');
  await browser('wait', '--text', 'Synthetic response complete');
  if (generations !== 1 || store.tree(root.id).messages.filter(m => m.role === 'user').length !== 1) throw new Error('Navigation restarted generation');
  await browser('set', 'viewport', '390', '844');
  await check('document.querySelector(".focused-chat [role=textbox]").getBoundingClientRect().bottom <= innerHeight && document.documentElement.scrollWidth === innerWidth');
  await browser('eval', '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true'); await browser('press', 'Enter');
  await browser('wait', '--fn', 'document.activeElement?.tagName === "TEXTAREA"');
  await browser('press', 'Home');
  for (let i = 0; i < 5; i++) await browser('press', 'Shift+ArrowRight');
  await browser('find', 'role', 'button', 'click', '--name', 'Ask about selection', '--exact');
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Why do roots share?');
  await browser('press', 'Tab');
  await browser('press', 'Enter');
  await browser('wait', '--text', 'Why do roots share?');
  await browser('wait', '--fn', 'document.activeElement?.getAttribute("aria-label") === "Your question"');
  await browser('wait', '--text', 'Synthetic response complete');
  await click('Return to tree');
  await browser('wait', '--fn', 'document.querySelectorAll(".react-flow__node").length === 4');
  await browser('wait', '[aria-label="Map menu"]');
  await click('Map menu');
  await browser('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  // The mobile drawer slides in; a click mid-slide lands off-screen.
  await browser('wait', '--fn', 'document.querySelector("[aria-label=\'Separate ocean tree\']")?.getBoundingClientRect().x >= 0');
  await click('Separate ocean tree');
  await browser('wait', '[aria-label="Open Separate ocean tree"]');
  await check('document.querySelectorAll(".react-flow__node").length === 1 && document.querySelectorAll(".react-flow__edge").length === 0');
  console.log('PASS: source-message handles including grandchild, keyboard exact-passage reveal, no bottom passage list, nested overview, viewport/focus return, generation continuity, mobile composer, new branch focus, separate-tree isolation.');
} finally {
  await browser('close').catch(() => {});
  while (app.active.size) await new Promise(resolve => setTimeout(resolve, 20));
  app.stop(); store.close();
}
