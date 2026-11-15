import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import { runTool } from '../providers/chatStream.mjs';

// The runner already owns JSON Schemas; the SDK's low-level server keeps those authoritative.
export function toolMcp() {
  const turns = new Map();
  const validator = new AjvJsonSchemaValidator();
  let listening;
  const server = http.createServer(async (req, res) => {
    const entry = turns.get(req.headers.authorization);
    if (!entry || entry.signal.aborted) return res.writeHead(401).end();
    const host = `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== host || req.headers.origin) return res.writeHead(403).end();
    if (req.url !== '/mcp') return res.writeHead(404).end();
    if (req.method !== 'POST') return res.writeHead(405).end();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 1024 * 1024,
    });
    const mcp = new Server(
      { name: 'TreeTutor', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    const close = () => {
      entry.requests.delete(close);
      void mcp.close();
      res.destroy();
    };
    entry.requests.add(close);
    res.once('close', close);
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: entry.tree.tools.map(({ parameters, ...tool }) => ({
        ...tool,
        inputSchema: parameters,
      })),
    }));
    mcp.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
      entry.signal.throwIfAborted();
      const definition = entry.tree.tools.find((tool) => tool.name === params.name);
      if (!definition) throw new Error('Tool is unavailable for this turn.');
      const input = params.arguments ?? {};
      if (!validator.getValidator(definition.parameters)(input).valid)
        throw new Error('Invalid tool arguments.');
      let isError = false;
      const output = await runTool(
        entry.tree,
        { name: params.name, arguments: JSON.stringify(input) },
        (event) => {
          isError = event.tool.status === 'failed';
          entry.emit(event);
        },
        AbortSignal.any([entry.signal, extra.signal]),
        entry.secret,
      );
      return { content: [{ type: 'text', text: output }], ...(isError && { isError }) };
    });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
      else close();
    }
  });
  return {
    async open(tree, emit, parent) {
      parent.throwIfAborted();
      listening ??= new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      await listening;
      parent.throwIfAborted();
      const secret = randomBytes(32).toString('base64url');
      const authorization = `Bearer ${secret}`;
      const controller = new AbortController();
      const entry = {
        tree,
        emit,
        secret,
        controller,
        signal: AbortSignal.any([parent, controller.signal]),
        requests: new Set(),
      };
      const close = () => {
        turns.delete(authorization);
        parent.removeEventListener('abort', close);
        controller.abort();
        for (const request of [...entry.requests]) request();
      };
      entry.close = close;
      turns.set(authorization, entry);
      parent.addEventListener('abort', close, { once: true });
      return {
        url: `http://127.0.0.1:${server.address().port}/mcp`,
        headers: { Authorization: authorization },
        close,
      };
    },
    async close() {
      for (const entry of turns.values()) entry.close();
      if (listening) {
        await listening;
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  };
}
