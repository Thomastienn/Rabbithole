import type { Voice } from './voice';

// The board player: shows the tutor's sentences one at a time, each for as long as it takes to say,
// and draws each sentence's ops in order over that time.
// A voiced sentence starts on its first audio chunk and lasts as long as its audio plays.
// Later tickets add hand-drawn entry, speed, pause and interruptions here.
export type Phase = 'start' | 'end';
export type Look = 'focus' | 'muted' | 'good' | 'wrong' | 'new';
// A drawable op as the board session sends it (server/board/ops.mjs), in board pixels.
export type Op = {
    id: string;
    kind: 'circle' | 'box' | 'dot' | 'line' | 'arrow' | 'text';
    look?: Look;
    at?: [number, number];
    r?: number;
    w?: number;
    h?: number;
    size?: 's' | 'm' | 'l';
    text?: string;
    points?: [number, number][];
};
// voiced: the sentence's audio follows on the socket, so it waits for its first chunk or its audio end.
export type Sentence = { id: string; text: string; ops?: Op[]; voiced?: boolean };
type Clock = {
    now: () => number;
    setTimeout: (run: () => void, ms: number) => unknown;
    clearTimeout: (timer: unknown) => void;
};

// An estimated ten characters per second at 1× plays at fifteen at the default 1.5×.
const CHARS_PER_SECOND = 15;

export function boardPlayer(
    show: (sentence: Sentence) => void,
    draw: (op: Op, ms: number) => void,
    report: (sentence: Sentence, phase: Phase) => void,
    voice?: Voice,
    clock: Clock = {
        now: () => performance.now(),
        setTimeout: (run, ms) => setTimeout(run, ms),
        clearTimeout: (timer) => clearTimeout(timer as number),
    },
) {
    let queue: Sentence[] = [],
        current: Sentence | undefined,
        timers: unknown[] = [],
        ending: unknown;
    // Sentence ids whose first audio chunk, or audio end, has arrived.
    const sounding = new Set<string>(),
        over = new Set<string>();
    const next = () => {
        const head = queue[0];
        if (current || !head || (head.voiced && !sounding.has(head.id) && !over.has(head.id)))
            return;
        const sentence = (current = queue.shift()!);
        const started = clock.now();
        const ops = sentence.ops ?? [];
        let drawn = 0;
        // Each op takes an equal share of its sentence, in order; a known audio length re-spaces the rest.
        const space = (ms: number) => {
            timers.forEach(clock.clearTimeout);
            const share = ms / (ops.length || 1);
            const enter = () => draw(ops[drawn++], share);
            timers = [];
            for (let i = drawn; i < ops.length; i++) {
                const wait = i * share - (clock.now() - started);
                if (wait <= 0) enter();
                else timers.push(clock.setTimeout(enter, wait));
            }
        };
        const end = () => {
            if (current !== sentence) return;
            timers.forEach(clock.clearTimeout);
            clock.clearTimeout(ending);
            current = undefined;
            report(sentence, 'end');
            next();
        };
        const estimate = (sentence.text.length / CHARS_PER_SECOND) * 1000;
        const byEstimate = () =>
            (ending = clock.setTimeout(end, Math.max(0, estimate - (clock.now() - started))));
        show(sentence);
        report(sentence, 'start');
        space(estimate);
        if (voice && sounding.delete(sentence.id))
            voice.play(sentence.id, {
                duration: (ms) => current === sentence && space(ms),
                ended: end,
                failed: () => current === sentence && byEstimate(),
            });
        else byEstimate();
        over.delete(sentence.id);
    };
    return {
        add(sentence: Sentence) {
            queue.push(sentence);
            next();
        },
        // The sentence's speech streams in chunks; its first chunk starts it.
        chunk(id: string, bytes: Uint8Array) {
            voice?.chunk(id, bytes);
            sounding.add(id);
            next();
        },
        // The sentence's speech is complete; with no chunk at all it plays by its estimate.
        audioEnd(id: string) {
            voice?.end(id);
            over.add(id);
            next();
        },
        // Drops what has not started; the sentence on show keeps its caption and drawn items stay.
        stop() {
            timers.forEach(clock.clearTimeout);
            clock.clearTimeout(ending);
            voice?.stop();
            queue = [];
            current = undefined;
            sounding.clear();
            over.clear();
        },
    };
}
