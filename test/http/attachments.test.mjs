import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { prepareAttachment, withAttachments } from '../../server/attachments.mjs';
import { compactionPrompt } from '../../server/http/jobs/compaction.mjs';

const bytes = (text) => new TextEncoder().encode(text);

test('preparation: a text file becomes one text part with a file-name header', () => {
  assert.deepEqual(
    prepareAttachment({ name: 'notes.py', type: 'text/x-python', bytes: bytes('print(1)\n') }),
    { delivery: 'text', parts: [{ text: '[Attached file: notes.py]\nprint(1)\n' }] },
  );
  // Code files often arrive with no or misleading media types; UTF-8 content decides.
  assert.equal(
    prepareAttachment({ name: 'a.ts', type: 'video/mp2t', bytes: bytes('let a = 1;') }).parts[0]
      .text,
    '[Attached file: a.ts]\nlet a = 1;',
  );
  assert.equal(prepareAttachment({ name: 'e.txt', type: '', bytes: bytes('') }).delivery, 'text');
  for (const file of [
    { name: 'b.bin', type: '', bytes: new Uint8Array([0xff, 0xfe, 0x00, 0x81]) },
    { name: 'z.dat', type: 'application/octet-stream', bytes: bytes('a\0b') },
    { name: 'p.png', type: 'image/png', bytes: bytes('PNG') },
  ])
    assert.throws(() => prepareAttachment(file), new RegExp(`^Error: ${file.name}: .*plain-text`));
  assert.equal(
    withAttachments('', [{ text: '[Attached file: a]\nA' }, { text: '[Attached file: b]\nB' }]),
    '[Attached file: a]\nA\n\n[Attached file: b]\nB',
  );
  assert.equal(withAttachments('Why?', []), 'Why?');
});

test('multipart send stores text attachments, delivers them, serves them safely and deletes them with the conversation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'treetutor-attachments-'));
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
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
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
      headers: { 'X-TreeTutor-CSRF': csrf },
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
    ['pic.png', 'PNG', 'image/png'],
  ]);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /^pic\.png: .*plain-text file/);
  assert.equal(store.tree(refused).messages.length, 0);
  assert.equal(calls.length, 1);
  assert.ok(!existsSync(join(dir, 'attachments', refused)));

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
