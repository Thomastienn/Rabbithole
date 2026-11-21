import { MAKE_VIDEO, readMakeVideo } from '../tools/makeVideo.mjs';
import { readDiscussionMarker, readVisualMarker } from '../media/markers.mjs';
import { formatLog, errorCause, privateValues } from '../log.mjs';

// App tools the server runs itself for the tutor; never learner-toggled tutor tools or tool activity.
// Visuals and discussions come from markers, not tools (ADR 0018).
export const APP_TOOLS = [MAKE_VIDEO];
export const isAppTool = (name) => APP_TOOLS.some((t) => t.name === name);

// One reply's app calls, native or written as <tool_call> text, and its visual and discussion markers.
export function appCalls(ctx, { conversation, reply, showVisual, makeVideo, startDiscussion }) {
    let ranCalls = 0;
    // How many media markers of each kind and value were read; the titles drawn in this reply.
    const placed = new Map(),
        titles = new Set();
    // Titles match ignoring case and whitespace.
    const key = (text) => text.toLowerCase().replace(/\s+/g, '');
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
        if (name === MAKE_VIDEO.name) {
            makeVideo(readMakeVideo(input), position, replySoFar);
            return 'queued';
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
    // Marker names and fields are model text, so only the cause is logged.
    const dropped = (kind, cause) =>
        ctx.log(
            formatLog('warn', 'chat', `${kind} marker dropped`, { id: reply, conversation, cause }),
        );
    // Each visual or discussion marker starts its media as soon as it closes, at its place (ADR 0018); one that cannot start is dropped and logged.
    const place = (output) => {
        // Counted per value, not by index: a marker can leave the list when later text turns it into code.
        const seen = new Map();
        for (const m of output.markers ?? []) {
            if (m.kind !== 'visual' && m.kind !== 'discussion') continue;
            const id = `${m.kind}:${m.value}`,
                n = (seen.get(id) ?? 0) + 1;
            seen.set(id, n);
            if (n <= (placed.get(id) ?? 0)) continue;
            placed.set(id, n);
            if (m.closed === false) {
                dropped(m.kind, 'not closed by the end of its line');
                continue;
            }
            if (m.kind === 'discussion') {
                const { task, cause } = readDiscussionMarker(m.value);
                if (cause) dropped('discussion', cause);
                else
                    try {
                        startDiscussion(task, m.position);
                    } catch (error) {
                        dropped('discussion', errorCause(error));
                    }
                continue;
            }
            const request = readVisualMarker(m.value, output.text.slice(0, m.position));
            if (request.cause) dropped('visual', request.cause);
            // A repeat answer may ask again; the same title is never drawn twice in one reply.
            else if (titles.has(key(request.title)))
                dropped('visual', 'title already shown in this reply');
            else
                try {
                    showVisual(request, m.position);
                    titles.add(key(request.title));
                } catch (error) {
                    dropped('visual', errorCause(error));
                }
        }
    };
    return { run, runText, place };
}
