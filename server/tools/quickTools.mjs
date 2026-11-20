import { RECORD_TURN } from './recordTurn.mjs';
import { readCall } from '../media/reply-requests.mjs';
import { PLAN_TEXT_TOOLS } from '../media/plan-calls.mjs';

// The quick thinking model's structured answers (ADR 0013): one plain tool call each, checked by the server.
const turn = RECORD_TURN.parameters.properties;

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
        properties: { verdicts: { ...turn.verdicts, description: 'One entry per concept.' } },
        required: ['verdicts'],
    },
};
export const MARK_SUGGESTIONS = {
    name: 'mark_suggestions',
    description:
        'Record the marked passages, groundwork, concepts and links. Call it exactly once; leave a list empty when nothing qualifies.',
    parameters: {
        type: 'object',
        properties: Object.fromEntries(
            ['suggestions', 'groundwork', 'concepts', 'links'].map((k) => [
                k,
                { ...turn[k], description: undefined },
            ]),
        ),
        required: ['suggestions'],
    },
};
export const QUICK_TOOLS = [NAME_CONVERSATION, RECORD_VERDICTS, MARK_SUGGESTIONS].map(
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
