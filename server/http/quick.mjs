import { randomUUID } from 'node:crypto';
import { collectText } from '../providers/chatStream.mjs';
import { quickTool } from '../tools/quickTools.mjs';

// One thread-less quick thinking call. The role rides on the request for the usage meter and test fakes; adapters ignore it.
// tool, when given, is answered through a quick tool; read turns the text into the answer. A stopped, unfinished or empty
// call throws missing (stopped instead when the signal was aborted).
export async function quickCall(
    provider,
    role,
    quick,
    {
        instructions,
        prompt,
        tool,
        capable,
        mcp,
        read = (text) => text,
        separator,
        signal,
        missing,
        stopped = missing,
        onEvent,
    },
) {
    const streamed = collectText();
    const call = tool && quickTool(tool.spec, tool.read, capable, mcp);
    await provider.generate(
        {
            provider: quick.provider,
            model: quick.model,
            effort: quick.effort,
            thread: null,
            quick: true,
            role,
            instructions: instructions + (call?.instructions ?? ''),
            ...call?.request,
        },
        prompt,
        (event) => {
            streamed.onEvent(event);
            onEvent?.(event);
        },
        () => {},
        signal,
    );
    if (signal.aborted) throw new Error(stopped);
    if (streamed.status !== 'completed') throw new Error(missing);
    const text = streamed.text(separator);
    const answer = call ? call.answer(text, read) : read(text);
    if (!answer) throw new Error(missing);
    return answer;
}

// The conversation jobs' quick thinking: the model for a conversation, and a metered call under a role.
export function quickCalls(ctx) {
    // unset: a model the provider picks by default is allowed.
    const quickModel = async (tree, unset = false) => {
        const { quick, error } = await ctx.quickFor(tree);
        if (error) throw new Error(error);
        if (!quick.model && !unset) throw new Error('Quick thinking model is not set.');
        return quick;
    };
    // detail goes to the usage meter (the reply a brief belongs to).
    const askQuick = async (role, quick, { detail, ...options }) =>
        quickCall(ctx.metered(ctx.pick(quick), role, randomUUID(), quick, detail), role, quick, {
            ...options,
            capable: !!options.tool && (await ctx.toolCapable(quick).catch(() => false)),
            mcp: ctx.mcp,
        });
    return { quickModel, askQuick };
}
