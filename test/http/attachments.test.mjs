import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { prepareAttachment, withAttachments } from '../../server/attachments.mjs';
import { OCR_UNAVAILABLE } from '../../server/ocr.mjs';
import { canAttach } from '../../src/chat/attachmentTypes.ts';
import { compactionPrompt } from '../../server/http/jobs/compaction.mjs';

const bytes = (text) => new TextEncoder().encode(text);

test('preparation: a text file becomes one text part with a file-name header', async () => {
  assert.deepEqual(
    await prepareAttachment({
      name: 'notes.py',
      type: 'text/x-python',
      bytes: bytes('print(1)\n'),
    }),
    { delivery: 'text', parts: [{ text: '[Attached file: notes.py]\nprint(1)\n' }] },
  );
  // Code files often arrive with no or misleading media types; UTF-8 content decides.
  assert.equal(
    (await prepareAttachment({ name: 'a.ts', type: 'video/mp2t', bytes: bytes('let a = 1;') }))
      .parts[0].text,
    '[Attached file: a.ts]\nlet a = 1;',
  );
  assert.equal(
    (await prepareAttachment({ name: 'e.txt', type: '', bytes: bytes('') })).delivery,
    'text',
  );
  for (const file of [
    { name: 'b.bin', type: '', bytes: new Uint8Array([0xff, 0xfe, 0x00, 0x81]) },
    { name: 'z.dat', type: 'application/octet-stream', bytes: bytes('a\0b') },
    { name: 'a.gif', type: 'image/gif', bytes: bytes('GIF') },
  ])
    await assert.rejects(
      () => prepareAttachment(file),
      new RegExp(`^Error: ${file.name}: .*plain-text`),
    );
  assert.equal(
    withAttachments('', [{ text: '[Attached file: a]\nA' }, { text: '[Attached file: b]\nB' }]),
    '[Attached file: a]\nA\n\n[Attached file: b]\nB',
  );
  await assert.rejects(
    () =>
      prepareAttachment({ name: 'big.csv', type: 'text/csv', bytes: bytes('x'.repeat(1048577)) }),
    /^Error: big\.csv: this text file is over 1 MB/,
  );
  assert.equal(withAttachments('Why?', []), 'Why?');
  for (const type of ['image/png', 'image/jpeg', 'image/webp'])
    assert.deepEqual(await prepareAttachment({ name: 'p', type, bytes: bytes('IMG') }), {
      delivery: 'image',
      parts: [{ text: '[image: p]', image: true }],
    });
});

test('the composer’s accepted types agree with what the server prepares', async () => {
  const accepts = (file) =>
    prepareAttachment(file).then(
      () => true,
      () => false,
    );
  const text = bytes('notes\n'),
    binary = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0xff]);
  // Browser-accepted text types are read by the server; refused ones are binary in practice.
  for (const type of ['text/plain', 'text/markdown', 'text/x-python', 'application/json', ''])
    assert.ok(canAttach(type) && (await accepts({ name: 'f', type, bytes: text })), type);
  for (const type of ['image/png', 'image/jpeg', 'image/webp'])
    assert.ok(canAttach(type) && (await accepts({ name: 'f', type, bytes: binary })), type);
  for (const type of [
    'image/gif',
    'image/svg+xml',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ])
    assert.ok(!canAttach(type) && !(await accepts({ name: 'f', type, bytes: binary })), type);
  assert.ok(canAttach('application/pdf'), 'PDFs are prepared by pdfParts');
});

test('multipart send stores text attachments, delivers them, serves them safely and deletes them with the conversation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'rabbithole-attachments-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const calls = [],
    titles = [];
  const chat = {
    generate: async (tree, text, emit) => {
      calls.push({ tree, text });
      emit({ type: 'item', item: 'a', text: 'An answer.' });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const quick = {
    models: async () => [{ model: 'quick-model', efforts: ['low'] }],
    generate: async (tree, text, emit) => {
      titles.push(text);
      emit({ type: 'item', item: 't', text: 'Heap notes' });
      emit({ type: 'status', status: 'completed' });
    },
  };
  const app = createApp({
    store,
    dir,
    providers: { codex: chat, claude: quick },
    auth: { status: () => ({ connected: true }) },
    log: () => {},
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (route, body) =>
    fetch(`${origin}/api/trees${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const upload = (route, text, files) => {
    const form = new FormData();
    form.set('text', text);
    form.set('theme', JSON.stringify({ name: 'paper', mode: 'light' }));
    for (const [name, content, type] of files)
      form.append('files', new File([content], name, { type }));
    return fetch(`${origin}/api/trees${route}`, {
      method: 'POST',
      headers: { 'X-Rabbithole-CSRF': csrf },
      body: form,
    });
  };
  const create = async () => (await (await post('', {})).json()).id;

  // JSON send is unchanged.
  const plain = await create();
  assert.match(await (await post(`/${plain}/messages`, { text: 'Hi' })).text(), /"completed"/);
  assert.equal(calls.at(-1).text, 'Hi');
  assert.equal(store.tree(plain).messages[0].attachments, undefined);

  // Unsupported types are refused before anything is saved.
  const refused = await create();
  const bad = await upload(`/${refused}/messages`, 'Look', [
    ['ok.txt', 'fine', 'text/plain'],
    ['anim.gif', 'GIF', 'image/gif'],
  ]);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /^anim\.gif: .*plain-text file/);
  assert.equal(store.tree(refused).messages.length, 0);
  assert.equal(calls.length, 1);
  assert.ok(!existsSync(join(dir, 'attachments', refused)));
  // An oversized or unsized upload is refused from its headers, before the body is buffered.
  for (const length of [String(50 * 1024 * 1024 + 1), undefined]) {
    const status = await new Promise((resolve, reject) => {
      const request = http.request(`${origin}/api/trees/${refused}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=x',
          'X-Rabbithole-CSRF': csrf,
          ...(length ? { 'Content-Length': length } : { 'Transfer-Encoding': 'chunked' }),
        },
      });
      request
        .on('response', (response) => {
          resolve(response.statusCode);
          request.destroy();
        })
        .on('error', reject);
      request.flushHeaders();
    });
    assert.equal(status, 413, length);
  }

  // Multipart send stores the file and delivers its text after the question.
  store.saveSuggestionSettings({
    enabled: false,
    model: { provider: 'claude', model: 'quick-model' },
    effort: 'low',
  });
  const id = await create();
  const sent = await upload(`/${id}/messages`, 'Explain this', [
    ['heap.py', 'def push(h, x): ...\n', 'text/x-python'],
  ]);
  const stream = await sent.text();
  assert.match(stream, /"status":"completed"/);
  assert.match(stream, /"attachments":\[\{"id":"[^"]+","name":"heap.py"/);
  assert.equal(
    calls.at(-1).text,
    'Explain this\n\n[Attached file: heap.py]\ndef push(h, x): ...\n',
  );
  const [question] = store.tree(id).messages;
  assert.equal(question.text, 'Explain this');
  const [attachment] = question.attachments;
  assert.deepEqual(
    { ...attachment, id: undefined },
    {
      id: undefined,
      name: 'heap.py',
      type: 'text/x-python',
      size: 20,
      delivery: 'text',
      text: '[Attached file: heap.py]\ndef push(h, x): ...\n',
    },
  );
  assert.deepEqual(readdirSync(join(dir, 'attachments', id)), [attachment.id]);

  // The client sees chips, not the prepared text.
  const saved = await (await fetch(`${origin}/api/trees/${id}`)).json();
  assert.deepEqual(saved.messages[0].attachments, [
    { id: attachment.id, name: 'heap.py', type: 'text/x-python', size: 20, delivery: 'text' },
  ]);

  // Later turns without a thread carry the attachment text in history.
  store.forgetThread(id);
  await (await post(`/${id}/messages`, { text: 'And pop?' })).text();
  assert.match(calls.at(-1).tree.messages[0].text, /\[Attached file: heap.py\]\ndef push/);
  assert.equal(calls.at(-1).tree.messages[0].attachments, undefined);

  // Compaction receives the attachment text.
  assert.match(compactionPrompt(store.tree(id), 'An answer.'), /\[Attached file: heap.py\]/);

  // Asset route: scoped to the conversation, inert content type and disposition.
  const asset = await fetch(`${origin}/api/trees/${id}/attachments/${attachment.id}`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(
    asset.headers.get('content-disposition'),
    `inline; filename="heap.py"; filename*=UTF-8''heap.py`,
  );
  assert.equal(asset.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  assert.equal(asset.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await asset.text(), 'def push(h, x): ...\n');
  assert.equal(
    (await fetch(`${origin}/api/trees/${plain}/attachments/${attachment.id}`)).status,
    404,
  );

  // Attachment-only first question: placeholder is the file name, the title job reads the text.
  await app.settled();
  const only = await create();
  titles.length = 0;
  const onlyStream = await (
    await upload(`/${only}/messages`, '', [['Lecture 3.md', '# Binary heaps', 'text/markdown']])
  ).text();
  assert.match(onlyStream, /"title":"Lecture 3.md"/);
  await app.settled();
  assert.match(titles[0], /"question":"\[Attached file: Lecture 3.md\]\\n# Binary heaps"/);
  assert.equal(store.tree(only).title, 'Heap notes');
  assert.equal(
    (await upload(`/${only}/messages`, ' ', [])).status,
    400,
    'no text and no files is still refused',
  );

  // Deleting the conversation removes its rows and folder.
  const removed = await post(`/${id}/delete`, { conversation: id });
  assert.equal(removed.status, 200);
  assert.ok(!existsSync(join(dir, 'attachments', id)));
  assert.equal(
    store.db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE conversation=?').get(id).n,
    0,
  );
  assert.equal((await fetch(`${origin}/api/trees/${id}/attachments/${attachment.id}`)).status, 404);
});

test('native images reach reading models and become history placeholders; OCR-unavailable refuses atomically', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'rabbithole-images-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const calls = [];
  const reader = (readsImages) => ({
    readsImages,
    generate: async (tree, text, emit) => {
      calls.push({ tree, text });
      emit({ type: 'item', item: 'a', text: 'Red.' });
      emit({ type: 'status', status: 'completed' });
    },
  });
  const app = createApp({
    store,
    dir,
    providers: { codex: reader(true), claude: reader(false) },
    recognize: async () => {
      throw Object.assign(new Error('download failed'), { unavailable: true });
    },
    auth: { status: () => ({ connected: true }) },
    log: () => {},
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    app.stop();
    store.close();
  });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  const post = (route, body) =>
    fetch(`${origin}/api/trees${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
      body: JSON.stringify(body),
    });
  const upload = (route, text, files) => {
    const form = new FormData();
    form.set('text', text);
    for (const [name, content, type] of files)
      form.append('files', new File([content], name, { type }));
    return fetch(`${origin}/api/trees${route}`, {
      method: 'POST',
      headers: { 'X-Rabbithole-CSRF': csrf },
      body: form,
    });
  };
  const create = async (provider) => {
    const id = (await (await post('', {})).json()).id;
    store.switchProvider(id, provider, 'm');
    return id;
  };

  // A model that cannot read images refuses the send with the reason; nothing is saved.
  const blind = await create('claude');
  const refused = await upload(`/${blind}/messages`, 'What colour?', [
    ['red.png', 'PNG', 'image/png'],
  ]);
  assert.equal(refused.status, 400);
  assert.equal((await refused.json()).error, OCR_UNAVAILABLE);
  assert.equal(store.tree(blind).messages.length, 0);
  assert.ok(!existsSync(join(dir, 'attachments', blind)));
  assert.equal(calls.length, 0);

  // A model that reads images gets this turn's stored file as an image part.
  const id = await create('codex');
  const stream = await (
    await upload(`/${id}/messages`, 'What colour?', [['red.png', 'PNG', 'image/png']])
  ).text();
  assert.match(stream, /"status":"completed"/);
  const [attachment] = store.tree(id).messages[0].attachments;
  assert.equal(attachment.delivery, 'image');
  assert.equal(calls[0].text, 'What colour?\n\n[image: red.png]');
  assert.deepEqual(calls[0].tree.images, [
    { name: 'red.png', type: 'image/png', path: join(dir, 'attachments', id, attachment.id) },
  ]);

  // Later turns send no image; history names it.
  store.forgetThread(id);
  await (await post(`/${id}/messages`, { text: 'Sure?' })).text();
  assert.equal(calls[1].tree.images, undefined);
  assert.equal(calls[1].tree.messages[0].text, 'What colour?\n\n[image: red.png]');

  // The chip opens the image inline under the sandboxed asset route.
  const asset = await fetch(`${origin}/api/trees/${id}/attachments/${attachment.id}`);
  assert.equal(asset.headers.get('content-type'), 'image/png');
  assert.match(asset.headers.get('content-disposition'), /^inline; filename="red.png"/);
  assert.equal(asset.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  assert.equal(await asset.text(), 'PNG');
});
