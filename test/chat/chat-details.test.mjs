import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { InheritedContext, TokenStats, TokenStatsToggle, ReplyFeedback } =
  await import('../../src/chat/ChatDetails.tsx');

test('chat details keep inherited context collapsed and read-only, show usage, and retry a failed compaction', async (t) => {
  let update;
  const retried = [];
  const question = { id: 'q', role: 'user', text: 'Why guard shared state?', status: 'completed' };
  const reply = { id: 'r', role: 'assistant', text: '', status: 'failed' };
  const branch = {
    parent: 'root',
    messageId: 'source',
    text: 'shared state',
    question: question.text,
    snapshot: '<b>Fixed context</b>\nTwo threads.',
  };
  function Fixture() {
    const [value, set] = useState({
      branch: null,
      open: false,
      message: reply,
      error: 'Compaction failed',
      suggestions: undefined,
    });
    update = set;
    return h(
      'div',
      { role: 'log' },
      h(InheritedContext, { branch: value.branch, parentTitle: 'Mutex basics', ink: 1 }),
      h('article', null, question.text),
      h(TokenStatsToggle, {
        open: value.open,
        toggle: () => set((v) => ({ ...v, open: !v.open })),
      }),
      h(TokenStats, {
        open: value.open,
        messages: [question, value.message],
        suggestions: value.suggestions,
      }),
      h(ReplyFeedback, {
        message: value.message,
        previous: question,
        latest: true,
        active: false,
        overview: false,
        suggestions: value.suggestions?.[0],
        compactionError: value.error,
        retry: (text) => retried.push(text),
      }),
    );
  }
  const { container, act, cleanup } = await render(h(Fixture), ui);
  t.after(cleanup);
  assert.equal(container.querySelector('.inherited-context'), null);
  assert.equal(
    container.querySelector('[aria-label="Token stats"]').getAttribute('aria-pressed'),
    'false',
  );
  await act(async () => button(container, 'Token stats').click());
  assert.equal(
    container.querySelector('[aria-label="Token stats"]').getAttribute('aria-pressed'),
    'true',
  );
  assert.ok(container.querySelector('.chat-stats-body'));
  await act(async () => button(container, 'Token stats').click());
  assert.equal(container.querySelector('.chat-stats-body'), null);
  await act(async () => update((v) => ({ ...v, branch })));
  const trigger = button(container, 'Inherited from Mutex basics');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  const context = container.querySelector('.inherited-context');
  assert.ok(
    context.compareDocumentPosition(container.querySelector('article')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  );
  await act(async () => trigger.click());
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(
    [...context.querySelectorAll('dd')].map((e) => e.textContent),
    [branch.text, question.text, branch.snapshot],
  );
  assert.equal(
    context.querySelector('input, textarea, [contenteditable], b'),
    null,
    'snapshot is inert plain text',
  );
  await act(async () => trigger.click());
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.match(
    container.querySelector('.reply-status').textContent,
    /Compaction failed.*no reply was written without its context/,
  );
  await act(async () => button(container, 'Retry reply').click());
  assert.deepEqual(retried, [question.text]);
  await act(async () =>
    update((v) => ({
      ...v,
      open: true,
      error: undefined,
      message: { ...reply, status: 'streaming' },
    })),
  );
  assert.match(
    container.querySelector('.chat-stats-body').textContent,
    /Token usage appears after a completed reply/,
  );
  assert.equal(container.querySelector('.reply-status').textContent, 'Responding…');
  await act(async () =>
    update((v) => ({
      ...v,
      message: {
        ...reply,
        status: 'completed',
        text: 'Answer.',
        usage: { input: 1200, output: 300, cacheRead: 800 },
      },
      suggestions: [{ message: 'r', status: 'failed', usage: null, passages: [] }],
    })),
  );
  assert.equal(button(container, 'Retry reply'), undefined);
  assert.equal(container.querySelector('.reply-status'), null);
  assert.match(container.textContent, /Suggestions unavailable/);
  assert.match(
    container.querySelector('.chat-stats-body').textContent,
    /Reply 1: Chat: 1,200 input · 300 output · 800 cache-read tokens · Suggestions: not reported/,
  );
});

test('chat details show per-reply media and task totals, including running and unreported calls', async (t) => {
  const counts = { input: 10, output: 2, cacheRead: 1 };
  const messages = [
    {
      id: 'a',
      role: 'assistant',
      status: 'completed',
      usage: counts,
      mediaUsage: [
        { task: 'diagram', ...counts },
        { task: 'diagram', ...counts },
        { task: 'video', ...counts },
      ],
    },
    {
      id: 'b',
      role: 'assistant',
      status: 'streaming',
      usage: null,
      mediaUsage: [
        { task: 'video', ...counts },
        { task: 'diagram', input: null, output: null, cacheRead: null },
      ],
    },
  ];
  const { container, cleanup } = await render(
    h(TokenStats, {
      open: true,
      messages,
      suggestions: [{ message: 'a', usage: counts }],
    }),
    ui,
  );
  t.after(cleanup);
  const rows = [...container.querySelector('.chat-stats-body').children].map((e) => e.textContent);
  assert.match(
    rows[0],
    /^Reply 1: Chat: 10 input.*Suggestions: 10 input.*Visuals: 20 input.*Videos: 10 input/,
  );
  assert.match(rows[1], /^Reply 2: Chat: not reported · Visuals: not reported · Videos: 10 input/);
  assert.match(
    rows[2],
    /^Conversation total: Chat: 10 input.*1 call not reported.*Suggestions: 10 input.*Visuals: 20 input.*1 call not reported.*Videos: 20 input · 4 output · 2 cache-read tokens$/,
  );
  assert.doesNotMatch(container.textContent, /\$|price/i);
});

test('the reply line renders task usage while media runs, including when the reply is still streaming', async (t) => {
  const { default: ChatThread } = await import('../../src/chat/ChatThread.tsx');
  const counts = { input: 10, output: 2, cacheRead: 1 };
  const { container, cleanup } = await render(
    h(ChatThread, {
      tree: {
        id: 'a',
        artifacts: [],
        suggestions: [{ message: 'r', usage: counts }],
        messages: [
          {
            id: 'r',
            role: 'assistant',
            status: 'completed',
            text: 'Answer',
            usage: counts,
            mediaUsage: [
              { task: 'diagram', ...counts },
              { task: 'video', ...counts },
            ],
          },
          {
            id: 's',
            role: 'assistant',
            status: 'streaming',
            text: 'More',
            usage: null,
            mediaUsage: [{ task: 'video', input: null, output: null, cacheRead: null }],
          },
        ],
      },
      c: { overview: false, addresses: new Map(), state: { trees: [] }, setSelectingMessage() {} },
      model: { modelLabel: () => 'Fixture' },
      trees: { openConversation() {} },
      stream: { send() {} },
      branchForm: { visualBranches: {} },
      actions: { videoAction() {} },
      active: true,
    }),
    ui,
  );
  t.after(cleanup);
  const lines = [...container.querySelectorAll('.reply-usage')].map((e) => e.textContent);
  assert.match(
    lines[0],
    /^Chat: 10 input.*Suggestions: 10 input.*Visuals: 10 input.*Videos: 10 input/,
  );
  assert.equal(lines[1], 'Chat: not reported · Videos: not reported');
  assert.equal(
    container.querySelectorAll('.reply-copy').length,
    1,
    'only finished replies can be copied',
  );
});
