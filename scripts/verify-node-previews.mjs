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
const first = store.message(root.id, 'user', 'First root question', 'completed');
store.message(root.id, 'assistant', 'First root answer', 'completed');
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
  const rows = `Array.from(${node(root.id)}.querySelectorAll('[data-message]'))`;
  await check(`${rows}.map(e => e.dataset.message).join() === ${JSON.stringify([first])}.concat(${JSON.stringify(store.tree(root.id).messages.slice(1).map(m => m.id))}).join()`);
  await check(`${rows}.map(e => e.textContent.slice(0, 12)).join('|') === 'Question: Fi|Answer: Firs|Question: Lo|Answer: Long'`);
  await check(`${rows}.every(e => getComputedStyle(e.querySelector('.node-bubble .astryx-text')).webkitLineClamp === '3') && ${rows}[0].dataset.role === 'user' && ${rows}[1].dataset.role === 'assistant'`);
  // Chat layout: questions right-aligned in the tint bubble, replies left-aligned plain text.
  const box = (e, side) => `${e}.getBoundingClientRect().${side}`;
  await check(`${rows}.filter(e => e.dataset.role === 'user').every(e => e.querySelector('.node-bubble .astryx-text').classList.contains('question-bubble') && getComputedStyle(e.querySelector('.node-bubble .astryx-text')).backgroundColor !== 'rgba(0, 0, 0, 0)' && Math.abs(${box("e.querySelector('.node-bubble .astryx-text')", 'right')} - ${box('e', 'right')}) < 1 && ${box("e.querySelector('.node-bubble .astryx-text')", 'left')} > ${box('e', 'left')} + 1)`);
  await check(`${rows}.filter(e => e.dataset.role === 'assistant').every(e => !e.querySelector('.node-bubble .astryx-text').classList.contains('question-bubble') && getComputedStyle(e.querySelector('.node-bubble .astryx-text')).backgroundColor === 'rgba(0, 0, 0, 0)' && Math.abs(${box("e.querySelector('.node-bubble .astryx-text')", 'left')} - ${box('e', 'left')}) < 1)`);
  // Branch edges still leave from the reply row they came from.
  await check(`[${JSON.stringify(child.id)}, ${JSON.stringify(unanswered.id)}].every(id => ${node(root.id)}.querySelector('[data-source="' + id + '"]')?.closest('[data-message]')?.dataset.message === ${JSON.stringify(source)})`);
  if (process.env.SCREENSHOT) await browser('screenshot', process.env.SCREENSHOT);
  await check(`!Array.from(${node(root.id)}.querySelectorAll('*')).some(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))`);
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
  await check(`${rows}.length === 6 && ${rows}[4].textContent.includes('Live question') && ${rows}[5].textContent.includes('Streaming fixture reply') && ${rows}[5].textContent.includes('Replying…') && ${node(root.id)}?.textContent.includes('Responding') && ${rows}[0].textContent.includes('First root question')`);
  // While the root replies, previews poll only the replying conversation.
  await browser('eval', `window.__previewRequests = []; new PerformanceObserver(list => list.getEntries().forEach(e => e.name.includes('/api/previews') && window.__previewRequests.push(e.name))).observe({ type: 'resource' })`);
  await check(`window.__previewRequests.length >= 2 && window.__previewRequests.every(u => new URL(u).searchParams.getAll('id').join() === ${JSON.stringify(root.id)})`);
  await check(`document.activeElement?.id === 'open-${root.id}'`);
  await browser('find', 'role', 'button', 'click', '--name', 'Open Root previews', '--exact');
  await check(`getComputedStyle(document.querySelector('.focused-chat')).display !== 'none'`);
  await browser('find', 'role', 'button', 'click', '--name', 'Stop', '--exact');
  await check(`document.body.textContent.includes('Reply interrupted')`);
  await browser('find', 'role', 'button', 'click', '--name', 'Return to tree', '--exact');
  await check(`${rows}.length === 6 && ${rows}[5].textContent.includes('Reply interrupted') && ${node(child.id)}?.querySelector('[data-role=assistant]')?.textContent.includes('Reply failed')`);
  await browser('reload');
  await check(`${rows}.length === 6 && ${rows}[5].textContent.includes('Reply interrupted')`);
  console.log('PASS: every message in order with data-message ids, distinct question/answer rows, three-line clamp, questions right-aligned in the tint bubble, replies left-aligned plain text, branch handles on their source reply row, no inner scroll; long, short, unanswered, streaming, failed and interrupted rows; active-only polling; exact source, navigation and reload.');
} catch (error) {
  console.error(await browser('snapshot').catch(() => 'snapshot unavailable'));
  throw error;
} finally {
  await browser('close').catch(() => {});
  app.stop(); store.close();
}
