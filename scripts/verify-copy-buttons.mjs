// Built-app browser fixture (in-process fake provider, not a live model) for reply and code-block Copy.
// shortcut: navigator.clipboard.writeText is stubbed to record the text, since headless Chrome denies the real clipboard.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile),
  session = `copy-buttons-${process.pid}`;
// Emulate a mouse so the hover-only reveal can be checked (headless Chrome reports hover: none).
const b = async (...args) =>
  (
    await run('agent-browser', ['--session', session, ...args], {
      env: {
        ...process.env,
        AGENT_BROWSER_ARGS:
          '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
      },
    })
  ).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'copy-buttons-')), 'data.sqlite'));
const code = 'const lock = new Mutex();\nawait lock.run(() => count++);';
const text = `A **mutex** lets one thread at a time touch \`count\`:\n\n\`\`\`js\n${code}\n\`\`\`\n\nRelease it even when the work throws.`;
const root = store.create('Copy fixture');
store.message(root.id, 'user', 'What is a mutex?', 'completed');
const reply = store.message(root.id, 'assistant', text, 'completed');
store.usage(reply, { input: 900, output: 60, cacheRead: 0 });
const app = createApp({
  store,
  auth: { status: () => ({ connected: true }) },
  provider: {
    models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
    generate: async () => {},
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const steps = [];
const opacity = (selector) => ev(`getComputedStyle(document.querySelector('${selector}')).opacity`);
const active = () => ev(`document.activeElement.getAttribute('aria-label')`);
const open = async () => {
  await b('wait', '[aria-label="Open Copy fixture"]');
  await click('Open Copy fixture');
  await wait(`document.querySelector('.focused-chat .reply-copy')`);
  await ev(
    `window.__copied = []; navigator.clipboard.writeText = t => (window.__copied.push(t), Promise.resolve()); true`,
  );
  await b('mouse', 'move', '5', '5');
  await ev(`document.activeElement?.blur(); true`);
};
try {
  await b('set', 'viewport', '1400', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await open();

  assert.equal(await opacity('.reply-copy'), '1', 'mockup reply Copy visible at rest');
  assert.equal(await opacity('.code-copy'), '0', 'code Copy quiet at rest');
  assert.equal(
    await ev(`document.querySelectorAll('.focused-chat .code-copy').length`),
    1,
    'one Copy per code block',
  );
  assert.equal(
    await ev(`!!document.querySelector('.focused-chat .question-bubble button')`),
    false,
    'no Copy on questions',
  );

  // Keyboard: Tab from the reply's last passage control lands on Copy reply; Shift+Tab back reaches Copy code.
  await ev(
    `[...document.querySelectorAll('.focused-chat button')].find(e => e.getAttribute('aria-label') === 'Select passage in tutor reply 1' || e.textContent === 'Select passage in tutor reply 1').focus(); true`,
  );
  await b('press', 'Tab');
  assert.equal(await active(), 'Copy tutor reply 1', 'Tab reaches Copy reply');
  assert.equal(await opacity('.reply-copy'), '1', 'reply Copy shown on keyboard focus');
  await b('press', 'Enter');
  await wait(`window.__copied.length === 1`);
  assert.equal(
    await ev(`window.__copied[0]`),
    text,
    'reply Copy puts the original Markdown on the clipboard',
  );
  await wait(`document.activeElement.getAttribute('aria-label') === 'Copied'`);
  steps.push(
    'Tab to "Copy tutor reply 1", Enter: clipboard holds the raw Markdown; label confirms "Copied"',
  );

  await b('press', 'Shift+Tab');
  await b('press', 'Shift+Tab');
  assert.equal(await active(), 'Copy code', 'Shift+Tab reaches Copy code');
  assert.equal(await opacity('.code-copy'), '1', 'code Copy shown on keyboard focus');
  await b('press', ' ');
  await wait(`window.__copied.length === 2`);
  assert.equal(
    await ev(`window.__copied[1]`),
    code,
    'code Copy puts the block source on the clipboard',
  );
  steps.push('Shift+Tab to "Copy code", Space: clipboard holds the code source without fences');

  for (const mode of ['dark', 'light']) {
    if (mode === 'light') {
      await ev(`localStorage.setItem('treetutor.appearance', 'light'); location.reload(); true`);
      await open();
    }
    await b('hover', '.focused-chat .reply-md pre');
    await wait(
      `getComputedStyle(document.querySelector('.code-copy')).opacity === '1' && getComputedStyle(document.querySelector('.reply-copy')).opacity === '1'`,
    );
    const file = join('docs', 'verification', `copy-buttons-${mode}.png`);
    await b('screenshot', file);
    steps.push(`${mode}: hover shows Copy code and Copy reply; ${file}`);
  }
  await ev(`localStorage.removeItem('treetutor.appearance'); true`);
  console.log(JSON.stringify({ pass: true, steps }, null, 2));
} catch (e) {
  console.error(steps);
  throw e;
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
