import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI } from '../support/fake-openai.mjs';

const LEGACY = 'openai:00000000-0000-4000-8000-000000000000';

async function launch(t, dir) {
  const store = new Store(join(dir, 'trees.sqlite'));
  const app = createApp({
    store,
    dir,
    endpoint: new OpenAI(dir),
    providers: {},
    defaultProvider: 'claude',
    recognize: async () => 'Binary heaps',
    auth: { status: () => ({ connected: false }) },
    log: () => {},
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await app.stop();
    store.close();
  };
  t.after(stop);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (path, body) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const upload = async (provider, model) => {
    const id = store.create('Images', provider, model).id;
    const form = new FormData();
    form.set('text', 'Read this');
    form.append('files', new File(['PNG'], 'scan.png', { type: 'image/png' }));
    const stream = await (
      await fetch(`${origin}/api/trees/${id}/messages`, {
        method: 'POST',
        headers: { 'X-Rabbithole-CSRF': csrf },
        body: form,
      })
    ).text();
    return stream.match(/"delivery":"(\w+)"/)?.[1];
  };
  const reads = async () =>
    Object.fromEntries(
      (await (await fetch(`${origin}/api/models`)).json()).models.map((m) => [
        `${m.provider === LEGACY ? 'old' : 'new'}/${m.model}`,
        m.readsImages,
      ]),
    );
  return { store, post, upload, reads, stop };
}

test('reads images per endpoint model: override, else reported vision, else the old endpoint flag; overrides survive restart', async (t) => {
  const fake = await fakeOpenAI(t);
  fake.models = [
    { id: 'seeing', capabilities: { vision: true } },
    { id: 'blind', capabilities: { vision: false } },
    { id: 'unreported' },
  ];
  const dir = mkdtempSync(join(tmpdir(), 'tt-model-images-'));
  // One endpoint saved by an older build with Accepts images on; one added now (flag off).
  writeFileSync(
    join(dir, 'openai-endpoints.json'),
    JSON.stringify([
      { id: LEGACY, name: 'Old', baseUrl: fake.baseUrl, apiKey: 'key-1', acceptsImages: true },
    ]),
    { mode: 0o600 },
  );
  let env = await launch(t, dir);
  const added = (
    await (
      await env.post('/api/settings/endpoints', {
        name: 'New',
        baseUrl: fake.baseUrl,
        apiKey: 'key-2',
      })
    ).json()
  ).find((e) => e.name === 'New');
  assert.deepEqual(await env.reads(), {
    'old/seeing': true,
    'old/blind': false,
    'old/unreported': true,
    'new/seeing': true,
    'new/blind': false,
    'new/unreported': false,
  });

  const listings = () =>
    fake.calls.filter(
      (c) => c.path.endsWith('/models') && c.headers.authorization === 'Bearer key-2',
    ).length;
  const listed = listings();
  // Without any setup a reported vision model receives the image; a non-vision one receives OCR text.
  assert.equal(await env.upload(added.id, 'seeing'), 'image');
  assert.match(JSON.stringify(fake.calls.at(-1).body.messages.at(-1)), /image_url/);
  assert.equal(await env.upload(added.id, 'blind'), 'ocr');
  assert.match(fake.calls.at(-1).body.messages.at(-1).content, /read by OCR\]\nBinary heaps/);
  // Unreported models follow the endpoint's old flag; a conversation without a model uses the default one.
  assert.equal(await env.upload(LEGACY, 'unreported'), 'image');
  assert.equal(await env.upload(added.id, 'unreported'), 'ocr');
  // Sends reuse the catalogue the first send fetched instead of listing models before every reply.
  assert.equal(listings() - listed, 1);
  assert.equal(await env.upload(added.id, null), 'image');

  // An override wins over the reported capability.
  for (const [model, readsImages] of [
    ['seeing', false],
    ['blind', true],
  ])
    assert.equal(
      (await env.post('/api/settings/endpoints/model', { id: added.id, model, readsImages }))
        .status,
      200,
    );
  for (const body of [
    { id: 'openai:missing', model: 'seeing', readsImages: true },
    { id: added.id, model: '', readsImages: true },
    { id: added.id, model: 'seeing', readsImages: 'yes' },
  ])
    assert.equal((await env.post('/api/settings/endpoints/model', body)).status, 400);
  assert.equal(await env.upload(added.id, 'seeing'), 'ocr');

  await env.stop();
  env = await launch(t, dir);
  assert.equal((await env.reads())['new/seeing'], false);
  assert.equal((await env.reads())['new/blind'], true);
  assert.equal(await env.upload(added.id, 'blind'), 'image');

  // Removing the endpoint forgets its overrides.
  await env.post('/api/settings/endpoints/remove', { id: added.id });
  assert.equal(env.store.readsImagesOverride(added.id, 'blind'), null);
});

test('store: reads images override is null until chosen, then replaced, and forgotten per endpoint', () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-model-images-store-')), 't.sqlite'));
  assert.equal(store.readsImagesOverride('openai:a', 'm'), null);
  store.setReadsImages('openai:a', 'm', true);
  store.setReadsImages('openai:b', 'm', true);
  store.setReadsImages('openai:a', 'm', false);
  assert.equal(store.readsImagesOverride('openai:a', 'm'), false);
  store.forgetModels('openai:a');
  assert.equal(store.readsImagesOverride('openai:a', 'm'), null);
  assert.equal(store.readsImagesOverride('openai:b', 'm'), true);
  store.close();
});

test('store: uses tutor tools override and tool switches are independent and survive restart', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'tt-model-tools-store-')), 't.sqlite');
  let store = new Store(file);
  assert.equal(store.usesTutorToolsOverride('openai:a', 'm'), null);
  assert.deepEqual(store.tutorTools(), {});
  store.setReadsImages('openai:a', 'm', true);
  assert.equal(store.usesTutorToolsOverride('openai:a', 'm'), null, 'reads images leaves it unset');
  store.setUsesTutorTools('openai:a', 'm', false);
  store.saveTutorTool('read_page', false);
  store.saveTutorTool('web_search', true);
  store.close();
  store = new Store(file);
  assert.equal(store.usesTutorToolsOverride('openai:a', 'm'), false);
  assert.equal(store.readsImagesOverride('openai:a', 'm'), true);
  assert.deepEqual(store.tutorTools(), { read_page: false, web_search: true });
  store.forgetModels('openai:a');
  assert.equal(store.usesTutorToolsOverride('openai:a', 'm'), null);
  store.close();
});
