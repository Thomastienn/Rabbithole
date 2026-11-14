import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAI } from '../../server/providers/openai.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';

async function open(t, dir) {
  const store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({
    store,
    dir,
    endpoint: new OpenAI(dir),
    providers: {},
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: false }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    bodies = [];
  const read = async (response) => {
    const text = await response.text();
    bodies.push(text);
    return { status: response.status, text, json: () => JSON.parse(text) };
  };
  const get = async (path) => read(await fetch(origin + path));
  const { csrf } = (await get('/api/state')).json();
  const post = async (path, body = {}) =>
    read(
      await fetch(origin + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(body),
      }),
    );
  let closing;
  const close = () => (closing ??= app.stop().then(() => store.close()));
  t.after(close);
  return { store, get, post, bodies, close };
}

test('several named endpoints are added, listed, used side by side, labelled in menus and removed one at a time', async (t) => {
  const local = await fakeOpenAI(t),
    gateway = await fakeOpenAI(t),
    dir = mkdtempSync(join(tmpdir(), 'tt-endpoints-'));
  gateway.models = [{ id: 'gateway-model' }];
  gateway.reply = (req, res) => streamReply(res, ['From gateway.']);
  const keys = ['local-endpoint-secret-1', 'gateway-endpoint-secret-2'];
  let env = await open(t, dir);
  assert.deepEqual((await env.get('/api/settings/endpoints')).json(), []);

  const first = await env.post('/api/settings/endpoints', {
    name: ' Local llama ',
    baseUrl: local.baseUrl,
    apiKey: keys[0],
  });
  assert.equal(first.status, 200);
  const [added] = first.json();
  assert.match(added.id, /^openai:[0-9a-f-]{36}$/);
  assert.deepEqual(added, {
    id: added.id,
    name: 'Local llama',
    baseUrl: local.baseUrl,
    acceptsImages: false,
    lastTest: null,
  });
  // Accepts images is saved through the settings route and turned off again.
  for (const acceptsImages of [true, false]) {
    const flagged = await env.post('/api/settings/endpoints/edit', {
      id: added.id,
      name: 'Local llama',
      baseUrl: local.baseUrl,
      acceptsImages,
    });
    assert.equal(flagged.json().find((e) => e.id === added.id).acceptsImages, acceptsImages);
  }
  const duplicate = await env.post('/api/settings/endpoints', {
    name: 'local LLAMA',
    baseUrl: gateway.baseUrl,
    apiKey: keys[1],
  });
  assert.equal(duplicate.status, 400);
  assert.equal(
    duplicate.json().error,
    'Another endpoint is called local LLAMA. Choose a different name.',
  );
  for (const body of [
    { baseUrl: gateway.baseUrl, apiKey: keys[1] },
    { name: '', baseUrl: gateway.baseUrl, apiKey: keys[1] },
    { name: 'Gateway', baseUrl: 'file:///tmp', apiKey: keys[1] },
    { name: keys[1], baseUrl: gateway.baseUrl, apiKey: keys[1] },
  ])
    assert.equal(
      (await env.post('/api/settings/endpoints', body)).status,
      400,
      JSON.stringify(body),
    );
  const second = (
    await env.post('/api/settings/endpoints', {
      name: 'Work gateway',
      baseUrl: gateway.baseUrl,
      apiKey: keys[1],
    })
  ).json()[1];
  assert.equal(local.calls.length + gateway.calls.length, 0, 'adding contacts no endpoint');

  // Each endpoint is its own provider, named by the server for every menu.
  const catalogue = (await env.get('/api/models')).json();
  assert.deepEqual(catalogue.providers[added.id], { label: 'Local llama', connected: true });
  assert.deepEqual(catalogue.providers[second.id], { label: 'Work gateway', connected: true });
  assert.deepEqual(
    catalogue.providers.openai,
    { label: 'Custom endpoint', connected: false },
    'the settings group stays when no migrated endpoint exists',
  );
  assert.deepEqual(
    catalogue.models
      .filter((m) => m.provider.startsWith('openai:'))
      .map((m) => [m.provider, m.model]),
    [
      [added.id, 'local-tutor'],
      [added.id, 'second-model'],
      [second.id, 'gateway-model'],
    ],
  );

  const localTree = env.store.create('Local', added.id, 'local-tutor'),
    gatewayTree = env.store.create('Gateway', second.id, 'gateway-model');
  assert.match(
    (await env.post(`/api/trees/${localTree.id}/messages`, { text: 'Hi local' })).text,
    /uses two flags.*"status":"completed"/s,
  );
  assert.match(
    (await env.post(`/api/trees/${gatewayTree.id}/messages`, { text: 'Hi gateway' })).text,
    /From gateway.*"status":"completed"/s,
  );
  assert.deepEqual(
    [local, gateway].map((f) =>
      f.calls.filter((c) => c.body).map((c) => [c.headers.authorization, c.body.model]),
    ),
    [[[`Bearer ${keys[0]}`, 'local-tutor']], [[`Bearer ${keys[1]}`, 'gateway-model']]],
  );

  // The list persists across restart, keys stay in the owner-only file only.
  await env.close();
  env = await open(t, dir);
  assert.deepEqual((await env.get('/api/settings/endpoints')).json(), [added, second]);
  const path = join(dir, 'openai-endpoints.json');
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(
    JSON.parse(readFileSync(path, 'utf8')).map((e) => e.apiKey),
    keys,
  );

  assert.equal(
    (await env.post('/api/settings/endpoints/remove', { id: 'openai:missing' })).status,
    400,
  );
  assert.deepEqual((await env.post('/api/settings/endpoints/remove', { id: added.id })).json(), [
    second,
  ]);
  assert.doesNotMatch(readFileSync(path, 'utf8'), new RegExp(keys[0]), 'remove deletes the key');
  const providers = (await env.get('/api/models')).json().providers;
  assert.equal(providers[added.id], undefined);
  assert.equal(providers[second.id].label, 'Work gateway');
  const failed = (await env.post(`/api/trees/${localTree.id}/messages`, { text: 'After remove' }))
    .text;
  assert.match(failed, /Selected provider is unavailable/);
  assert.match(failed, /"status":"failed"/);
  assert.equal(
    env.store.tree(localTree.id).messages[0].text,
    'Hi local',
    'conversation keeps its content',
  );
  assert.match(
    (await env.post(`/api/trees/${gatewayTree.id}/messages`, { text: 'Still here' })).text,
    /"status":"completed"/,
  );
  assert.deepEqual(
    (await env.post('/api/settings/endpoints/remove', { id: second.id })).json(),
    [],
  );
  assert.equal(existsSync(path), false, 'no credential file lingers after the last remove');

  for (const body of env.bodies)
    for (const key of keys) assert.ok(!body.includes(key), 'keys never appear in a response');
});

test('upgrade turns the single saved endpoint into "Custom endpoint" with provider id openai and its conversations keep working', async (t) => {
  const fake = await fakeOpenAI(t),
    dir = mkdtempSync(join(tmpdir(), 'tt-endpoints-migrate-'));
  writeFileSync(
    join(dir, 'openai-endpoint.json'),
    JSON.stringify({ baseUrl: fake.baseUrl, apiKey: 'legacy-endpoint-secret' }),
    { mode: 0o600 },
  );
  const env = await open(t, dir);
  assert.deepEqual((await env.get('/api/settings/endpoints')).json(), [
    {
      id: 'openai',
      name: 'Custom endpoint',
      baseUrl: fake.baseUrl,
      acceptsImages: false,
      lastTest: null,
    },
  ]);
  assert.equal(
    existsSync(join(dir, 'openai-endpoint.json')),
    false,
    'the old file is read once and replaced',
  );
  assert.equal(statSync(join(dir, 'openai-endpoints.json')).mode & 0o777, 0o600);
  assert.deepEqual((await env.get('/api/models')).json().providers.openai, {
    label: 'Custom endpoint',
    connected: true,
  });
  const tree = env.store.create('Saved', 'openai', 'local-tutor');
  assert.match(
    (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Still works' })).text,
    /"status":"completed"/,
  );
  const next = (
    await env.post('/api/settings/endpoints', {
      name: 'Second',
      baseUrl: fake.baseUrl,
      apiKey: 'second-endpoint-secret',
    })
  ).json();
  assert.deepEqual(
    next.map((e) => e.name),
    ['Custom endpoint', 'Second'],
  );
  assert.match(next[1].id, /^openai:/);
  assert.equal(
    (
      await env.post('/api/settings/endpoints', {
        name: 'custom endpoint',
        baseUrl: fake.baseUrl,
        apiKey: 'third-endpoint-secret',
      })
    ).status,
    400,
  );
  for (const body of env.bodies)
    assert.ok(!/legacy-endpoint-secret|second-endpoint-secret/.test(body));
});

test('rename keeps the key, a URL change needs the key again, tests persist their result and an edit aborts in-flight requests', async (t) => {
  const fake = await fakeOpenAI(t),
    moved = await fakeOpenAI(t),
    dir = mkdtempSync(join(tmpdir(), 'tt-endpoints-edit-'));
  const key = 'edit-endpoint-secret-1',
    newKey = 'edit-endpoint-secret-2';
  let env = await open(t, dir);
  const [added, other] = (
    await env.post('/api/settings/endpoints', { name: 'Local', baseUrl: fake.baseUrl, apiKey: key })
  )
    .json()
    .concat(
      (
        await env.post('/api/settings/endpoints', {
          name: 'Other',
          baseUrl: moved.baseUrl,
          apiKey: newKey,
        })
      )
        .json()
        .slice(1),
    );
  const tree = env.store.create('Edited', added.id, 'local-tutor');

  // Rename without a key keeps the id, the key and the conversation.
  const renamed = await env.post('/api/settings/endpoints/edit', {
    id: added.id,
    name: 'Local llama',
    baseUrl: fake.baseUrl,
  });
  assert.equal(renamed.status, 200);
  assert.deepEqual(renamed.json()[0], {
    id: added.id,
    name: 'Local llama',
    baseUrl: fake.baseUrl,
    acceptsImages: false,
    lastTest: null,
  });
  assert.equal((await env.get('/api/models')).json().providers[added.id].label, 'Local llama');
  assert.match(
    (await env.post(`/api/trees/${tree.id}/messages`, { text: 'After rename' })).text,
    /"status":"completed"/,
  );
  assert.equal(fake.calls.at(-1).headers.authorization, `Bearer ${key}`);
  assert.equal(
    (
      await env.post('/api/settings/endpoints/edit', {
        id: added.id,
        name: 'other',
        baseUrl: fake.baseUrl,
      })
    ).json().error,
    'Another endpoint is called other. Choose a different name.',
  );
  assert.equal(
    (
      await env.post('/api/settings/endpoints/edit', {
        id: 'openai:missing',
        name: 'X',
        baseUrl: fake.baseUrl,
      })
    ).status,
    400,
  );

  // A new host without the key is refused and contacts nobody.
  const calls = moved.calls.length;
  const refused = await env.post('/api/settings/endpoints/edit', {
    id: added.id,
    name: 'Local llama',
    baseUrl: moved.baseUrl,
  });
  assert.equal(refused.status, 400);
  assert.equal(
    refused.json().error,
    'The base URL changed. Enter the API key again so the saved key is never sent to a new host.',
  );
  assert.equal(moved.calls.length, calls);
  assert.equal(
    JSON.parse(readFileSync(join(dir, 'openai-endpoints.json'), 'utf8'))[0].baseUrl,
    fake.baseUrl,
  );

  // Test success records the model count and time; failure stays across restart until a save.
  const tested = (await env.post('/api/settings/endpoints/test', { id: added.id })).json()[0]
    .lastTest;
  assert.equal(tested.ok, true);
  assert.equal(tested.models, 2);
  assert.ok(Date.parse(tested.at));
  assert.equal(fake.calls.at(-1).path, '/v1/models', 'testing sends no chat message');
  fake.modelStatus = 401;
  const failed = (await env.post('/api/settings/endpoints/test', { id: added.id })).json()[0]
    .lastTest;
  assert.deepEqual(
    [failed.ok, failed.error],
    [false, 'Custom endpoint rejected the API key. Check endpoint settings.'],
  );
  assert.equal(
    (await env.post('/api/settings/endpoints/test', { id: 'openai:missing' })).status,
    400,
  );
  await env.close();
  env = await open(t, dir);
  assert.deepEqual(
    (await env.get('/api/settings/endpoints')).json()[0].lastTest,
    failed,
    'the failed test survives a restart',
  );
  assert.equal(
    (await env.get('/api/settings/endpoints')).json()[1].lastTest,
    null,
    'results belong to their own endpoint',
  );

  // A URL change with the key moves the endpoint, clears the old result and aborts the in-flight reply.
  let started;
  const replying = new Promise((resolve) => {
    started = resolve;
  });
  fake.modelStatus = 200;
  fake.reply = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': open\n\n');
    started();
  };
  const stream = env.post(`/api/trees/${tree.id}/messages`, { text: 'In flight' });
  await replying;
  const edited = (
    await env.post('/api/settings/endpoints/edit', {
      id: added.id,
      name: 'Local llama',
      baseUrl: moved.baseUrl,
      apiKey: newKey,
    })
  ).json()[0];
  assert.deepEqual(edited, {
    id: added.id,
    name: 'Local llama',
    baseUrl: moved.baseUrl,
    acceptsImages: false,
    lastTest: null,
  });
  assert.match((await stream).text, /"status":"interrupted"/);
  assert.match(
    (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Moved' })).text,
    /"status":"completed"/,
  );
  assert.equal(moved.calls.at(-1).headers.authorization, `Bearer ${newKey}`);
  assert.ok(
    !JSON.stringify(fake.calls.slice(-1)).includes(newKey),
    'the new key never reached the old host',
  );
  for (const body of env.bodies)
    for (const k of [key, newKey]) assert.ok(!body.includes(k), 'keys never appear in a response');
});
