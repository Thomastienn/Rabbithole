import { isEndpoint } from '../http/roles.mjs';
import { readPage } from './readPage.mjs';
import { pythonWorkspace } from './python.mjs';

export const TUTOR_TOOLS = {
  web_search: 'Web search',
  read_page: 'Read pages',
  find_images: 'Find images',
  run_python: 'Run Python',
};

// Provider-native equivalents follow the same switches as the app tools.
export function nativeTools({ provider, capable, settings = {} }) {
  if (!capable) return [];
  return (
    provider === 'claude' ? ['web_search', 'read_page'] : provider === 'codex' ? ['web_search'] : []
  ).filter((name) => settings[name] !== false);
}

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
        save_as: {
          type: 'string',
          pattern: '^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$',
          description:
            'Optional plain filename (for example data.csv). Saves the raw response, up to 20 MB and of any type, into the Python workspace so run_python can open it by that name.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    run: (input, turn, options) =>
      readPage(input, {
        signal: turn.signal,
        workspace: options.dir && pythonWorkspace(options.dir, turn.conversation),
        ...options.readPage,
      }),
  },
  run_python: {
    description:
      'Run Python 3.12 offline in a fresh sandboxed process with numpy, scipy, sympy and pandas; no other packages can be installed. ' +
      'Returns the exit code and raw stdout and stderr, each truncated after 20000 characters, so print what you need. ' +
      'It has no network access and cannot display files, figures or images to the learner. ' +
      'Files in the working directory persist for this conversation, including files saved by read_page save_as.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python source to run as a script.' },
        timeout: {
          type: 'integer',
          minimum: 1,
          maximum: 600,
          description:
            'Time limit in seconds; 60 if omitted, 600 at most. The run is killed at the limit.',
        },
      },
      required: ['code'],
      additionalProperties: false,
    },
    run: (input, turn, options) => options.python.run(input, turn),
  },
};

// options.readPage passes lookup and address checks through, for tests against local fakes.
// options.python is the sandboxed run_python ({ status, run }); options.dir holds Python workspaces.
export function toolRunner(options = {}) {
  return {
    // Native providers keep their own web tools where available.
    async tools({ provider, capable, signal, settings = {} }) {
      if (!capable) return [];
      const search =
        (settings.web_search !== false || settings.find_images !== false) &&
        options.search &&
        (await options.search.status({ signal })).ready;
      const python =
        settings.run_python !== false && options.python && (await options.python.status()).ready;
      return Object.entries(TOOLS)
        .filter(([name]) => settings[name] !== false)
        .filter(([name]) =>
          name === 'run_python'
            ? python
            : name === 'find_images'
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
      if (name === 'run_python' && !options.python)
        throw new Error('Offline Python is unavailable. Check Tutor tools in Settings.');
      if (!['read_page', 'run_python'].includes(name) && !options.search)
        throw new Error('SearXNG is unavailable. Check Search in Settings.');
      return tool.run(input, turn, options);
    },
  };
}
