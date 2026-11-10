import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyUsageLine, underlineRanges, withTurn } from '../src/turn.ts';

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

test('the token line adds suggestion usage and never invents missing counts', () => {
  const reply = { input: 1000, output: 7, cacheRead: 40 }, suggestion = { input: 30, output: 9, cacheRead: 20 };
  assert.equal(replyUsageLine(reply), `${(1000).toLocaleString()} input · 7 output · 40 cache-read tokens`);
  assert.equal(replyUsageLine(reply, suggestion), `${(1030).toLocaleString()} input · 16 output · 60 cache-read tokens, including suggestions`);
  assert.equal(replyUsageLine(null, suggestion), 'Reply usage unavailable · suggestions: 30 input · 9 output · 20 cache-read tokens');
  assert.equal(replyUsageLine(null, null), 'Token usage unavailable');
});

test('underline ranges are the exact saved slices, only once the suggestions are ready', () => {
  const text = 'Say same and same 😀 then `x = 1`.';
  const at = (t, from = 0) => ({ start: text.indexOf(t, from), end: text.indexOf(t, from) + t.length, text: t });
  const second = at('same', 5), emoji = at('😀'), code = at('x = 1');
  const passages = [code, second, emoji, { ...at('Say'), text: 'Sai' }, { start: second.start + 1, end: second.end + 2, text: text.slice(second.start + 1, second.end + 2) }, { start: 30, end: 99, text: text.slice(30) }];
  assert.deepEqual(underlineRanges(text, { message: 'm', status: 'ready', passages, usage: null }), [second, emoji, code].map(({ start, end }) => ({ start, end })));
  assert.deepEqual(underlineRanges(text, { message: 'm', status: 'pending', passages, usage: null }), []);
  assert.deepEqual(underlineRanges(text, { message: 'm', status: 'failed', passages, usage: null }), []);
  assert.deepEqual(underlineRanges(text), []);
  // An explored suggestion keeps its child reference so activating it opens that chat.
  assert.deepEqual(underlineRanges(text, { message: 'm', status: 'ready', passages: [{ ...emoji, child: 'c1' }], usage: null }), [{ start: emoji.start, end: emoji.end, child: 'c1' }]);
});
