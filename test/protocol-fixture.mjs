import { createInterface } from 'node:readline';
const send = obj => process.stdout.write(JSON.stringify(obj) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line);
  if (!id) return;
  if (method === 'initialize') send({ id, result: {} });
  if (method === 'thread/start' || method === 'thread/resume') send({ id, result: { thread: { id: params.threadId ?? 'thread-fixture' } } });
  if (method === 'turn/start') {
    const text = params.input[0].text;
    if (text === 'disconnect') return process.exit(1);
    send({ id, result: { turn: { id: 'turn-fixture' } } });
    send({ method: 'item/agentMessage/delta', params: { threadId: 'foreign-thread', itemId: 'other', delta: 'MUST NOT LEAK' } });
    send({ method: 'item/agentMessage/delta', params: { threadId: params.threadId, turnId: 'old-turn', itemId: 'stale', delta: 'MUST NOT LEAK' } });
    send({ method: 'item/agentMessage/delta', params: { threadId: params.threadId, itemId: 'answer', delta: 'Partial' } });
    send({ method: 'item/completed', params: { threadId: params.threadId, item: { type: 'agentMessage', id: 'answer', text: 'Authoritative original' } } });
    send({ method: 'turn/completed', params: { threadId: params.threadId, turn: { id: 'turn-fixture', status: text === 'fail' ? 'failed' : 'completed' } } });
  }
});
