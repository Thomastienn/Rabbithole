import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyFeedback, replyUsageLine, underlineRanges, withTurn } from '../../src/chat/turn.ts';

test('navigation reconciles stale saved checkpoints with latest owning turn without duplicates', () => {
  const user = {
    id: 'saved-user',
    role: 'user',
    text: 'Original 🌲 question',
    status: 'completed',
  };
  const reply = {
    id: 'saved-reply',
    role: 'assistant',
    text: 'Newest partial',
    status: 'streaming',
  };
  const turn = { user, reply };
  const stale = { id: 'branch-a', messages: [user, { ...reply, text: 'Older partial' }] };
  const before = structuredClone(stale);
  assert.deepEqual(withTurn(stale, turn).messages, [user, reply]);
  assert.deepEqual(withTurn({ messages: [] }, turn).messages, [user, reply]);
  assert.deepEqual(withTurn(withTurn(stale, turn), turn).messages, [user, reply]);
  assert.deepEqual(stale, before);
  assert.equal(withTurn(stale), stale);
});

test('interleaved sibling/final turns replace stale reads only for their owning conversation', () => {
  const saved = (id) => ({
    id,
    messages: [
      { id: `${id}-q`, role: 'user', text: `Question ${id}`, status: 'completed' },
      { id: `${id}-a`, role: 'assistant', text: 'Old partial', status: 'streaming' },
    ],
  });
  const reads = new Map(['a', 'b', 'other-tree'].map((id) => [id, saved(id)]));
  const turns = new Map(
    [...reads].map(([id, value]) => [
      id,
      {
        user: value.messages[0],
        reply: { ...value.messages[1], text: `Latest ${id}`, status: 'completed' },
      },
    ]),
  );
  for (const id of ['b', 'other-tree', 'a', 'b']) {
    const read = reads.get(id),
      result = withTurn(read, turns.get(id));
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[1].text, `Latest ${id}`);
    assert.equal(result.messages[1].status, 'completed');
    assert.equal(read.messages[1].text, 'Old partial');
  }
});

test('reply feedback labels compaction failures and only retries the latest eligible question', () => {
  const user = { role: 'user', text: 'Why?', status: 'completed' };
  const failed = { role: 'assistant', text: '', status: 'failed' };
  assert.deepEqual(replyFeedback(failed, user, true, false, false, 'No context.'), {
    label: 'No context. The focused chat is kept; no reply was written without its context.',
    retry: true,
  });
  for (const [message, previous, latest, active, overview] of [
    [failed, user, false, false, false],
    [failed, user, true, true, false],
    [failed, user, true, false, true],
    [failed, failed, true, false, false],
    [{ ...failed, status: 'completed' }, user, true, false, false],
    [{ ...failed, status: 'canceled', stopped: 'learner' }, user, true, false, false],
  ])
    assert.equal(replyFeedback(message, previous, latest, active, overview).retry, false);
  const stopped = replyFeedback(
    { ...failed, status: 'canceled', stopped: 'learner' },
    user,
    true,
    false,
    false,
  );
  assert.match(stopped.label, /You stopped this reply/);
  assert.equal(
    replyFeedback({ ...failed, status: 'canceled', stopped: 'shutdown' }, user, true, false, false)
      .retry,
    true,
  );
  assert.equal(
    replyFeedback({ ...failed, status: 'streaming' }, user, true, true, false).label,
    'Responding…',
  );
});

test('the token line adds suggestion usage and never invents missing counts', () => {
  const reply = { input: 1000, output: 7, cacheRead: 40 },
    suggestion = { input: 30, output: 9, cacheRead: 20 };
  assert.equal(
    replyUsageLine(reply),
    `${(1000).toLocaleString()} input · 7 output · 40 cache-read tokens`,
  );
  assert.equal(
    replyUsageLine(reply, null),
    `${(1000).toLocaleString()} input · 7 output · 40 cache-read tokens · suggestion usage unavailable`,
  );
  assert.equal(
    replyUsageLine(reply, suggestion),
    `${(1030).toLocaleString()} input · 16 output · 60 cache-read tokens, including suggestions`,
  );
  assert.equal(
    replyUsageLine(null, suggestion),
    'Reply usage unavailable · suggestions: 30 input · 9 output · 20 cache-read tokens',
  );
  assert.equal(replyUsageLine(null, null), 'Token usage unavailable');
});

test('underline ranges are the exact saved slices, only once the suggestions are ready', () => {
  const text = 'Say same and same 😀 then `x = 1`.';
  const at = (t, from = 0) => ({
    start: text.indexOf(t, from),
    end: text.indexOf(t, from) + t.length,
    text: t,
  });
  const second = at('same', 5),
    emoji = at('😀'),
    code = at('x = 1');
  const passages = [
    code,
    second,
    emoji,
    { ...at('Say'), text: 'Sai' },
    {
      start: second.start + 1,
      end: second.end + 2,
      text: text.slice(second.start + 1, second.end + 2),
    },
    { start: 30, end: 99, text: text.slice(30) },
  ];
  assert.deepEqual(
    underlineRanges(text, { message: 'm', status: 'ready', passages, usage: null }),
    [second, emoji, code].map(({ start, end }) => ({ start, end })),
  );
  assert.deepEqual(
    underlineRanges(text, { message: 'm', status: 'pending', passages, usage: null }),
    [],
  );
  assert.deepEqual(
    underlineRanges(text, { message: 'm', status: 'failed', passages, usage: null }),
    [],
  );
  assert.deepEqual(underlineRanges(text), []);
  // An explored suggestion keeps its child reference so activating it opens that chat.
  assert.deepEqual(
    underlineRanges(text, {
      message: 'm',
      status: 'ready',
      passages: [{ ...emoji, child: 'c1' }],
      usage: null,
    }),
    [{ start: emoji.start, end: emoji.end, child: 'c1' }],
  );
  // A branch from a free selection is marked too, even before suggestions are ready; a suggestion child is not doubled.
  assert.deepEqual(underlineRanges(text, undefined, [{ ...second, child: 'c2' }]), [
    { start: second.start, end: second.end, child: 'c2' },
  ]);
  assert.deepEqual(
    underlineRanges(
      text,
      { message: 'm', status: 'ready', passages: [{ ...emoji, child: 'c1' }], usage: null },
      [
        { ...emoji, child: 'c1' },
        { ...at('Say'), text: 'Sai', child: 'c3' },
      ],
    ),
    [{ start: emoji.start, end: emoji.end, child: 'c1' }],
  );
});
