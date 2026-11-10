import { createServer } from 'node:http';

export function streamReply(res, parts, finish = 'stop') {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write(': heartbeat\r\n\r\n');
  for (const text of parts) res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] }) + '\r\n\r\n');
  res.end('data: ' + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finish }] }) + '\r\n\r\ndata: [DONE]\r\n\r\n');
}

// Real HTTP transport; only the compatible upstream service is synthetic.
export async function fakeOpenAI(t) {
  const fake = { calls: [], models: [{ id: 'local-tutor' }, { id: 'second-model' }], modelStatus: 200,
    reply: (req, res) => streamReply(res, ['Peterson ', 'uses two flags.']) };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    fake.calls.push({ path: req.url, method: req.method, headers: req.headers, body });
    if (req.url === '/v1/models') {
      res.writeHead(fake.modelStatus, { 'Content-Type': 'application/json', ...fake.modelHeaders });
      return res.end(JSON.stringify(fake.catalogue ?? { data: fake.models, error: fake.error }));
    }
    if (req.url === '/v1/chat/completions') return fake.reply(req, res, body);
    res.writeHead(404); res.end('Wrong API prefix');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  fake.baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  return fake;
}
