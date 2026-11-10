import { createInterface } from 'node:readline';
const send = obj => process.stdout.write(JSON.stringify(obj) + '\n');
let threads = 0;
const reply = text => text.endsWith('diagram fixture request') ? 'A bracket shows each round.\n```treetutor-diagram\n' + JSON.stringify({ title: 'Rounds', description: 'The round winners meet in the final.', intent: 'Show each round.', excerpt: 'Frozen round excerpt.' }) + '\n```'
  : text.startsWith('{') && JSON.parse(text).intent === 'Show each round.' ? 'flowchart TD\n  W1[Round one] --> W2[Final]' : 'Authoritative original';
if (process.argv.includes('--output-format')) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const index = process.argv.indexOf('--session-id');
  const session = process.argv[index < 0 ? process.argv.indexOf('--resume') + 1 : index + 1];
  const text = reply(input);
  send({ type: 'system', subtype: 'init', session_id: session, model: 'sonnet' });
  send({ type: 'assistant', message: { id: 'answer', content: [{ type: 'text', text }] } });
  send({ type: 'result', is_error: false });
} else createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line);
  if (!id) return;
  if (method === 'initialize') send({ id, result: {} });
  if (method === 'model/list') send({ id, result: params.cursor ? {
    data: [{ model: 'fixture-alternate', displayName: 'Alternate', inputModalities: ['text'] }], nextCursor: null
  } : {
    data: [{ model: 'fixture-model', displayName: 'Original', isDefault: true }, { model: 'hidden', hidden: true }, { model: 'image-only', inputModalities: ['image'] }], nextCursor: 'page-two'
  } });
  if (method === 'thread/inject_items') {
    if (params.items.some(item => item.content[0].text === 'reject import')) send({ id, error: { code: -32602, message: 'Import rejected' } });
    else send({ id, result: {} });
  }
  if (method === 'thread/start' || method === 'thread/resume') send({ id, result: { thread: { id: params.threadId ?? (++threads === 1 ? 'thread-fixture' : `thread-fixture-${threads}`) }, model: method === 'thread/resume' ? 'fixture-model' : params.model ?? 'fixture-model' } });
  if (method === 'turn/start') {
    const text = params.input[0].text;
    if (text === 'disconnect') return process.exit(1);
    send({ id, result: { turn: { id: 'turn-fixture' } } });
    if (text === 'hold') return;
    // A worker turn attempts a command; the client must deny server-initiated tool requests.
    if (text.startsWith('{')) send({ id: 'worker-command', method: 'item/commandExecution/requestApproval', params: { threadId: params.threadId, command: 'cat ~/.ssh/id_rsa' } });
    send({ method: 'item/agentMessage/delta', params: { threadId: 'foreign-thread', itemId: 'other', delta: 'MUST NOT LEAK' } });
    send({ method: 'item/agentMessage/delta', params: { threadId: params.threadId, turnId: 'old-turn', itemId: 'stale', delta: 'MUST NOT LEAK' } });
    send({ method: 'item/agentMessage/delta', params: { threadId: params.threadId, itemId: 'answer', delta: 'Partial' } });
    send({ method: 'item/completed', params: { threadId: params.threadId, item: { type: 'agentMessage', id: 'answer', text: reply(text) } } });
    send({ method: 'turn/completed', params: { threadId: params.threadId, turn: { id: 'turn-fixture', status: text === 'fail' ? 'failed' : 'completed' } } });
  }
  if (method === 'turn/interrupt') send({ id, result: {} });
});
