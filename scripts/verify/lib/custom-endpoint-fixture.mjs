// Seeded store, fake OpenAI endpoints, fixture server lifecycle and agent-browser helpers for verify-custom-endpoint.mjs.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, fork } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { Store } from '../../../server/store.mjs';
import { fakeOpenAI, streamReply } from '../../../test/support/fake-openai.mjs';

process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-endpoint-ui-')),
  cleanup = [];
const fake = await fakeOpenAI({ after: (fn) => cleanup.push(fn) }),
  gateway = await fakeOpenAI({ after: (fn) => cleanup.push(fn) });
fake.reply = (req, res) => streamReply(res, ['Peterson fixture continuation.']);
gateway.models = [{ id: 'gateway-model' }];
gateway.reply = (req, res) => streamReply(res, ['Gateway fixture continuation.']);
// Upgrade fixture: the old single-endpoint file must become "Custom endpoint" with provider id openai.
writeFileSync(
  join(dir, 'openai-endpoint.json'),
  JSON.stringify({ baseUrl: fake.baseUrl, apiKey: 'legacy-fixture-secret' }),
  { mode: 0o600 },
);
const secrets = ['legacy-fixture-secret', 'gateway-fixture-secret', 'local-fixture-secret'];
const store = new Store(join(dir, 'trees.sqlite')),
  root = store.create('Root switch fixture', 'claude');
store.model(root.id, 'sonnet');
store.message(root.id, 'user', 'Root seed question', 'completed');
const source = store.message(root.id, 'assistant', 'Peterson root passage', 'completed');
const child = store.branch(
  store.tree(root.id),
  { messageId: source, start: 0, end: 8, text: 'Peterson', question: 'Child fixture' },
  'Frozen root fact 47',
);
const childSource = store.message(child.id, 'assistant', 'Peterson child passage', 'completed');
const nested = store.branch(
  store.tree(child.id),
  {
    messageId: childSource,
    start: 0,
    end: 8,
    text: 'Peterson',
    question: 'Nested switch fixture',
  },
  'Frozen marble grove has 83 trees.',
);
store.message(nested.id, 'user', 'Nested seed question', 'completed');
store.message(nested.id, 'assistant', 'Nested seed answer', 'completed');
store.layout(root.id, { folded: [], selected: root.id, panel: 'beside' });
store.close();
const exec = promisify(execFile),
  session = `tt-endpoint-${process.pid}`;
const browser = async (...args) =>
  (await exec('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 }))
    .stdout;
const evaluate = async (expression) =>
  JSON.parse(await browser('eval', expression, '--json')).data.result;
const wait = (expression) => browser('wait', '--fn', expression, '--timeout', '15000');
const click = (name) => browser('find', 'role', 'button', 'click', '--name', name, '--exact');
const fill = (label, text) => browser('find', 'label', label, 'fill', text);
const checks = [],
  pass = (name) => {
    checks.push(name);
    console.log('PASS:', name);
  };
let server, origin;
async function start() {
  server = fork(join(import.meta.dirname, 'custom-endpoint-server.mjs'), ['--serve', dir], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const [ready] = await once(server, 'message');
  origin = ready.origin;
  return ready.pid;
}
async function stop() {
  const stopped = once(server, 'exit');
  server.send('stop');
  await stopped;
}
const get = async (path) => (await fetch(origin + path)).json();
const saved = (id) => get(`/api/trees/${id}`);
const settingsText = '(document.querySelector(".endpoint-settings")?.textContent ?? "")';
async function tabTo(selector, text) {
  for (let i = 0; i < 200; i++) {
    if (
      await evaluate(
        `document.activeElement?.matches(${JSON.stringify(selector)}) && (${text === undefined ? 'true' : `document.activeElement.textContent.trim() === ${JSON.stringify(text)}`})`,
      )
    )
      return;
    await browser('press', 'Tab');
  }
  assert.fail(
    `Tab did not reach ${selector}: ` + (await evaluate('document.activeElement?.outerHTML')),
  );
}
async function menuItem(label) {
  await browser('press', 'Home');
  for (let i = 0; i < 20; i++) {
    if (
      await evaluate(
        `document.activeElement?.textContent.trim().startsWith(${JSON.stringify(label)})`,
      )
    ) {
      await browser('press', 'Enter');
      return;
    }
    await browser('press', 'ArrowDown');
  }
  assert.fail(`Menu item not reached: ${label}`);
}
async function modelMenu() {
  if (!(await evaluate('!!document.querySelector(".focused-chat")?.getClientRects().length'))) {
    await tabTo('[aria-label="Reopen chat"]');
    await browser('press', 'Enter');
  }
  await tabTo('[aria-label="Model for next reply"]');
  await browser('press', 'Space');
  await wait(
    `document.querySelector('[aria-label="Model for next reply"]')?.getAttribute('aria-expanded') === 'true' && [...document.querySelectorAll('[role=menu]')].some(e=>e.getClientRects().length)`,
  );
}
const menuText =
  '[...document.querySelectorAll("[role=menu]")].find(e=>e.getClientRects().length)?.textContent ?? ""';
async function mapMenu() {
  if (
    !(await evaluate(
      `!!document.querySelector('[aria-label="Map menu"]')?.getClientRects().length`,
    ))
  )
    await browser('press', 'Escape');
  await tabTo('[aria-label="Map menu"]');
  await browser('press', 'Space');
}
async function closeSettings() {
  await tabTo('#settings-return');
  await browser('press', 'Enter');
  await wait('!document.querySelector(".settings-page:not([hidden])")');
}
async function connectionSettings() {
  await mapMenu();
  await menuItem('Settings');
  await wait('document.activeElement?.id === "settings-heading"');
  await tabTo('#settings-connections');
  await browser('press', 'Enter');
  await wait(
    '!!document.querySelector(".endpoint-add") && !document.querySelector(".endpoint-settings")?.textContent.includes("Loading endpoints")',
  );
}
async function openConversation(title) {
  await tabTo(`[aria-label="Open ${title}"]`);
  await browser('press', 'Enter');
  await wait(`document.querySelector('.chat-title h2')?.textContent === ${JSON.stringify(title)}`);
}
let gw;
// The journey learns the gateway id after adding it; imported bindings are read-only.
const setGateway = (id) => {
  gw = id;
};
const labels = () => ({
  claude: 'Sonnet',
  codex: 'Codex model',
  openai: 'second-model',
  [gw]: 'gateway-model',
});
const models = () => ({
  claude: 'sonnet',
  codex: 'codex-model',
  openai: 'second-model',
  [gw]: 'gateway-model',
});
async function switchCycle(id, phase) {
  for (const provider of ['openai', gw, 'codex', 'claude', 'openai', gw]) {
    const before = await saved(id),
      from = before.provider;
    const visible = await evaluate(
      "[...document.querySelectorAll('.focused-chat article')].map(e=>e.querySelector('.reply-md, .question-bubble').textContent)",
    );
    assert.equal(visible.length, before.messages.length);
    await modelMenu();
    await menuItem(labels()[provider]);
    await wait(
      `document.querySelector('.chat-model')?.textContent.includes(${JSON.stringify(labels()[provider] + ' · ')})`,
    );
    const after = await saved(id);
    assert.equal(after.provider, provider);
    assert.equal(after.model, models()[provider]);
    assert.deepEqual(after.messages, before.messages);
    assert.deepEqual(after.branch, before.branch);
    await tabTo('[role=textbox][aria-label="Your question"]');
    await browser('keyboard', 'inserttext', `${phase}: ${from} to ${provider}`);
    await browser('press', 'Enter');
    await wait(
      `document.querySelectorAll('.focused-chat article').length === ${before.messages.length + 2} && ![...document.querySelectorAll('.focused-chat [role=status]')].some(e=>e.textContent.includes('Responding')) && document.querySelector('[aria-label="Model for next reply"]')?.getAttribute('aria-disabled') !== 'true'`,
    );
    const replied = await saved(id);
    assert.equal(replied.messages.length, before.messages.length + 2);
    assert.equal(replied.messages.at(-1).status, 'completed');
    assert.equal(replied.provider, provider);
    assert.equal(
      replied.messages.at(-1).text,
      provider === gw ? 'Gateway fixture continuation.' : 'Peterson fixture continuation.',
    );
  }
  pass(
    `${phase}: keyboard switches across Custom endpoint, Work gateway, Codex and Claude; transcripts unchanged and each reply came from the chosen endpoint`,
  );
}
async function noSecrets() {
  assert.ok(
    !(await evaluate(
      `${JSON.stringify(secrets)}.some(k => document.documentElement.outerHTML.includes(k))`,
    )),
    'a key reached the page',
  );
}

export {
  dir,
  cleanup,
  fake,
  gateway,
  root,
  nested,
  browser,
  evaluate,
  wait,
  click,
  fill,
  checks,
  pass,
  server,
  origin,
  start,
  stop,
  get,
  saved,
  settingsText,
  tabTo,
  menuItem,
  modelMenu,
  menuText,
  closeSettings,
  connectionSettings,
  openConversation,
  gw,
  setGateway,
  models,
  switchCycle,
  noSecrets,
};
