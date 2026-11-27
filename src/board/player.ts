// The board player: shows the tutor's sentences one at a time, each for as long as it takes to say,
// and draws each sentence's ops in order over that time.
// Later tickets add audio timing, speed, pause and interruptions here.
export type Phase = 'start' | 'end';
export type Look = 'focus' | 'muted' | 'good' | 'wrong' | 'new';
// A drawable op as the board session sends it (server/board/ops.mjs), in board pixels.
export type Op = {
    id: string;
    kind:
        | 'circle'
        | 'box'
        | 'dot'
        | 'line'
        | 'arrow'
        | 'text'
        | 'math'
        | 'highlight'
        | 'pointer'
        | 'erase'
        | 'clear';
    look?: Look;
    at?: [number, number];
    r?: number;
    w?: number;
    h?: number;
    size?: 's' | 'm' | 'l';
    text?: string;
    points?: [number, number][];
    // A pointer glides from here; an erase names the items it fades out.
    from?: [number, number];
    ids?: string[];
};
export type Sentence = { id: string; text: string; ops?: Op[] };
type Clock = {
    setTimeout: (run: () => void, ms: number) => unknown;
    clearTimeout: (timer: unknown) => void;
};

// An estimated ten characters per second at 1× plays at fifteen at the default 1.5×.
const CHARS_PER_SECOND = 15;

export function boardPlayer(
    show: (sentence: Sentence) => void,
    draw: (op: Op, ms: number) => void,
    report: (sentence: Sentence, phase: Phase) => void,
    clock: Clock = {
        setTimeout: (run, ms) => setTimeout(run, ms),
        clearTimeout: (timer) => clearTimeout(timer as number),
    },
) {
    let queue: Sentence[] = [],
        current: Sentence | undefined,
        timers: unknown[] = [];
    const next = () => {
        current = queue.shift();
        if (!current) return;
        const sentence = current;
        const ms = (sentence.text.length / CHARS_PER_SECOND) * 1000;
        const ops = sentence.ops ?? [];
        show(sentence);
        report(sentence, 'start');
        // Each op takes an equal share of its sentence, in order.
        const share = ms / (ops.length || 1);
        timers = ops.map((op, i) =>
            i ? clock.setTimeout(() => draw(op, share), i * share) : draw(op, share),
        );
        timers.push(
            clock.setTimeout(() => {
                report(sentence, 'end');
                next();
            }, ms),
        );
    };
    return {
        add(sentence: Sentence) {
            queue.push(sentence);
            if (!current) next();
        },
        // Drops what has not started; the sentence on show keeps its caption and drawn items stay.
        stop() {
            timers.forEach(clock.clearTimeout);
            queue = [];
            current = undefined;
        },
    };
}
