import { collectText } from '../providers/chatStream.mjs';
import { MAX_SOURCE } from './video-plan.mjs';
import { providerError } from '../log.mjs';

// cut: the 1-based cut a call serves, passed past the provider's signal for the usage meter only.
export async function videoCall(
    provider,
    selection,
    instructions,
    input,
    signal,
    onText,
    images,
    cut,
    // { tools, mcp, runTool } for a call that reports through tool calls.
    tools,
) {
    const streamed = collectText();
    const { items } = streamed;
    let overflow;
    try {
        await provider.generate(
            {
                ...selection,
                thread: null,
                instructions,
                ...(images && { images }),
                ...(tools && { ...tools, reportsByTools: true }),
            },
            input,
            (event) => {
                if (signal.aborted || !streamed.onEvent(event)) return;
                // Past the limit nothing is kept.
                if (overflow) return items.clear();
                const bytes = [...items.values()].reduce((n, v) => n + Buffer.byteLength(v), 0);
                if (items.size > 32 || bytes > MAX_SOURCE) {
                    overflow = true;
                    items.clear();
                } else onText?.(bytes, streamed.text('\n\n'));
            },
            () => {},
            signal,
            cut,
        );
    } catch (error) {
        signal.throwIfAborted();
        throw new Error(`Video provider failed: ${providerError(error)}`);
    }
    signal.throwIfAborted();
    if (streamed.status !== 'completed') throw new Error('Video composition did not complete.');
    if (overflow)
        throw Object.assign(new Error('Video composition exceeds 64 KiB.'), {
            invalidOutput: true,
        });
    return streamed.text('\n\n');
}
