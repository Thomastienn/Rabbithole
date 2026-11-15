import { isEndpoint } from '../http/roles.mjs';
import { readPage } from './readPage.mjs';

// Tutor tools: names, model-facing definitions and how each runs with a turn context.
const TOOLS = {
  web_search: {
    description:
      'Search the web through SearXNG. Returns up to 10 titles, URLs and snippets, not full pages. Use read_page for page text.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Web search query.' } },
      required: ['query'],
      additionalProperties: false,
    },
    run: (input, turn, options) => options.search.run(input, turn),
  },
  find_images: {
    description:
      'Find images through SearXNG images search. Returns up to 10 imageUrl, thumbnail, title and sourceUrl entries; it cannot inspect image contents. Place useful images using [![descriptive alt text](imageUrl)](sourceUrl) so the reply credits their source page.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Image search query.' } },
      required: ['query'],
      additionalProperties: false,
    },
    run: (input, turn, options) => options.search.run(input, turn, true),
  },
  read_page: {
    description:
      'Fetch a public web page (http or https) and return its readable text, up to 20000 characters per call. ' +
      'Returns the final URL, the title and a slice of text; call again with the given offset for more. ' +
      'It cannot read local, private-network or login-only pages, run scripts, or see images.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full http or https URL of the page.' },
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'Character offset to continue from; 0 or omitted for the start.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    run: (input, turn, options) => readPage(input, { signal: turn.signal, ...options.readPage }),
  },
};

// options.readPage passes lookup and address checks through, for tests against local fakes.
export function toolRunner(options = {}) {
  return {
    // Native providers keep their own web tools where available.
    async tools({ provider, capable, signal }) {
      if (!capable) return [];
      const search = options.search && (await options.search.status({ signal })).ready;
      return Object.entries(TOOLS)
        .filter(([name]) =>
          name === 'find_images'
            ? search
            : name === 'read_page'
              ? isEndpoint(provider) || provider === 'codex'
              : isEndpoint(provider) && search,
        )
        .map(([name, { description, parameters }]) => ({
          name,
          description,
          parameters,
        }));
    },
    // turn: { conversation, reply, signal }; returns the tool's text output or throws a readable error.
    async run(name, input, turn) {
      const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : null;
      if (!tool) throw new Error(`Unknown tool ${name}.`);
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new Error(`${name} needs its arguments as a JSON object.`);
      turn.signal?.throwIfAborted();
      if (name !== 'read_page' && !options.search)
        throw new Error('SearXNG is unavailable. Check Search in Settings.');
      return tool.run(input, turn, options);
    },
  };
}
