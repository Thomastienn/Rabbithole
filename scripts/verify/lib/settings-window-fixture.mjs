// Seeded store, fixture endpoints, app server and agent-browser helpers for verify-settings-window.mjs.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../../server/store.mjs';
import { createApp } from '../../../server/app.mjs';
import { OpenAI } from '../../../server/providers/openai.mjs';
import { fakeOpenAI } from '../../../test/support/fake-openai.mjs';

const run = promisify(execFile),
  session = `settings-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 * 1024 * 1024 }))
    .stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`, '--timeout', '15000');
const dialog = `document.querySelector('.settings-page:not([hidden])')`;
const active = 'document.activeElement';
const step = (text) => console.log(`ok - ${text}`);

const dir = mkdtempSync(join(tmpdir(), 'tt-settings-'));
const store = new Store(join(dir, 'trees.sqlite'));
const cleanup = [],
  upstream = await fakeOpenAI({ after: (fn) => cleanup.push(fn) });
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
const reply = store.message(
  root.id,
  'assistant',
  'Mycorrhizal fungi trade phosphorus for sugar.',
  'completed',
);
store.usage(reply, { input: 120, output: 40, cacheRead: 10 });
store.record(
  `chat:${reply}`,
  'chat',
  { provider: 'claude', model: 'sonnet' },
  { input: 120, output: 40, cacheRead: 10 },
);
store.pendingSuggestions(root.id, reply, 2201);
store.finishSuggestions(
  root.id,
  reply,
  [],
  { input: 24, output: 8, cacheRead: 0 },
  { provider: 'claude', model: 'haiku' },
);
// Toggled by the journey; an object because imported bindings are read-only.
const flags = { connected: true, authFailure: true };
let modelChecks = 0,
  authRequests = 0;
const fixture = {
  models: async () => {
    modelChecks++;
    if (!flags.connected) throw new Error('Fixture signed out');
    return [{ model: 'fixture', label: 'Fixture model', isDefault: true }];
  },
  generate: async (t, text, emit) => {
    emit({ type: 'item', item: 'answer', text: 'Fixture reply.' });
    emit({ type: 'status', status: 'completed' });
  },
};
const signedOut = {
  models: async () => {
    throw new Error('signed out');
  },
  generate: async () => {
    throw new Error('signed out');
  },
};
const endpoint = new OpenAI(dir);
const app = createApp({
  store,
  providers: { claude: fixture, codex: signedOut },
  defaultProvider: 'claude',
  dir,
  endpoint,
  auth: {
    status: () => ({ connected: false, email: null }),
    start: () => {
      authRequests++;
      if (flags.authFailure) throw new Error('Fixture authentication unavailable');
      return `${origin}/?fixture-auth=ok`;
    },
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;

async function mapMenu(item) {
  await b('find', 'role', 'button', 'click', '--name', 'Map menu', '--exact');
  await b('find', 'role', 'menuitem', 'click', '--name', item, '--exact');
  await wait(
    `${active}?.id === '${item === 'Help' ? 'settings-section-interface' : 'settings-heading'}'`,
  );
}
// The selected page in the side navigation; only that page is rendered.
const heading = () =>
  ev(`${dialog}?.querySelector('nav [aria-current=page]')?.textContent ?? null`);
const pages = () =>
  ev(`[...${dialog}.querySelectorAll('.settings-group h2')].map(h => h.textContent)`);
const tab = async (name) => {
  await ev(`document.getElementById('settings-${name.toLowerCase()}').click(); true`);
  await wait(
    `${dialog}.querySelector('nav [aria-current=page]')?.textContent === ${JSON.stringify(name)} && document.activeElement?.id === 'settings-section-${name.toLowerCase()}'`,
  );
  assert.deepEqual(await pages(), [name], `only ${name} shows`);
};
const text = () => ev(`${dialog}.textContent`);
const closed = () => wait(`!${dialog}`);

export {
  b,
  ev,
  wait,
  dialog,
  active,
  step,
  store,
  cleanup,
  upstream,
  reply,
  flags,
  modelChecks,
  authRequests,
  fixture,
  endpoint,
  app,
  origin,
  mapMenu,
  heading,
  pages,
  tab,
  text,
  closed,
};
