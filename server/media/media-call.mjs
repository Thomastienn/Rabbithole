import { collectText } from '../providers/chatStream.mjs';
import { providerError } from '../log.mjs';

// Settles as promise does unless the controller aborts first, with its reason, or budget ms pass, with timedOut.
export async function raced(controller, promise, budget, timedOut) {
    const timer = setTimeout(() => controller.abort(new Error(timedOut)), budget);
    let rejectAbort;
    const aborted = new Promise((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', rejectAbort, { once: true });
        if (controller.signal.aborted) rejectAbort();
    });
    try {
        return await Promise.race([aborted, promise]);
    } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', rejectAbort);
    }
}

// One visual, diagram or video model call. kind: { role, bytes, overflow, tooManyItems?, incomplete, failed(reason) }.
// tools: { capable, textTools, ...native fields }; a model without native tool calls gets textTools in its instructions.
// cut: the 1-based cut a call serves, passed past the provider's signal for the usage meter only.
export async function mediaCall(
    provider,
    selection,
    kind,
    { instructions, input, signal, onText, images, cut, tools },
) {
    const { capable, textTools = '', ...native } = tools || {};
    const streamed = collectText();
    const { items } = streamed;
    let overflow;
    try {
        await provider.generate(
            {
                ...selection,
                role: kind.role,
                thread: null,
                instructions: instructions + (tools && !capable ? textTools : ''),
                ...(images && { images }),
                ...(capable && native),
            },
            input,
            (event) => {
                if (signal.aborted || !streamed.onEvent(event)) return;
                // Past the limit nothing is kept.
                if (overflow) return items.clear();
                const bytes = [...items.values()].reduce((n, v) => n + Buffer.byteLength(v), 0);
                if (items.size > 32 || bytes > kind.bytes) {
                    overflow =
                        items.size > 32 ? (kind.tooManyItems ?? kind.overflow) : kind.overflow;
                    items.clear();
                } else onText?.(bytes, streamed.text('\n\n'));
            },
            () => {},
            signal,
            cut,
        );
    } catch (error) {
        signal.throwIfAborted();
        throw new Error(kind.failed(providerError(error)));
    }
    signal.throwIfAborted();
    if (streamed.status !== 'completed') throw new Error(kind.incomplete);
    if (overflow) throw Object.assign(new Error(overflow), { invalidOutput: true });
    return streamed.text('\n\n');
}
