import { notify } from './events.mjs';
import { createServer } from 'node:http';

// An optional usage report goes in its own chunk after the finish, as with stream_options.include_usage.
const usageChunk = (usage) =>
  usage ? 'data: ' + JSON.stringify({ choices: [], usage }) + '\n\n' : '';

export function streamReply(res, parts, finish = 'stop', usage) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write(': heartbeat\r\n\r\n');
  for (const text of parts)
    res.write(
      'data: ' +
        JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) +
        '\r\n\r\n',
    );
  res.end(
    'data: ' +
      JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finish }] }) +
      '\r\n\r\n' +
      usageChunk(usage) +
      'data: [DONE]\r\n\r\n',
  );
}

// Real HTTP transport; only the compatible upstream service is synthetic.
export async function fakeOpenAI(t) {
  const fake = {
    calls: [],
    models: [{ id: 'local-tutor' }, { id: 'second-model' }],
    modelStatus: 200,
    reply: (req, res) => streamReply(res, ['Peterson ', 'uses two flags.']),
    // The tool support probe is the only non-streamed chat call; by default the model answers without a call.
    probes: [],
    probe: (req, res) =>
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        }),
      ),
    // A call forcing record_turn after a reply without it; by default the model still sends none.
    forced: [],
    force: (req, res) => streamReply(res, []),
  };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    if (req.url === '/v1/chat/completions' && body?.stream === false) {
      fake.probes.push(body);
      return fake.probe(req, res, body);
    }
    if (body?.tool_choice?.function?.name === 'record_turn') {
      fake.forced.push(body);
      return fake.force(req, res, body);
    }
    fake.calls.push({ path: req.url, method: req.method, headers: req.headers, body });
    if (req.url === '/v1/models') {
      res.writeHead(fake.modelStatus, { 'Content-Type': 'application/json', ...fake.modelHeaders });
      return res.end(JSON.stringify(fake.catalogue ?? { data: fake.models, error: fake.error }));
    }
    if (req.url === '/v1/chat/completions') {
      const result = fake.reply(req, res, body);
      notify();
      return result;
    }
    res.writeHead(404);
    res.end('Wrong API prefix');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  fake.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  return fake;
}

// One model turn that asks for tool calls, each call's arguments split across two chunks.
export function streamToolCalls(res, calls, text = '', finish = 'tool_calls', usage) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const chunk = (delta, finish_reason = null) =>
    res.write(
      'data: ' + JSON.stringify({ choices: [{ index: 0, delta, finish_reason }] }) + '\n\n',
    );
  if (text) chunk({ content: text });
  calls.forEach(({ name, input }, index) => {
    const args = JSON.stringify(input);
    chunk({
      tool_calls: [
        {
          index,
          id: `call-${index}`,
          type: 'function',
          function: { name, arguments: args.slice(0, 5) },
        },
      ],
    });
    chunk({ tool_calls: [{ index, function: { arguments: args.slice(5) } }] });
  });
  chunk({}, finish);
  res.end(usageChunk(usage) + 'data: [DONE]\n\n');
}
