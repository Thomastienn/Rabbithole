import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTurn } from '../src/turn.ts';

test('navigation reconciles stale saved checkpoints with latest owning turn without duplicates', () => {
  const user = { id: 'saved-user', role: 'user', text: 'Original 🌲 question', status: 'completed' };
  const reply = { id: 'saved-reply', role: 'assistant', text: 'Newest partial', status: 'streaming' };
  const turn = { user, reply };
  const stale = { id: 'branch-a', messages: [user, { ...reply, text: 'Older partial' }] };
  const before = structuredClone(stale);
  assert.deepEqual(withTurn(stale, turn).messages, [user, reply]);
  assert.deepEqual(withTurn({ messages: [] }, turn).messages, [user, reply]);
  assert.deepEqual(withTurn(withTurn(stale, turn), turn).messages, [user, reply]);
  assert.deepEqual(stale, before);
  assert.equal(withTurn(stale), stale);
});
