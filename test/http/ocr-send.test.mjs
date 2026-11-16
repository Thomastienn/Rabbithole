import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { OCR_UNAVAILABLE } from '../../server/ocr.mjs';
import { compactionPrompt } from '../../server/http/jobs/compaction.mjs';

async function start(t, recognize) {
  const dir = mkdtempSync(join(tmpdir(), 'rabbithole-ocr-send-')),
    store = new Store(join(dir, 'trees.sqlite')),
    calls = [];
  const provider = {
    readsImages: false,
    fail: false,
    generate: async (tree, text, emit) => {
      calls.push({ tree, text });
      if (provider.fail) throw new Error('Provider unavailable');
      emit({ type: 'item', item: 'a', text: 'An answer.' });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    dir,
    provider,
    recognize,
    auth: { status: () => ({ connected: true }) },
    log: () => {},
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (id, action, body = {}) =>
    fetch(`${origin}/api/trees/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const upload = (id) => {
    const form = new FormData();
    form.set('text', 'Read this');
    form.append('files', new File(['notes'], 'notes.txt', { type: 'text/plain' }));
    form.append('files', new File(['PNG'], 'scan.png', { type: 'image/png' }));
    return fetch(`${origin}/api/trees/${id}/messages`, {
      method: 'POST',
      headers: { 'X-Rabbithole-CSRF': csrf },
      body: form,
    });
  };
  const id = store.create('OCR', 'codex').id;
  return { dir, store, calls, provider, app, origin, id, post, upload };
}

test('OCR refusal saves nothing; next send recovers; retry follows capability without losing a failed reply', async (t) => {
  let unavailable = true,
    stopped = 0;
  const recognize = Object.assign(
    async (bytes) => {
      assert.equal(Buffer.from(bytes).toString(), 'PNG');
      if (unavailable) throw Object.assign(new Error('download failed'), { unavailable: true });
      return 'Binary heaps';
    },
    { stop: () => stopped++ },
  );
  const { dir, store, calls, provider, app, origin, id, post, upload } = await start(t, recognize);
  const refused = await upload(id);
  assert.equal(refused.status, 400);
  assert.equal((await refused.json()).error, OCR_UNAVAILABLE);
  assert.equal(store.tree(id).messages.length, 0);
  assert.ok(!existsSync(join(dir, 'attachments', id)), 'even the text attachment was not saved');
  assert.equal(calls.length, 0);

  unavailable = false;
  provider.fail = true;
  const stream = await (await upload(id)).text();
  assert.match(stream, /"delivery":"ocr"/);
  assert.match(stream, /"status":"failed"/);
  assert.equal(calls[0].tree.images, undefined);
  assert.equal(
    calls[0].text,
    'Read this\n\n[Attached file: notes.txt]\nnotes\n\n[image: scan.png, read by OCR]\nBinary heaps',
  );
  const [question, failed] = store.tree(id).messages;
  const image = question.attachments[1];
  assert.equal(image.delivery, 'ocr');
  assert.match(compactionPrompt(store.tree(id), 'An answer.'), /read by OCR.*\\nBinary heaps/);
  const asset = await fetch(`${origin}/api/trees/${id}/attachments/${image.id}`);
  assert.equal(asset.headers.get('content-type'), 'image/png');
  assert.equal(await asset.text(), 'PNG', 'chip still opens the original image');

  // Failure during preparation keeps both the failed reply and the original attachment metadata.
  unavailable = true;
  const retryRefused = await post(id, 'retry');
  assert.equal(retryRefused.status, 400);
  assert.equal((await retryRefused.json()).error, OCR_UNAVAILABLE);
  assert.deepEqual(store.tree(id).messages, [question, failed]);

  // A reading model can retry even when OCR is offline, using the original file.
  provider.readsImages = true;
  assert.match(await (await post(id, 'retry')).text(), /"status":"failed"/);
  assert.equal(store.tree(id).messages[0].attachments[1].delivery, 'image');
  assert.equal(
    calls.at(-1).text,
    'Read this\n\n[Attached file: notes.txt]\nnotes\n\n[image: scan.png]',
  );
  assert.equal(calls.at(-1).tree.images[0].path, join(dir, 'attachments', id, image.id));

  // Switching back uses OCR on that same saved image, with no extra question or attachment rows.
  provider.readsImages = false;
  provider.fail = false;
  unavailable = false;
  assert.match(await (await post(id, 'retry')).text(), /"status":"completed"/);
  assert.equal(store.tree(id).messages.length, 2);
  assert.equal(store.tree(id).messages[0].id, question.id);
  assert.equal(store.tree(id).messages[0].attachments[1].delivery, 'ocr');
  assert.equal(calls.at(-1).tree.images, undefined);
  assert.match(calls.at(-1).text, /read by OCR\]\nBinary heaps/);

  await (await post(id, 'messages', { text: 'And then?' })).text();
  assert.match(calls.at(-1).tree.messages[0].text, /read by OCR\]\nBinary heaps/);
  assert.equal(calls.at(-1).tree.images, undefined);
  await app.stop();
  assert.equal(stopped, 1, 'app shutdown stops its OCR worker');
});

test('slow OCR holds the conversation active; Stop cancels before files or messages are saved', async (t) => {
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers();
  const { id, dir, store, calls, post, upload } = await start(t, async () => {
    entered.resolve();
    await release.promise;
    return 'Notes';
  });
  const pending = upload(id);
  t.after(() => release.resolve());
  await entered.promise;
  assert.equal((await post(id, 'messages', { text: 'Duplicate' })).status, 409);
  assert.equal((await post(id, 'stop')).status, 200);
  release.resolve();
  const cancelled = await pending;
  assert.equal(cancelled.status, 409);
  assert.equal((await cancelled.json()).error, 'Send cancelled.');
  assert.equal(store.tree(id).messages.length, 0);
  assert.ok(!existsSync(join(dir, 'attachments', id)));
  assert.equal(calls.length, 0);
});
