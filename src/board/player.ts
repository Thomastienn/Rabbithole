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
        | 'axes'
        | 'numberline'
        | 'plot'
        | 'point'
        | 'flow'
        | 'step'
        | 'tree'
        | 'node'
        | 'table'
        | 'row'
        | 'venn'
        | 'item';
    // A component's child names its component; components and plots carry their own path and numbers.
    on?: string;
    d?: string;
    labels?: { at: [number, number]; text: string; end?: boolean }[];
    // Flow, tree, table and Venn fields (server/board/components.mjs); src/board/layout.ts draws them.
    dir?: 'right' | 'down';
    cols?: string[];
    cells?: string[];
    under?: string;
    sets?: string[];
    // A Venn item's region: the indices of the sets it is in.
    region?: number[];
    look?: Look;
    at?: [number, number];
    r?: number;
    w?: number;
    h?: number;
    size?: 's' | 'm' | 'l';
    text?: string;
    points?: [number, number][];
};
// Point labels on one number line, in value order: a label that would touch its left neighbour's on the
// same row goes to the second row, so a crowded run alternates rows (mockup Rabbithole-brd.5).
export function labelRows(ops: Op[]) {
    const rows = new Map<string, number>();
    const width = (op: Op) => (op.text ?? '').length * 36 * 0.56;
    const points = ops
        .filter((op) => op.kind === 'point')
        .sort((a, b) => a.on!.localeCompare(b.on!) || a.at![0] - b.at![0]);
    points.forEach((op, i) => {
        const left = points[i - 1];
        const touches =
            left?.on === op.on && op.at![0] - left.at![0] < (width(left) + width(op)) / 2 + 8;
        rows.set(op.id, touches && !rows.get(left.id) ? 1 : 0);
    });
    return rows;
}
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
