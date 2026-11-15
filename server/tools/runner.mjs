import { isEndpoint } from '../http/roles.mjs';
import { readPage } from './readPage.mjs';

// Tutor tools: names, model-facing definitions and how each runs with a turn context.
const TOOLS = {
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
    // Custom endpoints get the app tools through function calling when the model reports tool support.
    // shortcut: Claude and Codex get none yet; the per-model and per-tool switches arrive with tool settings.
    tools({ provider, capable }) {
      if (!isEndpoint(provider) || !capable) return [];
      return Object.entries(TOOLS).map(([name, { description, parameters }]) => ({
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
      return tool.run(input, turn, options);
    },
  };
}
