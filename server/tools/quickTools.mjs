import { readCall } from '../media/reply-parser.mjs';
import { PLAN_TEXT_TOOLS } from '../media/plan-calls.mjs';

// The quick thinking model's structured answers (ADR 0013): one plain tool call each, checked by the server.
const names = { type: 'array', items: { type: 'string' } };
// Argument schemas the quick tools share.
const fields = {
    verdicts: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                concept: { type: 'string' },
                level: { type: 'integer', minimum: 0, maximum: 5 },
                confidence: { type: 'string', enum: ['low', 'high'] },
            },
            required: ['concept', 'level', 'confidence'],
        },
    },
    suggestions: {
        type: 'array',
        items: {
            type: 'object',
            properties: { text: { type: 'string' }, concept: { type: 'string' } },
            required: ['text'],
        },
    },
    groundwork: names,
    concepts: {
        type: 'array',
        items: {
            type: 'object',
            properties: { name: { type: 'string' }, topics: names },
            required: ['name', 'topics'],
        },
    },
    links: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                kind: { type: 'string', enum: ['related', 'builds on'] },
            },
            required: ['from', 'to', 'kind'],
        },
    },
    next_questions: names,
};

export const NAME_CONVERSATION = {
    name: 'name_conversation',
    description: 'Give the conversation its title and concept. Call it exactly once.',
    parameters: {
        type: 'object',
        properties: {
            title: { type: 'string', description: 'The short plain title.' },
            concept: {
                type: 'string',
                description:
                    'The one concept the conversation explores; leave it out when none fits.',
            },
        },
        required: ['title'],
    },
};
export const RECORD_VERDICTS = {
    name: 'record_verdicts',
    description:
        'Record what the message showed about each concept it touched. Call it exactly once; an empty list when it shows nothing.',
    parameters: {
        type: 'object',
        properties: { verdicts: { ...fields.verdicts, description: 'One entry per concept.' } },
        required: ['verdicts'],
    },
};
export const MARK_SUGGESTIONS = {
    name: 'mark_suggestions',
    description:
        'Record the marked passages, groundwork, concepts, links and next questions. Call it exactly once; leave a list empty or out when nothing qualifies.',
    parameters: {
        type: 'object',
        properties: Object.fromEntries(
            ['suggestions', 'groundwork', 'concepts', 'links', 'next_questions'].map((k) => [
                k,
                fields[k],
            ]),
        ),
        required: ['suggestions'],
    },
};
export const WRITE_BRIEFS = {
    name: 'write_briefs',
    description: 'Record the brief explanation of every term. Call it exactly once.',
    parameters: {
        type: 'object',
        properties: {
            briefs: {
                type: 'array',
                description: 'One entry per term.',
                items: {
                    type: 'object',
                    properties: {
                        term: { type: 'string', description: 'The term exactly as given.' },
                        explanation: { type: 'string' },
                    },
                    required: ['term', 'explanation'],
                },
            },
        },
        required: ['briefs'],
    },
};
export const QUICK_TOOLS = [NAME_CONVERSATION, RECORD_VERDICTS, MARK_SUGGESTIONS, WRITE_BRIEFS].map(
    (t) => t.name,
);

const CALLS = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g;

// One job's call: native when the model calls tools, else described for <tool_call> text.
// read(arguments) returns the job's value or throws a plain error the model fixes on that call.
export function quickTool(tool, read, capable, mcp) {
    let value;
    const take = (input) => {
        value = read(input);
        return 'Recorded.';
    };
    return {
        instructions: capable
            ? ` Answer only by calling ${tool.name}.`
            : ` Answer only through ${tool.name}.` + PLAN_TEXT_TOOLS + JSON.stringify([tool]),
        request: capable ? { tools: [tool], mcp, runTool: (_, input) => take(input) } : {},
        // The call's value; a model that answered in plain text instead still goes through fallback.
        answer(text, fallback) {
            if (value === undefined)
                for (const [, json] of text.matchAll(CALLS)) {
                    const call = readCall({ json });
                    if (call.name !== tool.name) continue;
                    try {
                        take(call.input);
                        break;
                    } catch {}
                }
            return value !== undefined ? value : fallback(text.replace(CALLS, '').trim());
        },
    };
}
