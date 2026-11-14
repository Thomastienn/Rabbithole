// Real built UI, HTTP, storage and keyboard focus; provider replies are synthetic fixtures.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Store } from '../server/store.mjs';
import { OpenAI } from '../server/openai.mjs';
import { createApp } from '../server/app.mjs';
import { fakeOpenAI, streamReply } from '../test/fake-openai.mjs';

process.umask(0o077);
const filename = fileURLToPath(import.meta.url);
if (process.argv[2] === '--serve') {
  const dir = process.argv[3],
    store = new Store(join(dir, 'trees.sqlite')),
    endpoint = new OpenAI(dir);
  let offline = false;
  const native = (model, label) => ({
    models: async () => {
      if (offline) throw new Error('Fixture offline');
      return [{ model, label, isDefault: true }];
    },
    generate: async (tree, _text, emit, save) => {
      save(tree.thread ?? `fixture-${tree.id}`, tree.model);
      emit({ type: 'item', item: 'a', text: 'Peterson fixture continuation.' });
      emit({ type: 'status', status: 'completed' });
    },
  });
  const app = createApp({
    store,
    dir,
    endpoint,
    providers: { claude: native('sonnet', 'Sonnet'), codex: native('codex-model', 'Codex model') },
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: true }) },
  });
  process.on('message', async (message) => {
    if (message === 'stop') {
      await app.stop();
      store.close();
      process.exit(0);
    }
    offline = message === 'offline';
    process.send({ ack: message });
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}`, pid: process.pid });
} else {
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
    server = fork(filename, ['--serve', dir], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
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
    await wait(
      `document.querySelector('.chat-title h2')?.textContent === ${JSON.stringify(title)}`,
    );
  }
  let gw;
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
  try {
    const firstPid = await start();
    await browser('set', 'viewport', '1280', '900');
    await browser('open', origin);
    await browser('set', 'media', 'light', 'reduced-motion');
    await browser('wait', '[aria-label="Model for next reply"]');
    assert.deepEqual(await get('/api/settings/endpoints'), [
      { id: 'openai', name: 'Custom endpoint', baseUrl: fake.baseUrl, lastTest: null },
    ]);
    assert.equal(existsSync(join(dir, 'openai-endpoint.json')), false);
    await connectionSettings();
    await wait(
      `document.querySelector('.endpoint-row[data-endpoint="openai"]')?.textContent.includes(${JSON.stringify('Custom endpoint' + fake.baseUrl)})`,
    );
    pass(
      'upgrade: the single saved endpoint is listed as "Custom endpoint" (provider id openai); old file replaced',
    );

    // Keyboard add, with a duplicate name rejected first.
    await tabTo('.endpoint-add');
    await browser('press', 'Enter');
    await wait(
      'document.activeElement?.closest(".endpoint-form") && document.activeElement.matches("input")',
    );
    await browser('keyboard', 'inserttext', 'custom endpoint');
    await browser('press', 'Tab');
    await browser('keyboard', 'inserttext', gateway.baseUrl);
    await browser('press', 'Tab');
    await browser('keyboard', 'inserttext', 'gateway-fixture-secret');
    assert.equal(await evaluate('document.activeElement.type'), 'password');
    await browser('press', 'Enter');
    await wait(
      `${settingsText}.includes('Another endpoint is called custom endpoint. Choose a different name.')`,
    );
    assert.equal(
      await evaluate('document.querySelector(".endpoint-form input[type=password]").value'),
      '',
    );
    await fill('Name', 'Work gateway');
    await fill('API key', 'gateway-fixture-secret');
    await click('Save');
    await wait(`${settingsText}.includes('Work gateway added.')`);
    const list = await get('/api/settings/endpoints');
    assert.deepEqual(
      list.map((e) => [e.name, e.baseUrl]),
      [
        ['Custom endpoint', fake.baseUrl],
        ['Work gateway', gateway.baseUrl],
      ],
    );
    gw = list[1].id;
    assert.match(gw, /^openai:[0-9a-f-]{36}$/);
    await wait('!document.querySelector(".endpoint-form")'); // form closes after save
    await noSecrets();
    pass(
      'inline Add endpoint by keyboard: duplicate name rejected with an actionable message, then saved under a new stable id; key cleared and never shown',
    );

    await closeSettings();
    await modelMenu();
    const menu = await evaluate(menuText);
    for (const label of ['Custom endpoint', 'second-model', 'Work gateway', 'gateway-model'])
      assert.ok(menu.includes(label), label);
    assert.ok(
      menu.indexOf('Work gateway') < menu.indexOf('gateway-model') &&
        menu.indexOf('Custom endpoint') < menu.indexOf('second-model'),
    );
    await browser('press', 'Escape');
    pass("model menu groups each endpoint's models under its own name");

    await switchCycle(root.id, 'root before restart');
    await openConversation('Nested switch fixture');
    await switchCycle(nested.id, 'nested before restart');
    await stop();
    const secondPid = await start();
    assert.notEqual(firstPid, secondPid);
    await browser('open', origin);
    await browser('wait', '[aria-label="Open Nested switch fixture"]');
    assert.deepEqual(
      (await get('/api/settings/endpoints')).map((e) => e.id),
      ['openai', gw],
    );
    await openConversation('Nested switch fixture');
    await switchCycle(nested.id, 'nested after restart');
    pass('fresh server PID reloads both endpoints and their conversations');

    gateway.modelStatus = 401;
    await modelMenu();
    assert.ok((await evaluate(menuText)).includes('Work gateway · not connected'));
    await menuItem('Custom endpoint settings');
    await wait('document.activeElement?.matches(".endpoint-add")');
    pass(
      'a failing endpoint shows "Work gateway · not connected" with a settings action that focuses Add endpoint',
    );

    // Failed test stays on the row, also after a reload, until the next test or save.
    const row = (name) =>
      `(document.querySelector('.endpoint-row[data-endpoint="${name}"]')?.textContent ?? '')`;
    assert.ok((await evaluate(row(gw))).includes('Not tested'));
    await click('Test Work gateway');
    await wait(
      `${row(gw)}.includes('Test failed · Custom endpoint rejected the API key. Check endpoint settings.')`,
    );
    assert.ok(
      await evaluate(
        `!!document.querySelector('.endpoint-row[data-endpoint="${gw}"] [role=alert]')`,
      ),
      'failure is announced: ' +
        (await evaluate(
          `document.querySelector('.endpoint-row[data-endpoint="${gw}"]').outerHTML`,
        )),
    );
    await browser('reload');
    await browser('wait', '[aria-label="Model for next reply"]');
    await connectionSettings();
    await wait(`${row(gw)}.includes('Test failed')`);
    assert.ok(await evaluate(`!!document.querySelector('[aria-label="Test Work gateway again"]')`));
    for (const scheme of ['light', 'dark']) {
      await evaluate(`localStorage.setItem('treetutor.appearance', '${scheme}'); true`);
      await browser('reload');
      await browser('wait', '[aria-label="Model for next reply"]');
      await connectionSettings();
      await wait(`${row(gw)}.includes('Test failed')`);
      await browser('screenshot', `docs/verification/custom-endpoints-test-failed-${scheme}.png`);
    }
    await evaluate(`localStorage.setItem('treetutor.appearance', 'light'); true`);
    await browser('reload');
    await browser('wait', '[aria-label="Model for next reply"]');
    await connectionSettings();
    gateway.modelStatus = 200;
    pass(
      'a failed test shows the failure with what to do, stays after reload and offers Test again',
    );

    // Edit inline: a URL change needs the key again; rename keeps the key and the conversation's provider.
    const gatewayCalls = gateway.calls.length;
    await click('Edit Work gateway');
    await wait('!!document.querySelector(\'.endpoint-form[aria-label="Edit Work gateway"]\')');
    assert.equal(
      await evaluate('document.querySelector(".endpoint-form input[type=password]").value'),
      '',
    );
    await fill('Name', 'Team gateway');
    await fill('Base URL', fake.baseUrl);
    await wait(
      `${settingsText}.includes('URL changed: enter the key again so it never reaches a new host unasked.')`,
    );
    assert.ok(
      await evaluate(
        '[...document.querySelectorAll(".endpoint-form button")].find(b => b.textContent.trim() === "Save").disabled',
      ),
      'Save waits for the key',
    );
    await fill('Base URL', gateway.baseUrl + '/');
    await wait(`!${settingsText}.includes('URL changed')`);
    await click('Save');
    await wait(`${row(gw)}.includes('1 model listed · tested today')`);
    assert.deepEqual(
      (await get('/api/settings/endpoints')).find((e) => e.id === gw).name,
      'Team gateway',
    );
    assert.equal(
      gateway.calls.slice(gatewayCalls).at(-1).headers.authorization,
      'Bearer gateway-fixture-secret',
      'rename kept the key',
    );
    assert.equal(
      fake.calls.filter((c) => c.headers.authorization === 'Bearer gateway-fixture-secret').length,
      0,
      'the key never reached another host',
    );
    assert.equal((await saved(nested.id)).provider, gw);
    await click('Edit Team gateway');
    await fill('Name', 'Work gateway');
    await click('Save');
    await wait(`${row(gw)}.includes('Work gateway') && ${row(gw)}.includes('model listed')`);
    await noSecrets();
    pass(
      'inline Edit: URL change warns and requires the key; rename keeps key, id and conversations; save runs a test that clears the failure',
    );

    // Remove asks first; Escape cancels; confirm removes only that endpoint.
    await wait('!!document.querySelector(\'[aria-label="Remove Work gateway"]\')');
    await tabTo('[aria-label="Remove Work gateway"]');
    await browser('press', 'Enter');
    await wait('!!document.querySelector(".endpoint-remove-dialog[open]")');
    const dialog = await evaluate('document.querySelector(".endpoint-remove-dialog").textContent');
    assert.ok(
      dialog.includes('Remove Work gateway?') &&
        dialog.includes('Its saved key is deleted.') &&
        dialog.includes('keep their content'),
    );
    await browser('press', 'Escape');
    await wait('!document.querySelector(".endpoint-remove-dialog[open]")');
    assert.equal((await get('/api/settings/endpoints')).length, 2);
    await tabTo('[aria-label="Remove Work gateway"]');
    await browser('press', 'Enter');
    await wait('!!document.querySelector(".endpoint-remove-dialog[open]")');
    await tabTo('.endpoint-remove-dialog button', 'Remove');
    await browser('press', 'Enter');
    await wait(`${settingsText}.includes('Work gateway removed.')`);
    assert.deepEqual(
      (await get('/api/settings/endpoints')).map((e) => e.name),
      ['Custom endpoint'],
    );
    assert.doesNotMatch(
      readFileSync(join(dir, 'openai-endpoints.json'), 'utf8'),
      /gateway-fixture-secret/,
    );
    assert.equal((await saved(nested.id)).provider, gw, 'removal never silently changes provider');
    pass(
      'Remove asks for confirmation (Escape cancels), then deletes only Work gateway and its key',
    );

    await closeSettings();
    await openConversation('Nested switch fixture');
    const count = (await saved(nested.id)).messages.length;
    await tabTo('[role=textbox][aria-label="Your question"]');
    await browser('keyboard', 'inserttext', 'After removal');
    await browser('press', 'Enter');
    await wait('document.body.textContent.includes("Selected provider is unavailable")');
    assert.equal(
      (await saved(nested.id)).messages.length,
      count + 2,
      'question and failed reply are saved; earlier content kept',
    );
    await modelMenu();
    await menuItem('second-model');
    await wait('document.querySelector(".chat-model").textContent.includes("second-model · ")');
    pass(
      'a conversation on the removed endpoint keeps its content and fails visibly; switching to Custom endpoint repairs it',
    );

    await connectionSettings();
    await tabTo('[aria-label="Remove Custom endpoint"]');
    await browser('press', 'Enter');
    await wait('!!document.querySelector(".endpoint-remove-dialog[open]")');
    await tabTo('.endpoint-remove-dialog button', 'Remove');
    await browser('press', 'Enter');
    await wait(`${settingsText}.includes('No custom endpoints yet')`);
    assert.equal(existsSync(join(dir, 'openai-endpoints.json')), false);
    pass(
      'removing the last endpoint shows the empty state with Add endpoint and leaves no credential file',
    );

    await click('Add endpoint');
    await fill('Name', 'Local llama');
    await fill('Base URL', fake.baseUrl);
    await fill('API key', 'local-fixture-secret');
    await click('Save');
    await wait(`${settingsText}.includes('Local llama added.')`);
    for (const scheme of ['light', 'dark']) {
      await browser('set', 'viewport', '1280', '900');
      await evaluate(`localStorage.setItem('treetutor.appearance', '${scheme}'); true`);
      await browser('reload');
      await browser('wait', '[aria-label="Model for next reply"]');
      await connectionSettings();
      await wait(`document.documentElement.getAttribute('data-theme') === '${scheme}'`);
      for (const [width, height] of [
        [1280, 900],
        [390, 844],
      ]) {
        await browser('set', 'viewport', String(width), String(height));
        await click('Add endpoint');
        await wait('!!document.querySelector(".endpoint-form")');
        assert.ok(
          await evaluate('document.documentElement.scrollWidth <= innerWidth'),
          `${scheme} ${width}: horizontal overflow`,
        );
        await browser(
          'screenshot',
          width === 1280
            ? `docs/verification/custom-endpoints-${scheme}.png`
            : join(dir, `endpoints-${scheme}-${width}.png`),
        );
        await click('Cancel');
        await click('Edit Local llama');
        await wait('!!document.querySelector(".endpoint-form")');
        await fill('Base URL', 'https://moved.example/v1');
        await wait(`${settingsText}.includes('URL changed')`);
        assert.ok(
          await evaluate('document.documentElement.scrollWidth <= innerWidth'),
          `${scheme} ${width}: edit form overflow`,
        );
        await browser(
          'screenshot',
          width === 1280
            ? `docs/verification/custom-endpoints-edit-${scheme}.png`
            : join(dir, `edit-${scheme}-${width}.png`),
        );
        await click('Cancel');
        await click('Remove Local llama');
        await wait('!!document.querySelector(".endpoint-remove-dialog[open]")');
        assert.ok(
          await evaluate(
            '(()=>{const r=document.querySelector(".endpoint-remove-dialog").getBoundingClientRect();return r.width>0&&r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()',
          ),
          `${scheme} ${width}: dialog outside viewport`,
        );
        await browser(
          'screenshot',
          width === 1280
            ? `docs/verification/custom-endpoints-remove-${scheme}.png`
            : join(dir, `remove-${scheme}-${width}.png`),
        );
        await click('Cancel');
        await wait('!document.querySelector(".endpoint-remove-dialog[open]")');
      }
      pass(
        `${scheme}: list, inline add and edit forms and remove dialog fit desktop and 390px without sideways scroll`,
      );
    }
    await noSecrets();
    const result = {
      result: 'PASS',
      mode: 'fixture',
      issues: ['TreeTutor-2li.7', 'TreeTutor-2li.8'],
      date: new Date().toISOString(),
      liveEndpointTested: false,
      serverPids: [firstPid, secondPid],
      checks,
      screenshots: dir,
    };
    writeFileSync(
      'docs/verification/custom-endpoint-settings-results.json',
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      'Fixture checkpoint:',
      dir,
      await browser('snapshot', '-i').catch(() => 'browser unavailable'),
    );
    throw error;
  } finally {
    await browser('close').catch(() => {});
    if (server?.connected) await stop();
    for (const fn of cleanup) await fn();
  }
}
