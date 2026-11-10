import { createInterface } from 'node:readline';
const send = obj => process.stdout.write(JSON.stringify(obj) + '\n');
let threads = 0;
const threadModels = new Map();
const reply = text => text.endsWith('diagram fixture request') ? 'A bracket shows each round.\n```treetutor-diagram\n' + JSON.stringify({ title: 'Rounds', description: 'The round winners meet in the final.', intent: 'Show each round.', excerpt: 'Frozen round excerpt.' }) + '\n```'
  : text.startsWith('{') && JSON.parse(text).intent === 'Show each round.' ? 'flowchart TD\n  W1[Round one] --> W2[Final]' : 'Authoritative original';
// Suggestion calls get valid, overlapping, mismatched, out-of-range and duplicate passages; only the first and fourth survive.
// The question decides failure ('suggestions fail') and delay ('slow suggestions'); a wrong cheap model yields invalid output.
const suggesting = text => text.startsWith('Mark every term');
const suggestion = (text, model, cheap) => {
  const { question, answer, knownConcepts } = JSON.parse(text.slice(text.indexOf('\n') + 1));
  const expected = /suggestion model: ([\w.-]+)/.exec(question)?.[1] ?? cheap;
  if (question.endsWith('suggestions fail') || model !== expected) return 'not json';
  return JSON.stringify({ ...graph(question, knownConcepts), suggestions: [{ text: answer.slice(0, 13), start: 0, end: 13, ...(question.includes('locks') && { concept: question.includes('again') ? 'MUTUAL EXCLUSION' : 'Mutual exclusion' }) }, { text: answer.slice(0, 18), start: 0, end: 18 }, { text: 'original', start: 0, end: 8 },
    { text: answer.slice(14, 22), start: 14, end: 22 }, { text: 'x', start: -1, end: 0 }, { text: answer.slice(14, 22), start: 14, end: 22 }] });
};
// 'locks' questions return concepts and tag the first passage with the mutex concept: a known Peterson name is reused as the model would; other names vary in case only.
// Invalid concepts and links (no topic, unknown kind, unknown or self target) must be dropped. 'many concepts' grows the name list.
const graph = (question, known) => {
  if (question.includes('many concepts')) return { concepts: Array.from({ length: 300 }, (_, i) => ({ name: `Fixture concept number ${i} with a long name`, topics: ['Bulk'] })) };
  if (!question.includes('locks')) return {};
  // Without the known list, a second wording ('Peterson lock') would duplicate the concept.
  const duplicate = question.includes('duplicate locks');
  const peterson = duplicate ? 'Peterson lock' : Object.values(known).flat().find(n => /peterson/i.test(n)) ?? (question.includes('again') ? 'Peterson lock' : "Peterson's algorithm");
  const mutex = question.includes('again') ? 'MUTUAL EXCLUSION' : 'Mutual exclusion';
  return { concepts: [{ name: peterson, topics: duplicate ? ['Algorithms'] : ['Concurrency'] }, { name: mutex, topics: ['Concurrency', 'operating systems'] }, { name: 'Orphan', topics: [] }, { name: '', topics: ['X'] }],
    links: [{ from: peterson, to: mutex, kind: 'builds on' }, { from: mutex, to: 'Turn variable', kind: 'related' }, { from: mutex, to: mutex, kind: 'related' }, { from: peterson, to: mutex, kind: 'needs' }, ...(question.includes('again') || duplicate ? [{ from: mutex, to: peterson, kind: 'related' }] : []), ...(duplicate ? [{ from: peterson, to: "Peterson's algorithm", kind: 'related' }] : [])] };
};
const delay = text => suggesting(text) && text.includes('slow suggestions') ? 1000 : 0;
if (process.argv.includes('--output-format')) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const index = process.argv.indexOf('--session-id');
  const session = process.argv[index < 0 ? process.argv.indexOf('--resume') + 1 : index + 1];
  const at = process.argv.indexOf('--model');
  const text = suggesting(input) ? suggestion(input, at < 0 ? null : process.argv[at + 1], 'haiku') : reply(input);
  await new Promise(r => setTimeout(r, delay(input)));
  send({ type: 'system', subtype: 'init', session_id: session, model: 'sonnet' });
  send({ type: 'assistant', message: { id: 'answer', content: [{ type: 'text', text }] } });
  // A learner text ending 'no usage' simulates a provider that reports none.
  send({ type: 'result', is_error: false, ...(!input.endsWith('no usage') && { usage: { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 40, output_tokens: 7 } }) });
} else createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line);
  if (!id) return;
  if (method === 'initialize') send({ id, result: {} });
  if (method === 'model/list') send({ id, result: params.cursor ? {
    data: [{ model: 'fixture-alternate', displayName: 'Alternate', inputModalities: ['text'] }, { model: 'fixture-luna', displayName: 'Luna' }], nextCursor: null
  } : {
    data: [{ model: 'fixture-model', displayName: 'Original', isDefault: true }, { model: 'hidden', hidden: true }, { model: 'image-only', inputModalities: ['image'] }], nextCursor: 'page-two'
  } });
  if (method === 'thread/inject_items') {
    if (params.items.some(item => item.content[0].text === 'reject import')) send({ id, error: { code: -32602, message: 'Import rejected' } });
    else send({ id, result: {} });
  }
  if (method === 'thread/start' || method === 'thread/resume') {
    const thread = params.threadId ?? (++threads === 1 ? 'thread-fixture' : `thread-fixture-${threads}`), model = method === 'thread/resume' ? 'fixture-model' : params.model ?? 'fixture-model';
    threadModels.set(thread, model);
    send({ id, result: { thread: { id: thread }, model } });
  }
  if (method === 'turn/start') {
    const text = params.input[0].text;
    if (text === 'disconnect') return process.exit(1);
    setTimeout(() => turn(id, params, text), delay(text));
  }
  if (method === 'turn/interrupt') send({ id, result: {} });
});
function turn(id, params, text) {
  send({ id, result: { turn: { id: 'turn-fixture' } } });
  if (text === 'hold') return;
  // A worker turn attempts a command; the client must deny server-initiated tool requests.
  if (text.startsWith('{')) send({ id: 'worker-command', method: 'item/commandExecution/requestApproval', params: { threadId: params.threadId, command: 'cat ~/.ssh/id_rsa' } });
  send({ method: 'item/agentMessage/delta', params: { threadId: 'foreign-thread', itemId: 'other', delta: 'MUST NOT LEAK' } });
  send({ method: 'item/agentMessage/delta', params: { threadId: params.threadId, turnId: 'old-turn', itemId: 'stale', delta: 'MUST NOT LEAK' } });
  send({ method: 'item/agentMessage/delta', params: { threadId: params.threadId, itemId: 'answer', delta: 'Partial' } });
  send({ method: 'item/completed', params: { threadId: params.threadId, item: { type: 'agentMessage', id: 'answer', text: suggesting(text) ? suggestion(text, threadModels.get(params.threadId), 'fixture-luna') : reply(text) } } });
  if (!text.endsWith('no usage')) send({ method: 'thread/tokenUsage/updated', params: { threadId: params.threadId, turnId: 'turn-fixture', tokenUsage: { last: { inputTokens: 50, cachedInputTokens: 20, outputTokens: 9, reasoningOutputTokens: 0, totalTokens: 59 }, total: { inputTokens: 500, cachedInputTokens: 200, outputTokens: 90, reasoningOutputTokens: 0, totalTokens: 590 } } } });
  send({ method: 'turn/completed', params: { threadId: params.threadId, turn: { id: 'turn-fixture', status: text === 'fail' ? 'failed' : 'completed', ...(text === 'fail' && { error: { message: 'Fixture usage limit reached.' } }) } } });
}
