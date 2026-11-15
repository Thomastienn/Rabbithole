import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Protocol peers use the real HTTP transport; the runner/model responses stay synthetic.
export async function appTool(config) {
  if (!config) return 'No app tools';
  const client = new Client({ name: 'fixture', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers },
      }),
    );
    const { tools } = await client.listTools();
    const tool = tools[0];
    return (
      await client.callTool({
        name: tool.name,
        arguments:
          tool.name === 'read_page' ? { url: 'https://example.org' } : { query: 'fixture' },
      })
    ).content[0].text;
  } finally {
    await client.close();
  }
}

export function codexMcp(argv) {
  const config = argv.find((s) => s.startsWith('mcp_servers.treetutor='));
  return config
    ? {
        url: /url="([^"]+)"/.exec(config)[1],
        headers: { Authorization: /Authorization="([^"]+)"/.exec(config)[1] },
      }
    : null;
}

export function claudeSearch(send) {
  send({ type: 'stream_event', event: { type: 'message_start', message: { id: 'search-round' } } });
  send({
    type: 'stream_event',
    event: {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'web-1', name: 'WebSearch', input: {} },
    },
  });
  send({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"query":"fixture fact"}' },
    },
  });
  send({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
  send({
    type: 'assistant',
    message: {
      id: 'search-round',
      content: [
        { type: 'tool_use', id: 'web-1', name: 'WebSearch', input: { query: 'fixture fact' } },
      ],
    },
  });
  send({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'web-1', content: 'Search found https://example.org' },
      ],
    },
    // Shape recorded from Claude Code 2.1.325 stream-json.
    tool_use_result: {
      query: 'fixture fact',
      results: [
        {
          tool_use_id: 'srvtoolu-1',
          content: [
            { title: 'Example fact', url: 'https://example.org' },
            { title: 'Second source', url: 'https://www.second.example/fact' },
          ],
        },
      ],
      durationSeconds: 1,
    },
  });
  send({
    type: 'assistant',
    message: {
      id: 'fetch-round',
      content: [
        {
          type: 'tool_use',
          id: 'fetch-1',
          name: 'WebFetch',
          input: { url: 'https://example.org', prompt: 'Read fact' },
        },
      ],
    },
  });
  send({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'fetch-1',
          is_error: true,
          content: [{ type: 'text', text: 'Fetch failed' }],
        },
      ],
    },
  });
}
