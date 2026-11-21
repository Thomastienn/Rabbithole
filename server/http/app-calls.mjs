import { SHOW_VISUAL, readShowVisual } from '../tools/showVisual.mjs';
import { MAKE_VIDEO, readMakeVideo } from '../tools/makeVideo.mjs';
import { START_DISCUSSION, readStartDiscussion } from '../tools/startDiscussion.mjs';
import { formatLog, errorCause, privateValues } from '../log.mjs';

// App tools the server runs itself for the tutor; never learner-toggled tutor tools or tool activity.
export const APP_TOOLS = [SHOW_VISUAL, MAKE_VIDEO, START_DISCUSSION];
export const isAppTool = (name) => APP_TOOLS.some((t) => t.name === name);

// One reply's app calls, native or written as <tool_call> text.
export function appCalls(
    ctx,
    { conversation, reply, showVisual, moveVisual, makeVideo, startDiscussion },
) {
    let ranCalls = 0,
        // The reply's markers so far; each drawn visual by name; the titles drawn in this reply.
        markers = [];
    const visuals = new Map(),
        titles = new Set();
    // Names and titles match ignoring case and whitespace.
    const key = (text) => text.toLowerCase().replace(/\s+/g, '');
    const markerAt = (name) =>
        markers.find((m) => m.kind === 'visual' && key(m.value) === name)?.position;
    // Every refused call is logged with its reason, its input values redacted.
    const refused = (name, input, error) =>
        ctx.log(
            formatLog('warn', 'chat', 'app tool call refused', {
                id: reply,
                tool: name,
                cause: errorCause(error, privateValues(JSON.stringify(input ?? {}))),
            }),
        );
    const run = (...args) => {
        try {
            return runCall(...args);
        } catch (error) {
            refused(args[0], args[1], error);
            throw error;
        }
    };
    const runCall = (name, input, position, replySoFar) => {
        // A show_visual call queues its visual at its marker, or at the call until the marker arrives (ADR 0017).
        if (name === SHOW_VISUAL.name) {
            const { name: label, ...request } = readShowVisual(input, replySoFar);
            // A repeat answer may call it again; the same title is never drawn twice in one reply.
            if (titles.has(key(request.title))) {
                refused(name, input, new Error('A visual with this title was already shown.'));
                return 'already shown; continue your reply without repeating it.';
            }
            visuals.set(key(label), showVisual(request, markerAt(key(label)) ?? position));
            titles.add(key(request.title));
            // A bare "queued" read as the end of the reply to Claude, which then skipped the rest of its answer.
            return 'queued; continue your reply where you stopped, without repeating any text.';
        }
        if (name === MAKE_VIDEO.name) {
            makeVideo(readMakeVideo(input), position, replySoFar);
            return 'queued';
        }
        if (name === START_DISCUSSION.name) {
            startDiscussion(readStartDiscussion(input), position);
            return 'started; end your reply now.';
        }
        throw new Error(`${name} is not a text tool.`);
    };
    // <tool_call> text (the text fallback or a leaked native call) runs once each; nothing goes back to the model.
    const runText = (output) => {
        for (const call of output.calls.slice(ranCalls)) {
            ranCalls++;
            if (call.error)
                refused(
                    call.name,
                    call.input,
                    new Error(`Tool call could not be read: ${call.error}.`),
                );
            else
                try {
                    run(call.name, call.input, call.position, output.text.slice(0, call.position));
                } catch {
                    // run logged the refusal; nothing goes back to the model.
                }
        }
    };
    // Each visual moves to its marker once the marker streams in.
    const place = (output) => {
        markers = output.markers ?? [];
        for (const [name, artifact] of visuals) {
            const at = markerAt(name);
            if (at !== undefined && at !== artifact.position)
                visuals.set(name, moveVisual(artifact, at));
        }
    };
    // The stripper removes every visual marker; one with no drawn visual is logged so the loss shows.
    const dropped = (output) => {
        const drawn = new Set(visuals.keys());
        for (const m of output.markers ?? [])
            if (m.kind === 'visual' && !drawn.delete(key(m.value)))
                ctx.log(
                    formatLog('warn', 'chat', 'visual marker dropped', {
                        id: reply,
                        conversation,
                        cause: 'no matching show_visual call',
                    }),
                );
    };
    return { run, runText, place, dropped };
}
