import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Codex } from '../server/codex.mjs';

const fixture = (inspect = () => {}) => new Codex({ token: async () => 'synthetic-token' }, mkdtempSync(join(tmpdir(), 'treetutor-codex-')), (_command, args, options) => {
  assert.ok(args.includes('model_provider="openai_chatgpt_plan"'));
  assert.equal(options.env.OPENAI_API_KEY, undefined);
  assert.equal(options.env.ACCESS_TOKEN, 'synthetic-token');
  assert.ok(options.env.CODEX_HOME.endsWith('/codex'));
  const child = spawn(process.execPath, ['test/protocol-fixture.mjs'], { ...options, cwd: process.cwd() });
  const write = child.stdin.write.bind(child.stdin);
  child.stdin.write = data => { inspect(JSON.parse(data)); return write(data); };
  return child;
});
test('child pins inherited model and supplies fixed context on new and resumed threads', async () => {
  const requests = [];
  const client = fixture(request => requests.push(request));
  const branch = { snapshot: 'Luma has 37 branches.', text: 'same phrase' };
  try {
    for (const thread of [null, 'saved-child']) await client.generate({ thread, model: 'fixture-model', branch }, 'Explain this', () => {}, () => {}, new AbortController().signal);
    const threads = requests.filter(r => r.method === 'thread/start' || r.method === 'thread/resume');
    assert.equal(threads.length, 2);
    for (const { params } of threads) {
      assert.equal(params.model, 'fixture-model');
      assert.match(params.baseInstructions, /Luma has 37 branches/);
      assert.match(params.baseInstructions, /same phrase/);
    }
    assert.deepEqual(requests.filter(r => r.method === 'turn/start').map(r => r.params.input[0].text), ['Explain this', 'Explain this']);
  } finally { client.close(); }
});
test('stdio stream routes by thread, final item replaces partial, saved thread resumes', async () => {
  const client = fixture();
  const events = [];
  try {
    let saved;
    await client.generate({ thread: 'saved-thread' }, 'question', e => events.push(e), id => { saved = id; }, new AbortController().signal);
    assert.equal(saved, 'saved-thread');
    assert.deepEqual(events, [{ type: 'delta', item: 'answer', text: 'Partial' }, { type: 'item', item: 'answer', text: 'Authoritative original' }, { type: 'status', status: 'completed' }]);
  } finally { client.close(); }
});
test('failed terminal turn and process exit reject rather than report success', async () => {
  for (const prompt of ['fail', 'disconnect']) {
    const client = fixture();
    try { await assert.rejects(client.generate({}, prompt, () => {}, () => {}, new AbortController().signal), /could not complete|disconnected/); }
    finally { client.close(); }
  }
});

test('fresh threads import completed role history once before current question', async () => {
  const requests = [];
  const client = fixture(request => requests.push(request));
  const messages = [
    { role: 'user', text: 'Name our fictional tree.', status: 'completed' },
    { role: 'assistant', text: 'Its name is Aster.', status: 'completed' },
    { role: 'assistant', text: 'Unfinished guess', status: 'interrupted' },
    { role: 'assistant', text: 'Failed guess', status: 'failed' }
  ];
  try {
    for (const thread of [null, 'saved-thread']) await client.generate({ thread, messages }, 'Recall its name.', () => {}, () => {}, new AbortController().signal);
    const imports = requests.filter(r => r.method === 'thread/inject_items');
    assert.equal(imports.length, 1);
    assert.deepEqual(imports[0].params.items, [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: messages[0].text }] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: messages[1].text }] }
    ]);
    assert.ok(requests.indexOf(imports[0]) < requests.findIndex(r => r.method === 'turn/start'));
    assert.deepEqual(requests.filter(r => r.method === 'turn/start').map(r => r.params.input[0].text), ['Recall its name.', 'Recall its name.']);
  } finally { client.close(); }
});

test('failed history import does not save incomplete thread or start inference', async () => {
  const requests = [];
  const client = fixture(request => requests.push(request));
  let saved = false;
  try {
    await assert.rejects(client.generate({ messages: [{ role: 'assistant', text: 'reject import', status: 'completed' }] }, 'question', () => {}, () => { saved = true; }, new AbortController().signal), /Codex request failed/);
    assert.equal(saved, false);
    assert.equal(requests.some(r => r.method === 'turn/start'), false);
  } finally { client.close(); }
});
