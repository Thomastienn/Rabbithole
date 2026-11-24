import { isEndpoint } from '../http/roles.mjs';
import { readPage } from './readPage.mjs';
import { pythonWorkspace } from './python.mjs';
import { editMemoryNote, MEMORY_NOTE_LIMIT, tooLong } from './memoryNote.mjs';

export const TUTOR_TOOLS = {
    web_search: 'Web search',
    read_page: 'Read pages',
    find_images: 'Find images',
    run_python: 'Run Python',
    update_memory_note: 'Update memory note',
    look_up_concept: 'Look up concepts',
    search_conversations: 'Search earlier conversations',
    read_conversation: 'Read earlier conversations',
};
const RECALL = ['look_up_concept', 'search_conversations', 'read_conversation'];
const CONTEXT_ONLY =
    ' The result is background for you only: never cite, link or mention it as a source.';

// Provider-native equivalents follow the same switches as the app tools.
export function nativeTools({ provider, capable, settings = {} }) {
    if (!capable) return [];
    return (
        provider === 'claude'
            ? ['web_search', 'read_page']
            : provider === 'codex'
              ? ['web_search']
              : []
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
            'Find images through SearXNG images search. Returns up to 10 imageUrl, thumbnail, title and sourceUrl entries; it cannot inspect image contents. Place useful images using [![descriptive alt text](imageUrl)](sourceUrl) so the reply credits their source page. Each result has its resource number; cite it as [n](resource:n).',
        parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Image search query.' } },
            required: ['query'],
            additionalProperties: false,
        },
        run: (input, turn, options) => options.search.run(input, turn, 'images'),
    },
    read_page: {
        description:
            'Fetch a public web page (http or https) and return its readable text, up to 20000 characters per call. ' +
            'Returns its resource number, the final URL, the title and a slice of text; call again with the given offset for more. ' +
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
                    maximum: 240,
                    description:
                        'Time limit in seconds; 60 if omitted, 240 at most. The run is killed at the limit.',
                },
            },
            required: ['code'],
            additionalProperties: false,
        },
        run: (input, turn, options) => options.python.run(input, turn),
    },
    update_memory_note: {
        description:
            'Change the memory note about this learner, shared across all learning trees and shown in every prompt. ' +
            'One operation per call: add (text, optionally under heading), rewrite (exact old_text replaced by text) or delete (exact old_text). ' +
            'old_text must match note text exactly once. Keep entries short, one markdown line each.',
        parameters: {
            type: 'object',
            properties: {
                operation: { type: 'string', enum: ['add', 'rewrite', 'delete'] },
                text: { type: 'string', description: 'New entry text, for add and rewrite.' },
                old_text: {
                    type: 'string',
                    description: 'Exact existing entry text, for rewrite and delete.',
                },
                heading: {
                    type: 'string',
                    description: 'Optional heading to add the entry under; created if missing.',
                },
            },
            required: ['operation'],
            additionalProperties: false,
        },
        // Synchronous read and save, so concurrent turns cannot interleave an edit.
        run: (input, turn, options) => {
            const current = options.memory.memoryNote();
            const next = editMemoryNote(current, input);
            if (tooLong(next, current))
                throw new Error(
                    `The memory note would pass its ${MEMORY_NOTE_LIMIT}-character limit; rewrite or delete entries to make room.`,
                );
            options.memory.saveMemoryNote(next);
            return 'Updated memory note.';
        },
    },
    look_up_concept: {
        description:
            "Look up the learner's familiarity with concepts across all learning trees. Returns, per requested item, up to 5 nearest concepts, each with familiarity from 0 to 1 (or a guess from linked concepts, or unknown), topics and links; an item with no match returns unknown." +
            CONTEXT_ONLY,
        parameters: {
            type: 'object',
            properties: {
                concepts: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 1,
                    maxItems: 10,
                    description: 'Concept names or short descriptions of them, 1 to 10.',
                },
            },
            required: ['concepts'],
            additionalProperties: false,
        },
        run: (input, turn, options) => options.recall.lookUpConcept(input, turn),
    },
    search_conversations: {
        description:
            "Search the learner's earlier conversations in every learning tree by meaning and keywords. Returns about 5 candidates, each with conversation_id, learning_tree, address, title and one matching line; use read_conversation for the content." +
            CONTEXT_ONLY,
        parameters: {
            type: 'object',
            properties: {
                description: {
                    type: 'string',
                    description: 'What the earlier conversation was about.',
                },
            },
            required: ['description'],
            additionalProperties: false,
        },
        run: (input, turn, options) => options.recall.searchConversations(input, turn),
    },
    read_conversation: {
        description:
            'Read an earlier conversation by conversation_id: its inherited context and messages, or one compact paragraph when it is long.' +
            CONTEXT_ONLY,
        parameters: {
            type: 'object',
            properties: {
                conversation_id: {
                    type: 'string',
                    description: 'An id from search_conversations.',
                },
            },
            required: ['conversation_id'],
            additionalProperties: false,
        },
        run: (input, turn, options) => options.recall.readConversation(input, turn),
    },
};

const site = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
};
const cite = (n) => `Resource ${n}; cite it as [${n}](resource:${n}).`;

// Pages, saved files and found images become resources of the learning tree; the model learns their numbers.
function withResources(name, input, output, { conversation }, store) {
    if (name === 'read_page') {
        const head = output.split('\n\n')[0],
            url = head.match(/^URL: (.+)$/m)?.[1];
        if (!url) return output;
        const file = input.save_as !== undefined;
        const n = store.addResource(conversation, {
            url,
            title: head.match(/^Title: (.+)$/m)?.[1] ?? (file ? input.save_as : url),
            site: site(url),
            kind: file ? 'file' : 'page',
        });
        return `${cite(n)}\n${output}`;
    }
    if (name === 'find_images') {
        const { results } = JSON.parse(output);
        return JSON.stringify({
            results: results.map((r) => ({
                resource: store.addResource(conversation, {
                    url: r.imageUrl,
                    title: r.title,
                    site: site(r.sourceUrl),
                    kind: 'image',
                }),
                ...r,
            })),
        });
    }
    return output;
}

// options.resources is the store keeping the learning tree's resources (addResource).
// options.readPage passes lookup and address checks through, for tests against local fakes.
// options.memory is the store holding the memory note (memoryNote, saveMemoryNote).
// options.recall runs the lookup and recall tools (recallTools); their results add no resources.
// options.python is the sandboxed run_python ({ status, run }); options.dir holds Python workspaces.
export function toolRunner(options = {}) {
    return {
        // Native providers keep their own web tools where available.
        async tools({ provider, capable, signal, settings = {} }) {
            if (!capable) return [];
            const search =
                (settings.web_search !== false || settings.find_images !== false) &&
                options.search &&
                (await options.search.ready({ signal }));
            const python =
                settings.run_python !== false &&
                options.python &&
                (await options.python.status()).ready;
            return Object.entries(TOOLS)
                .filter(([name]) => settings[name] !== false)
                .filter(([name]) =>
                    RECALL.includes(name)
                        ? !!options.recall
                        : name === 'update_memory_note'
                          ? !!options.memory
                          : name === 'run_python'
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
            if (name === 'update_memory_note' && !options.memory)
                throw new Error('The memory note is unavailable.');
            if (RECALL.includes(name) && !options.recall) throw new Error('Recall is unavailable.');
            if (
                !['read_page', 'run_python', 'update_memory_note', ...RECALL].includes(name) &&
                !options.search
            )
                throw new Error('SearXNG is unavailable. Check Search in Settings.');
            const output = await tool.run(input, turn, options);
            return options.resources
                ? withResources(name, input, output, turn, options.resources)
                : output;
        },
    };
}
