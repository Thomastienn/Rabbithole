// The silence after a tool's intent that brings a wait filler, in ms, and the most wait fillers per tool call.
export const WAIT_FILL_MS = 1500;
const WAIT_FILLS = 2;

// A board turn's tutor tool calls (docs/board-spec.md, Tutor tools on a board and Fillers). Each shows on the board and
// in the transcript. The sentences before a call are the tutor saying what it does, so they are spoken now instead of
// after the call; with none since the last call, a filler says it. voiced(): the sentence audio sent so far.
export function boardToolCalls({ store, id, send, speak, fillers, clock, voiced }) {
    // While an announced tool runs and the tutor reads its result, each WAIT_FILL_MS of silence after its intent, then
    // after the wait filler before, plays a wait filler written ahead, up to WAIT_FILLS. New speech or the turn's end
    // drop them.
    const toolWait = (current, tool, from) => {
        const intent = current.sentences.length - 1;
        const write = () => fillers.later(current, 'wait', { tool, from });
        let next = write(),
            fills = 0,
            mark,
            timer = null;
        const wait = { id: tool.id };
        const still = () => current.wait === wait && !current.done && voiced() === mark;
        const arm = () => {
            timer = clock.setTimeout(() => {
                timer = null;
                const play = still() && next;
                next = null;
                if (play)
                    play(still).then(
                        (played) => played && ++fills < WAIT_FILLS && (next = write()),
                    );
            }, WAIT_FILL_MS);
        };
        wait.ended = (index) => {
            if (index !== intent || mark !== undefined) return;
            mark = voiced();
            arm();
        };
        wait.fillerEnded = () => {
            if (fills && next && !timer && still()) arm();
        };
        current.wait = wait;
        if (current.over > intent) wait.ended(intent);
    };
    return {
        event(current, tool, sentences) {
            if (store.live(id)) store.toolCall(id, current.reply, tool);
            if (tool.status === 'running' && !current.tools.has(tool.id)) {
                current.tools.add(tool.id);
                sentences.cut();
                const from = current.toolSaid;
                current.toolSaid = current.sentences.length;
                if (from < current.toolSaid) {
                    current.sentences.at(-1).breaks = true;
                    speak(current);
                    // The intent: up to two sentences since the last call.
                    toolWait(current, tool, Math.max(from, current.toolSaid - 2));
                } else fillers.say(current, 'tool', { tool }, () => true);
            }
            const { output, resources, ...shown } = tool;
            send({ type: 'tool', tool: shown });
        },
        // The player reports sentence index's playback ended, or a filler's.
        ended: (current, index) => current.wait?.ended(index),
        fillerEnded: (current) => current.wait?.fillerEnded(),
    };
}
