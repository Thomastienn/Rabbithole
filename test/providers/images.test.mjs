import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI } from '../support/fake-openai.mjs';

const dir = () => mkdtempSync(join(tmpdir(), 'tt-images-'));
const image = (folder) => {
  const path = join(folder, 'img-1');
  writeFileSync(path, 'PNGDATA');
  return { name: 'red.png', type: 'image/png', path };
};
const b64 = Buffer.from('PNGDATA').toString('base64');
const history = [
  { role: 'user', text: 'Old\n\n[image: old.png]', status: 'completed' },
  { role: 'assistant', text: 'Blue.', status: 'completed' },
];

test('Claude: image turns send one stream-json user message with base64 image blocks; text turns stay plain', async () => {
  const calls = [];
  const claude = new Claude(dir(), (cmd, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    child.stdin = {
      end: (input) => {
        calls.push({ args, input });
        child.stdout.end(JSON.stringify({ type: 'result', is_error: false, result: 'Red' }) + '\n');
        child.stdout.on('end', () => child.emit('close', 0));
      },
    };
    return child;
  });
  assert.equal(claude.readsImages, true);
  const run = (tree) =>
    claude.generate(
      { model: 'sonnet', thread: 's', messages: [], ...tree },
      'What colour?',
      () => {},
      () => {},
      new AbortController().signal,
    );
  await run({ images: [image(dir())] });
  await run({});
  const img = image(dir());
  await run({
    thread: null,
    messages: history,
    parts: [
      { text: 'PDF intro' },
      { image: img },
      { text: 'Figure caption' },
      { image: img },
      { text: 'Last page' },
    ],
  });
  const [withImage, plain] = calls;
  assert.deepEqual(withImage.args.slice(-2), ['--input-format', 'stream-json']);
  assert.deepEqual(JSON.parse(withImage.input), {
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'text', text: 'What colour?' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
      ],
    },
  });
  assert.ok(!plain.args.includes('--input-format'));
  assert.equal(plain.input, 'What colour?');
  const ordered = JSON.parse(calls[2].input).message.content;
  assert.deepEqual(
    ordered.map((p) => p.type),
    ['text', 'image', 'text', 'image', 'text'],
  );
  assert.match(ordered[0].text, /Earlier discussion in this conversation/);
  assert.match(ordered[0].text, /Learner's new message:\nPDF intro$/);
  assert.equal(ordered[1].source.data, b64);
  assert.equal(ordered[2].text, 'Figure caption');
  assert.equal(ordered[4].text, 'Last page');
});

test('Codex: image parts follow the text item as localImage inputs with the stored path', async () => {
  const requests = [];
  const client = new Codex({ token: async () => 'synthetic-token' }, dir(), (_c, _a, options) => {
    const child = spawn(process.execPath, ['test/support/protocol-fixture.mjs'], {
      ...options,
      cwd: process.cwd(),
    });
    const write = child.stdin.write.bind(child.stdin);
    child.stdin.write = (data) => {
      requests.push(JSON.parse(data));
      return write(data);
    };
    return child;
  });
  assert.equal(client.readsImages, true);
  const img = image(dir());
  const parts = [
    { text: 'PDF intro' },
    { image: img },
    { text: 'Figure caption' },
    { image: img },
    { text: 'Last page' },
  ];
  try {
    await client.generate(
      { thread: null, model: 'fixture-model', messages: [], images: [img] },
      'What colour?',
      () => {},
      () => {},
      new AbortController().signal,
    );
    await client.generate(
      { thread: null, model: 'fixture-model', messages: [], parts },
      'Flattened fallback',
      () => {},
      () => {},
      new AbortController().signal,
    );
  } finally {
    client.close();
  }
  assert.deepEqual(requests.find((r) => r.method === 'turn/start').params.input, [
    { type: 'text', text: 'What colour?', text_elements: [] },
    { type: 'localImage', path: img.path },
  ]);
  assert.deepEqual(requests.filter((r) => r.method === 'turn/start').at(-1).params.input, [
    { type: 'text', text: 'PDF intro', text_elements: [] },
    { type: 'localImage', path: img.path },
    { type: 'text', text: 'Figure caption', text_elements: [] },
    { type: 'localImage', path: img.path },
    { type: 'text', text: 'Last page', text_elements: [] },
  ]);
});

test('custom endpoint: models keep reported vision and tools; the old Accepts images flag survives edits only as the fallback', async (t) => {
  const fake = await fakeOpenAI(t);
  fake.models = [
    { id: 'seeing', capabilities: { vision: true, tools: false } },
    { id: 'blind', capabilities: { vision: false, tools: true } },
    { id: 'quiet', capabilities: { vision: 'yes' } },
  ];
  const folder = dir();
  // An endpoint saved by an older build with Accepts images on.
  writeFileSync(
    join(folder, 'openai-endpoints.json'),
    JSON.stringify([
      {
        id: 'openai:00000000-0000-4000-8000-000000000000',
        name: 'Vision',
        baseUrl: fake.baseUrl,
        apiKey: 'key-2',
        acceptsImages: true,
      },
    ]),
    { mode: 0o600 },
  );
  const endpoints = new OpenAI(folder);
  const [vision] = endpoints.list();
  assert.equal(Object.hasOwn(vision, 'acceptsImages'), false);
  assert.deepEqual(
    (await endpoints.providers()[vision.id].models()).map(({ model, vision, tools }) => ({
      model,
      vision,
      tools,
    })),
    [
      { model: 'seeing', vision: true, tools: false },
      { model: 'blind', vision: false, tools: true },
      { model: 'quiet', vision: undefined, tools: undefined },
    ],
  );
  // The form no longer sends the flag: an edit keeps it, and a new endpoint cannot set it.
  endpoints.edit({ id: vision.id, name: 'Vision', baseUrl: fake.baseUrl, acceptsImages: false });
  assert.equal(endpoints.providers()[vision.id].acceptsImages, true);
  assert.equal(new OpenAI(folder).providers()[vision.id].acceptsImages, true);
  const plain = endpoints
    .add({ name: 'Plain', baseUrl: fake.baseUrl, apiKey: 'key-1', acceptsImages: true })
    .find((e) => e.name === 'Plain');
  assert.equal(endpoints.providers()[plain.id].acceptsImages, false);

  const img = image(folder);
  await endpoints.providers()[vision.id].generate(
    { model: 'local-tutor', messages: history, images: [img] },
    'What colour?\n\n[image: red.png]',
    () => {},
    () => {},
    new AbortController().signal,
  );
  const messages = fake.calls.at(-1).body.messages;
  assert.deepEqual(messages.slice(1), [
    { role: 'user', content: 'Old\n\n[image: old.png]' },
    { role: 'assistant', content: 'Blue.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What colour?\n\n[image: red.png]' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ],
    },
  ]);
  await endpoints.providers()[vision.id].generate(
    {
      model: 'local-tutor',
      messages: history,
      parts: [
        { text: 'PDF intro' },
        { image: img },
        { text: 'Figure caption' },
        { image: img },
        { text: 'Last page' },
      ],
    },
    'Flattened fallback',
    () => {},
    () => {},
    new AbortController().signal,
  );
  assert.deepEqual(fake.calls.at(-1).body.messages.at(-1).content, [
    { type: 'text', text: 'PDF intro' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    { type: 'text', text: 'Figure caption' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    { type: 'text', text: 'Last page' },
  ]);
  await endpoints.providers()[vision.id].generate(
    { model: 'local-tutor', messages: history },
    'Continue',
    () => {},
    () => {},
    new AbortController().signal,
  );
  assert.equal(fake.calls.at(-1).body.messages.at(-1).content, 'Continue');
  assert.doesNotMatch(JSON.stringify(fake.calls.at(-1).body.messages), /image_url/);
  endpoints.close();
});
