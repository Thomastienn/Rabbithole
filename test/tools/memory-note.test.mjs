import test from 'node:test';
import assert from 'node:assert/strict';
import { editMemoryNote } from '../../server/tools/memoryNote.mjs';
import { toolRunner } from '../../server/tools/runner.mjs';

const note = '- Knows Python\n\n## Goals\n- Learn calculus\n\n## Style\n- Likes examples';

test('add appends, or files the entry under its heading, creating the heading if missing', () => {
  assert.equal(editMemoryNote('', { operation: 'add', text: ' - New ' }), '- New');
  assert.equal(editMemoryNote('- A\n', { operation: 'add', text: '- B' }), '- A\n- B');
  assert.equal(
    editMemoryNote(note, { operation: 'add', text: '- Pass exam', heading: 'Goals' }),
    '- Knows Python\n\n## Goals\n- Learn calculus\n- Pass exam\n\n## Style\n- Likes examples',
  );
  assert.equal(
    editMemoryNote(note, { operation: 'add', text: '- Short', heading: '## Style' }),
    note + '\n- Short',
  );
  assert.equal(
    editMemoryNote('- A', { operation: 'add', text: '- B', heading: 'Level' }),
    '- A\n\n## Level\n- B',
  );
  assert.equal(editMemoryNote('', { operation: 'add', text: '- B', heading: 'L' }), '## L\n- B');
});

test('rewrite replaces exact text; delete removes it with its emptied line', () => {
  assert.equal(
    editMemoryNote(note, { operation: 'rewrite', old_text: 'Learn calculus', text: 'Learn ODEs' }),
    note.replace('Learn calculus', 'Learn ODEs'),
  );
  assert.equal(
    editMemoryNote(note, { operation: 'delete', old_text: '- Learn calculus' }),
    '- Knows Python\n\n## Goals\n\n## Style\n- Likes examples',
  );
  assert.equal(editMemoryNote('- A\n- B', { operation: 'delete', old_text: '- B' }), '- A');
  assert.equal(editMemoryNote('- A\n- B', { operation: 'delete', old_text: '- A' }), '- B');
  assert.equal(editMemoryNote('- A and B', { operation: 'delete', old_text: ' and B' }), '- A');
});

test('bad edits fail with a clear error', () => {
  const fails = (input, message) => assert.throws(() => editMemoryNote(note, input), message);
  fails({ operation: 'rewrite', old_text: 'Knows Rust', text: 'x' }, /not in the memory note/);
  fails({ operation: 'delete', old_text: 'Knows Rust' }, /not in the memory note/);
  fails({ operation: 'delete', old_text: '- ' }, /more than once/);
  fails({ operation: 'delete' }, /Give old_text/);
  fails({ operation: 'rewrite', old_text: 'Knows Python', text: ' ' }, /Give text/);
  fails({ operation: 'add' }, /Give text/);
  fails({ operation: 'replace', text: 'x' }, /add, rewrite or delete/);
});

test('the runner offers the tool to every provider, follows its switch and saves edits', async () => {
  let saved = '- Knows Python';
  const memory = { memoryNote: () => saved, saveMemoryNote: (t) => (saved = t) };
  const runner = toolRunner({ memory });
  for (const provider of ['openai:x', 'codex', 'claude']) {
    const names = async (settings) =>
      (
        await runner.tools({ provider, capable: true, settings: { read_page: false, ...settings } })
      ).map((t) => t.name);
    assert.deepEqual(await names({}), ['update_memory_note']);
    assert.deepEqual(await names({ update_memory_note: false }), []);
  }
  assert.deepEqual(
    await toolRunner().tools({ provider: 'codex', capable: true, settings: { read_page: false } }),
    [],
  );
  const turn = { conversation: 'c', reply: 'r' };
  const run = (input) => runner.run('update_memory_note', input, turn);
  assert.equal(await run({ operation: 'add', text: '- Likes proofs' }), 'Updated memory note.');
  assert.equal(
    await run({ operation: 'rewrite', old_text: 'proofs', text: 'diagrams' }),
    'Updated memory note.',
  );
  assert.equal(saved, '- Knows Python\n- Likes diagrams');
  await assert.rejects(run({ operation: 'delete', old_text: 'Rust' }), /not in the memory note/);
  assert.equal(saved, '- Knows Python\n- Likes diagrams');
  await assert.rejects(
    toolRunner().run('update_memory_note', { operation: 'add', text: 'x' }, turn),
    /unavailable/,
  );
});
