import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStreamEvent,
  currentQuestion,
  replyFeedback,
  replyUsageLine,
  sseFrames,
  underlineRanges,
  withTurn,
} from '../../src/chat/turn.ts';

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
    `Chat: ${(1000).toLocaleString()} input · 7 output · 40 cache-read tokens`,
  );
  assert.equal(
    replyUsageLine(reply, null),
    `Chat: ${(1000).toLocaleString()} input · 7 output · 40 cache-read tokens · Suggestions: not reported`,
  );
  assert.equal(
    replyUsageLine(reply, suggestion),
    `Chat: ${(1000).toLocaleString()} input · 7 output · 40 cache-read tokens · Suggestions: 30 input · 9 output · 20 cache-read tokens`,
  );
  assert.equal(
    replyUsageLine(null, suggestion),
    'Chat: not reported · Suggestions: 30 input · 9 output · 20 cache-read tokens',
  );
  assert.equal(replyUsageLine(null, null), 'Chat: not reported · Suggestions: not reported');
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

test('reply stream splits SSE frames across chunks and keeps the unfinished tail', () => {
  const frame = (e) => `data: ${JSON.stringify(e)}\n\n`;
  const first = sseFrames(frame({ type: 'text', text: 'A' }) + ': ping\n\n' + 'data: {"ty');
  assert.deepEqual(first.events, [{ type: 'text', text: 'A' }]);
  assert.equal(first.rest, 'data: {"ty');
  const second = sseFrames(first.rest + 'pe":"done"}\n\n');
  assert.deepEqual(second, { events: [{ type: 'done' }], rest: '' });
});

test('reply stream builds the live turn: saved, compacting, text, done; a retry replaces the failed reply', () => {
  const turn = {};
  assert.equal(applyStreamEvent(turn, { type: 'error', error: 'x' }, 'c'), false);
  assert.equal(applyStreamEvent(turn, { type: 'text', text: 'early' }, 'c'), true);
  assert.equal(turn.reply, undefined, 'text before saved has no reply to write');
  const user = { id: 'q', role: 'user', text: 'Why?', status: 'completed' };
  applyStreamEvent(turn, { type: 'saved', id: 'r2', user, replaced: 'r1' }, 'c');
  assert.deepEqual(turn.reply, { id: 'r2', role: 'assistant', text: '', status: 'streaming' });
  applyStreamEvent(turn, { type: 'status', status: 'compacting' }, 'c');
  assert.equal(turn.reply.phase, 'compacting');
  applyStreamEvent(turn, { type: 'status', status: 'thinking' }, 'c');
  assert.equal(turn.reply.phase, undefined);
  applyStreamEvent(turn, { type: 'text', text: 'Retried' }, 'c');
  applyStreamEvent(turn, { type: 'done', status: 'completed' }, 'c');
  assert.deepEqual(
    { text: turn.reply.text, status: turn.reply.status },
    { text: 'Retried', status: 'completed' },
  );
  const saved = {
    id: 'c',
    messages: [user, { id: 'r1', role: 'assistant', text: 'Sunlight', status: 'failed' }],
  };
  assert.deepEqual(
    withTurn(saved, turn).messages.map((m) => [m.id, m.status]),
    [
      ['q', 'completed'],
      ['r2', 'completed'],
    ],
    'one question, failed reply replaced in place',
  );
});

test('turn rail marks the last question whose top reached the reading line', () => {
  const questions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const tops = { a: -400, b: 120, c: 700 };
  assert.equal(
    currentQuestion(questions, (id) => tops[id], 300),
    'b',
  );
  assert.equal(
    currentQuestion(questions, (id) => tops[id] + 1000, 300),
    'a',
    'top of chat',
  );
  assert.equal(
    currentQuestion(questions, (id) => (id === 'c' ? 0 : undefined), 300),
    'c',
  );
  assert.equal(
    currentQuestion([], () => 0, 300),
    undefined,
  );
});
