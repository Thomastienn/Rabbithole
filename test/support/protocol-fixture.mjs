import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { planFor } from './video-kit.mjs';

export async function protocol(stdin, stdout, argv, exit, wait = async () => {}) {
  const send = (obj) => stdout.write(JSON.stringify(obj) + '\n');
  let threads = 0;
  const threadModels = new Map();
  const video = `// Description: A winner moves upward.
// Narration: "Each round keeps its winner."
// Script: PRIVATE_VIDEO_SCRIPT - each round keeps its winner.
// Visual plan: PRIVATE_VIDEO_PLAN - move the winner toward the final.
import { AbsoluteFill, useCurrentFrame } from 'remotion';
export const durationInFrames = 30;
export default () => <AbsoluteFill style={{ top: -useCurrentFrame() }}>Winner</AbsoluteFill>;`;
  const reply = (text) =>
    text.endsWith('visual fixture request')
      ? 'See the rounds.\n```treetutor-visual\n' +
        JSON.stringify({
          title: 'Rounds',
          description: 'The round winners meet in the final.',
          intent: 'Show each round.',
          excerpt: 'Frozen round excerpt.',
        }) +
        '\n```'
      : text.startsWith('{') && JSON.parse(text).cut
        ? video
        : text.startsWith('{') && typeof JSON.parse(text).request === 'object'
          ? '<p>Round winners meet in the final.</p>'
          : text.endsWith('video fixture request')
            ? 'A winner advances.\n```treetutor-video\n' +
              JSON.stringify({
                title: 'Winner',
                description: 'A winner advances.',
                intent: 'Show a winner moving.',
                excerpt: 'Each round keeps its winner.',
              }) +
              '\n```'
            : text.startsWith('{') && JSON.parse(text).request?.endsWith('video fixture request')
              ? JSON.stringify(planFor(video))
              : text.endsWith('diagram fixture request')
                ? 'A bracket shows each round.\n```treetutor-diagram\n' +
                  JSON.stringify({
                    title: 'Rounds',
                    description: 'The round winners meet in the final.',
                    intent: 'Show each round.',
                    excerpt: 'Frozen round excerpt.',
                  }) +
                  '\n```'
                : text.startsWith('{') && JSON.parse(text).intent === 'Show each round.'
                  ? 'flowchart TD\n  W1[Round one] --> W2[Final]'
                  : text === 'Check phrase anchors'
                    ? '🪴 early | middle | early | late | shared \n\tstate | shared state | C++ (x.y) [z]? | a a a'
                    : 'Authoritative original';
  // Suggestion calls get phrase-only picks, including overlaps, unmatched and exhausted repeats.
  // The question decides failure ('suggestions fail') and delay ('slow suggestions'); a wrong cheap model yields invalid output.
  const suggesting = (text) => text.startsWith('Mark every term');
  const suggestion = (text, model, cheap) => {
    const { question, answer, knownConcepts } = JSON.parse(text.slice(text.indexOf('\n') + 1));
    if (question === 'Check phrase anchors') {
      return JSON.stringify({
        suggestions: [
          { text: 'middle', start: -1, end: 999 },
          ...[
            'early',
            'late',
            'early',
            'early',
            'shared state',
            'shared state',
            'shared state',
            'shared',
            'state | C++',
            'C++ (x.y) [z]?',
            'a',
            'a a',
            'absent',
            '\uD83E',
            '\uDEB4',
            '🪴',
            ' ',
            '',
          ].map((text) => ({ text })),
          null,
          { text: 1 },
        ],
      });
    }
    const expected = /suggestion model: ([\w.-]+)/.exec(question)?.[1] ?? cheap;
    if (question.endsWith('suggestions fail') || model !== expected) return 'not json';
    return JSON.stringify({
      ...graph(question, knownConcepts),
      suggestions: [
        {
          text: answer.slice(0, 13),
          ...(question.includes('locks') && {
            concept: question.includes('again') ? 'MUTUAL EXCLUSION' : 'Mutual exclusion',
          }),
        },
        { text: answer.slice(0, 18) },
        { text: 'original' },
        { text: 'x' },
        { text: 'original' },
      ],
    });
  };
  // 'locks' questions return concepts and tag the first passage with the mutex concept: a known Peterson name is reused as the model would; other names vary in case only.
  // Invalid concepts and links (no topic, unknown kind, unknown or self target) must be dropped. 'many concepts' grows the name list.
  const graph = (question, known) => {
    if (question.includes('many concepts'))
      return {
        concepts: Array.from({ length: 300 }, (_, i) => ({
          name: `Fixture concept number ${i} with a long name`,
          topics: ['Bulk'],
        })),
      };
    if (!question.includes('locks')) return {};
    // Without the known list, a second wording ('Peterson lock') would duplicate the concept.
    const duplicate = question.includes('duplicate locks');
    const peterson = duplicate
      ? 'Peterson lock'
      : (Object.values(known)
          .flat()
          .find((n) => /peterson/i.test(n)) ??
        (question.includes('again') ? 'Peterson lock' : "Peterson's algorithm"));
    const mutex = question.includes('again') ? 'MUTUAL EXCLUSION' : 'Mutual exclusion';
    return {
      concepts: [
        { name: peterson, topics: duplicate ? ['Algorithms'] : ['Concurrency'] },
        { name: mutex, topics: ['Concurrency', 'operating systems'] },
        { name: 'Orphan', topics: [] },
        { name: '', topics: ['X'] },
      ],
      links: [
        { from: peterson, to: mutex, kind: 'builds on' },
        { from: mutex, to: 'Turn variable', kind: 'related' },
        { from: mutex, to: mutex, kind: 'related' },
        { from: peterson, to: mutex, kind: 'needs' },
        ...(question.includes('again') || duplicate
          ? [{ from: mutex, to: peterson, kind: 'related' }]
          : []),
        ...(duplicate ? [{ from: peterson, to: "Peterson's algorithm", kind: 'related' }] : []),
      ],
    };
  };
  const slow = (text) => suggesting(text) && text.includes('slow suggestions');
  if (argv.includes('--output-format')) {
    let input = '';
    for await (const chunk of stdin) input += chunk;
    const index = argv.indexOf('--session-id');
    const session = argv[index < 0 ? argv.indexOf('--resume') + 1 : index + 1];
    const at = argv.indexOf('--model');
    const text = suggesting(input)
      ? suggestion(input, at < 0 ? null : argv[at + 1], 'haiku')
      : reply(input);
    if (slow(input)) await wait();
    send({ type: 'system', subtype: 'init', session_id: session, model: 'sonnet' });
    send({ type: 'assistant', message: { id: 'answer', content: [{ type: 'text', text }] } });
    // A learner text ending 'no usage' simulates a provider that reports none; 'claude fails' a failed run that still reports usage.
    send({
      type: 'result',
      is_error: input.endsWith('claude fails'),
      ...(input.endsWith('claude fails') && { result: 'Fixture failure.' }),
      ...(input.endsWith('context window') && {
        modelUsage: { 'claude-fixture': { contextWindow: 200000 } },
      }),
      ...(!input.endsWith('no usage') && {
        usage: {
          input_tokens: 3,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 40,
          output_tokens: 7,
        },
      }),
    });
  } else
    createInterface({ input: stdin }).on('line', (line) => {
      const { id, method, params } = JSON.parse(line);
      if (!id) return;
      if (method === 'initialize') send({ id, result: {} });
      if (method === 'model/list')
        send({
          id,
          result: params.cursor
            ? {
                data: [
                  {
                    model: 'fixture-alternate',
                    displayName: 'Alternate',
                    inputModalities: ['text'],
                  },
                  { model: 'fixture-luna', displayName: 'Luna' },
                  ...(argv.includes('--terra')
                    ? [
                        {
                          model: 'gpt-6.1-terra',
                          displayName: 'GPT-6.1 Terra',
                          isDefault: false,
                          inputModalities: ['text'],
                        },
                      ]
                    : []),
                ],
                nextCursor: null,
              }
            : {
                data: [
                  {
                    model: 'fixture-model',
                    displayName: 'Original',
                    isDefault: true,
                    supportedReasoningEfforts: ['low', 'medium', 'high'].map((reasoningEffort) => ({
                      reasoningEffort,
                      description: reasoningEffort,
                    })),
                    defaultReasoningEffort: 'medium',
                  },
                  { model: 'hidden', hidden: true },
                  { model: 'image-only', inputModalities: ['image'] },
                ],
                nextCursor: 'page-two',
              },
        });
      if (method === 'thread/inject_items') {
        if (params.items.some((item) => item.content[0].text === 'reject import'))
          send({ id, error: { code: -32602, message: 'Import rejected' } });
        else send({ id, result: {} });
      }
      if (method === 'thread/start' || method === 'thread/resume') {
        const thread =
            params.threadId ?? (++threads === 1 ? 'thread-fixture' : `thread-fixture-${threads}`),
          model = method === 'thread/resume' ? 'fixture-model' : (params.model ?? 'fixture-model');
        threadModels.set(thread, model);
        send({ id, result: { thread: { id: thread }, model } });
      }
      if (method === 'turn/start') {
        const text = params.input[0].text;
        if (text === 'disconnect') return exit(1);
        if (slow(text)) wait().then(() => turn(id, params, text));
        else turn(id, params, text);
      }
      if (method === 'turn/interrupt') send({ id, result: {} });
    });
  function turn(id, params, text) {
    send({ id, result: { turn: { id: 'turn-fixture' } } });
    if (text === 'hold') return;
    // A worker turn attempts a command; the client must deny server-initiated tool requests.
    if (text.startsWith('{'))
      send({
        id: 'worker-command',
        method: 'item/commandExecution/requestApproval',
        params: { threadId: params.threadId, command: 'cat ~/.ssh/id_rsa' },
      });
    send({
      method: 'item/agentMessage/delta',
      params: { threadId: 'foreign-thread', itemId: 'other', delta: 'MUST NOT LEAK' },
    });
    send({
      method: 'item/agentMessage/delta',
      params: {
        threadId: params.threadId,
        turnId: 'old-turn',
        itemId: 'stale',
        delta: 'MUST NOT LEAK',
      },
    });
    send({
      method: 'item/agentMessage/delta',
      params: { threadId: params.threadId, itemId: 'answer', delta: 'Partial' },
    });
    send({
      method: 'item/completed',
      params: {
        threadId: params.threadId,
        item: {
          type: 'agentMessage',
          id: 'answer',
          text: suggesting(text)
            ? suggestion(text, threadModels.get(params.threadId), 'fixture-luna')
            : reply(text),
        },
      },
    });
    if (!text.endsWith('no usage'))
      send({
        method: 'thread/tokenUsage/updated',
        params: {
          threadId: params.threadId,
          turnId: 'turn-fixture',
          tokenUsage: {
            ...(text.endsWith('context window') && { modelContextWindow: 300000 }),
            last: {
              inputTokens: 50,
              cachedInputTokens: 20,
              outputTokens: 9,
              reasoningOutputTokens: 0,
              totalTokens: 59,
            },
            total: {
              inputTokens: 500,
              cachedInputTokens: 200,
              outputTokens: 90,
              reasoningOutputTokens: 0,
              totalTokens: 590,
            },
          },
        },
      });
    send({
      method: 'turn/completed',
      params: {
        threadId: params.threadId,
        turn: {
          id: 'turn-fixture',
          status: text === 'fail' ? 'failed' : 'completed',
          ...(text === 'fail' && { error: { message: 'Fixture usage limit reached.' } }),
        },
      },
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await protocol(process.stdin, process.stdout, process.argv, (code) => process.exit(code));
}
