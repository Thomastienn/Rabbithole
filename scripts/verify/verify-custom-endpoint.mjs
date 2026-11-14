// Real built UI, HTTP, storage and keyboard focus; provider replies are synthetic fixtures.
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
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
} from './lib/custom-endpoint-fixture.mjs';

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
  setGateway(list[1].id);
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
    await evaluate(`!!document.querySelector('.endpoint-row[data-endpoint="${gw}"] [role=alert]')`),
    'failure is announced: ' +
      (await evaluate(`document.querySelector('.endpoint-row[data-endpoint="${gw}"]').outerHTML`)),
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
  pass('a failed test shows the failure with what to do, stays after reload and offers Test again');

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
  pass('Remove asks for confirmation (Escape cancels), then deletes only Work gateway and its key');

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
