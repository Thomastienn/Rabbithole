import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const exec = promisify(execFile);
const session = `treetutor-previews-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const store = new Store(join(mkdtempSync(join(tmpdir(), 'treetutor-previews-')), 'trees.sqlite'));
const root = store.create('Root previews');
store.message(root.id, 'user', 'Long question '.repeat(60), 'completed');
const source = store.message(root.id, 'assistant', 'Long answer '.repeat(60), 'completed');
const child = store.branch(root, { messageId: source, start: 0, end: 4, text: 'Long', question: 'Child' }, 'context');
store.message(child.id, 'user', 'Short child question', 'completed');
store.message(child.id, 'assistant', 'Partial child reply', 'failed');
const unanswered = store.branch(root, { messageId: source, start: 0, end: 4, text: 'Long', question: 'Unanswered' }, 'context');
store.message(unanswered.id, 'user', 'First question', 'completed');
const app = createApp({ store, auth: { status: () => ({ connected: false }) }, provider: {
  async generate(_tree, _text, emit, _thread, signal) {
    emit({ type: 'item', item: 'reply', text: 'Streaming fixture reply' });
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  },
} });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
try {
  await browser('open', `http://127.0.0.1:${app.server.address().port}`);
  const node = id => `document.querySelector('.react-flow__node[data-id="${id}"]')`;
  const check = async expression => browser('wait', '--fn', expression);
  await check(`${node(root.id)}?.textContent.includes('Long question') && ${node(child.id)}?.textContent.includes('Reply failed')`);
  await check(`${node(unanswered.id)}?.textContent.includes('Answer: No reply yet.')`);
  await check(`Array.from(${node(root.id)}.querySelectorAll('[data-type="supporting"]')).filter(e => /^(Question|Answer):/.test(e.textContent)).every(e => getComputedStyle(e).webkitLineClamp === '2')`);
  await browser('find', 'role', 'button', 'click', '--name', 'Reveal source passage for Child', '--exact');
  await check(`document.activeElement?.tagName === 'MARK' && document.activeElement.textContent === 'Long'`);
  await browser('find', 'role', 'button', 'click', '--name', 'Return to tree', '--exact');
  await check(`${node(child.id)}?.textContent.includes('Short child question')`);
  await browser('reload');
  await check(`${node(root.id)}?.textContent.includes('Long answer') && ${node(child.id)}?.textContent.includes('Partial child reply')`);
  await browser('find', 'role', 'button', 'click', '--name', 'Open Root previews', '--exact');
  await check(`document.activeElement?.getAttribute('aria-label') === 'Your question'`);
  await browser('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Live question');
  await browser('find', 'role', 'button', 'click', '--name', 'Send', '--exact');
  await check(`document.body.textContent.includes('Streaming fixture reply')`);
  await browser('find', 'role', 'button', 'click', '--name', 'Return to tree', '--exact');
  await check(`${node(root.id)}?.textContent.includes('Live question') && ${node(root.id)}?.textContent.includes('Streaming fixture reply') && ${node(root.id)}?.textContent.includes('Responding')`);
  await check(`document.activeElement?.id === 'open-${root.id}'`);
  await browser('find', 'role', 'button', 'click', '--name', 'Open Root previews', '--exact');
  await check(`getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`);
  await browser('find', 'role', 'button', 'click', '--name', 'Stop', '--exact');
  await check(`document.body.textContent.includes('Reply interrupted')`);
  await browser('find', 'role', 'button', 'click', '--name', 'Return to tree', '--exact');
  await check(`${node(root.id)}?.textContent.includes('Reply interrupted') && ${node(child.id)}?.textContent.includes('Reply failed')`);
  console.log('PASS: long, short, unanswered, streaming, failed and interrupted previews; two-line clamp, exact source, navigation and reload.');
} catch (error) {
  console.error(await browser('snapshot').catch(() => 'snapshot unavailable'));
  throw error;
} finally {
  await browser('close').catch(() => {});
  app.stop(); store.close();
}
