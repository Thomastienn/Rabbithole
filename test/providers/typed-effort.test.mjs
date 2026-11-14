import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeOpenAI } from '../support/fake-openai.mjs';
import { open } from '../support/openai-kit.mjs';

test('typed custom endpoint efforts are validated, sent unchanged, remembered per model, saved in profiles and deleted with the endpoint', async (t) => {
  const fake = await fakeOpenAI(t);
  fake.models[0].supported_reasoning_efforts = ['low'];
  const claude = {
    models: async () => [{ model: 'sonnet', label: 'Sonnet', isDefault: true, efforts: ['high'] }],
    generate: async () => {},
  };
  const { get, post, store } = await open(t, { claude });
  const [{ id }] = await (
    await post('/api/settings/endpoints', {
      name: 'Gateway',
      baseUrl: fake.baseUrl,
      apiKey: 'typed-effort-fixture-key',
    })
  ).json();
  const model = 'local-tutor';
  const chat = (provider, model, effort) => post('/api/settings/chat', { provider, model, effort });

  for (const effort of ['', ' max', 'a b', 'bad!', 'x'.repeat(33), 7])
    assert.equal((await chat(id, model, effort)).status, 400, JSON.stringify(effort));
  assert.equal((await chat('claude', 'sonnet', 'vendor_max')).status, 400, 'Claude stays listed');
  assert.equal((await chat('claude', 'sonnet', 'high')).status, 200);
  assert.equal((await chat(id, model, 'vendor_max-2')).status, 200);
  assert.equal((await chat(id, model, 'low')).status, 200, 'advertised efforts are not stored');
  assert.deepEqual(store.typedEfforts(id, model), ['vendor_max-2']);

  const listed = (await (await get('/api/models')).json()).models.filter((m) => m.provider === id);
  assert.deepEqual(
    listed.map((m) => [m.model, m.efforts]),
    [
      [model, ['low', 'vendor_max-2']],
      ['second-model', []],
    ],
    'remembered efforts follow advertised ones, only for their own model',
  );

  // Every role save path accepts a typed effort; profiles keep it across switches.
  assert.equal((await chat(id, model, 'X1')).status, 200);
  const smart = { model: { provider: id, model }, followEffort: false, effort: 'deep' };
  assert.equal((await post('/api/settings/smart', smart)).status, 200);
  const quick = { model: { provider: id, model }, effort: 'quick_1' };
  assert.equal((await post('/api/settings/suggestions', quick)).status, 200);
  const first = (await (await get('/api/profiles')).json()).active;
  const other = (await (await post('/api/profiles', { name: 'Other' })).json()).profiles.find(
    (p) => p.name === 'Other',
  ).id;
  await post('/api/profiles/active', { id: other });
  assert.equal((await chat(id, model, 'Y2')).status, 200);
  await post('/api/profiles/active', { id: first });
  assert.equal((await (await get('/api/settings/chat')).json()).effort, 'X1');
  assert.equal((await (await get('/api/settings/smart')).json()).effort, 'deep');
  assert.equal((await (await get('/api/settings/suggestions')).json()).effort, 'quick_1');

  // A conversation's typed effort reaches reasoning_effort unchanged.
  const root = await (await post('/api/trees')).json();
  const move = await post(`/api/trees/${root.id}/model`, {
    provider: id,
    model,
    effort: 'Turbo-9',
  });
  assert.equal(move.status, 200);
  assert.match(
    await (await post(`/api/trees/${root.id}/messages`, { text: 'Explain' })).text(),
    /"status":"completed"/,
  );
  assert.equal(fake.calls.filter((c) => c.body).at(-1).body.reasoning_effort, 'Turbo-9');

  // The endpoint's rejection shows in the reply and the selection stays.
  fake.reply = (req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end('{"error":{"message":"unknown reasoning_effort"}}');
  };
  assert.match(
    await (await post(`/api/trees/${root.id}/messages`, { text: 'Again' })).text(),
    /rejected the request \(HTTP 400\)/,
  );
  assert.equal(store.tree(root.id).effort, 'Turbo-9');

  assert.ok(store.typedEfforts(id, model).length);
  assert.equal((await post('/api/settings/endpoints/remove', { id })).status, 200);
  assert.deepEqual(store.typedEfforts(id, model), [], 'deleting the endpoint deletes its efforts');
});
