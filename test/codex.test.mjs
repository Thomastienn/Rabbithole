import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Codex } from '../server/codex.mjs';

const fixture = () => new Codex({ token: async () => 'synthetic-token' }, mkdtempSync(join(tmpdir(), 'treetutor-codex-')), (_command, args, options) => {
  assert.ok(args.includes('model_provider="openai_chatgpt_plan"'));
  assert.equal(options.env.OPENAI_API_KEY, undefined);
  assert.equal(options.env.ACCESS_TOKEN, 'synthetic-token');
  assert.ok(options.env.CODEX_HOME.endsWith('/codex'));
  return spawn(process.execPath, ['test/protocol-fixture.mjs'], { ...options, cwd: process.cwd() });
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
