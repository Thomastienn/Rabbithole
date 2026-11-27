import { DEFAULT_SPEED, type Voice } from './voice';

// The board player: shows the tutor's sentences one at a time, each for as long as it takes to say,
// and draws each sentence's ops in order over that time.
// A voiced sentence starts on its first audio chunk and lasts as long as its audio plays.
// Times are board time, at the default 1.5×: the learner's speed scales it and pause stops it.
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
        | 'clear'
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
        | 'item'
        | 'stroke'
        | 'erase';
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
    // A pointer glides from here; an erase names the items it fades out.
    from?: [number, number];
    ids?: string[];
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
// voiced: the sentence's audio follows on the socket, so it waits for its first chunk or its audio end.
export type Sentence = { id: string; text: string; ops?: Op[]; voiced?: boolean };
type Clock = {
    now: () => number;
    setTimeout: (run: () => void, ms: number) => unknown;
    clearTimeout: (timer: unknown) => void;
};

// Board time over a real clock: it runs at speed / 1.5 and stands still while paused; its timers follow.
function pacedClock(real: Clock) {
    type Timer = { at: number; run: () => void; handle?: unknown };
    const timers = new Set<Timer>();
    let scale = 1,
        paused = false,
        base = 0,
        since = real.now();
    const now = () => (paused ? base : base + (real.now() - since) * scale);
    const arm = (t: Timer) => {
        t.handle = real.setTimeout(
            () => {
                timers.delete(t);
                t.run();
            },
            Math.max(0, (t.at - now()) / scale),
        );
    };
    const change = (set: () => void) => {
        base = now();
        since = real.now();
        set();
        for (const t of timers) {
            real.clearTimeout(t.handle);
            if (!paused) arm(t);
        }
    };
    return {
        now,
        setTimeout(run: () => void, ms: number): unknown {
            const t: Timer = { at: now() + ms, run };
            timers.add(t);
            if (!paused) arm(t);
            return t;
        },
        clearTimeout(timer: unknown) {
            if (timers.delete(timer as Timer)) real.clearTimeout((timer as Timer).handle);
        },
        scale: (s: number) => change(() => (scale = s)),
        pause: (on: boolean) => change(() => (paused = on)),
    };
}

// An estimated ten characters per second at 1× plays at fifteen at the default 1.5×.
const CHARS_PER_SECOND = 15;

export function boardPlayer(
    show: (sentence: Sentence) => void,
    draw: (op: Op, ms: number) => void,
    report: (sentence: Sentence, phase: Phase) => void,
    voice?: Voice,
    real: Clock = {
        now: () => performance.now(),
        setTimeout: (run, ms) => setTimeout(run, ms),
        clearTimeout: (timer) => clearTimeout(timer as number),
    },
) {
    const clock = pacedClock(real);
    let paused = false;
    let queue: Sentence[] = [],
        current: Sentence | undefined,
        timers: unknown[] = [],
        ending: unknown,
        playing: string | undefined,
        // The sentence on show: its ops and when each entered and ends, so a stop can finish the one mid-entry.
        drawing: { ops: Op[]; entries: { start: number; end: number }[] } | undefined;
    const pending = new Map<string, 'waiting' | 'chunked' | 'silent'>();
    const next = () => {
        const sentence = queue[0];
        if (current || !sentence || paused) return;
        const audio = pending.get(sentence.id);
        if (audio === 'waiting') return;
        queue.shift();
        pending.delete(sentence.id);
        current = sentence;
        const started = clock.now();
        const ops = sentence.ops ?? [];
        const entries: { start: number; end: number }[] = [];
        drawing = { ops, entries };
        // Retiming updates items already on the board as well as scheduling the rest.
        const space = (ms: number, audioElapsed?: number) => {
            timers.forEach(clock.clearTimeout);
            timers = [];
            const now = clock.now();
            const elapsed = audioElapsed ?? now - started;
            const share = ms / (ops.length || 1);
            for (const [index, op] of ops.entries()) {
                const endAt = now - elapsed + (index + 1) * share;
                const entry = entries[index];
                if (entry) {
                    const end = audioElapsed === undefined ? entry.start + share : endAt;
                    if (entry.end === end || (entry.end <= now && end <= now)) continue;
                    entry.end = end;
                    draw(op, Math.max(0, end - entry.start));
                    continue;
                }
                const enter = () => {
                    const start = clock.now();
                    const end = audioElapsed === undefined ? start + share : endAt;
                    entries[index] = { start, end };
                    draw(op, Math.max(0, end - start));
                };
                const wait = index * share - elapsed;
                if (wait <= 0) enter();
                else timers.push(clock.setTimeout(enter, wait));
            }
        };
        const end = () => {
            if (current !== sentence) return;
            timers.forEach(clock.clearTimeout);
            clock.clearTimeout(ending);
            current = undefined;
            playing = undefined;
            report(sentence, 'end');
            next();
        };
        const estimate = (sentence.text.length / CHARS_PER_SECOND) * 1000;
        const byEstimate = () =>
            (ending = clock.setTimeout(end, Math.max(0, estimate - (clock.now() - started))));
        show(sentence);
        report(sentence, 'start');
        space(estimate);
        if (voice && audio === 'chunked') {
            playing = sentence.id;
            voice.play(sentence.id, {
                duration: (ms, elapsed) => current === sentence && space(ms, elapsed),
                ended: () => {
                    if (current !== sentence) return;
                    space(0, 0);
                    end();
                },
                failed: () => {
                    if (current !== sentence) return;
                    playing = undefined;
                    space(estimate);
                    byEstimate();
                },
            });
        } else byEstimate();
    };
    return {
        add(sentence: Sentence) {
            if (sentence.voiced) pending.set(sentence.id, 'waiting');
            queue.push(sentence);
            next();
        },
        // The sentence's speech streams in chunks; its first chunk starts it.
        // A filler plays only while no sentence does, and the first sentence's speech cuts it off.
        chunk(id: string, bytes: Uint8Array) {
            if (id === 'filler') {
                if (current || playing || !voice) return;
                playing = id;
                const over = () => playing === id && (playing = undefined);
                voice.chunk(id, bytes);
                return voice.play(id, { duration() {}, ended: over, failed: over });
            }
            const audio = pending.get(id);
            if (playing !== id && (!audio || audio === 'silent')) return;
            voice?.chunk(id, bytes);
            if (audio === 'waiting') {
                pending.set(id, 'chunked');
                next();
            }
        },
        // The sentence's speech is complete; with no chunk at all it plays by its estimate.
        audioEnd(id: string) {
            const audio = pending.get(id);
            if (playing === id || audio === 'chunked') voice?.end(id);
            if (audio === 'waiting') {
                pending.set(id, 'silent');
                next();
            }
        },
        // Speech and board time change speed at once, mid-sentence.
        speed(rate: number) {
            clock.scale(rate / DEFAULT_SPEED);
            voice?.speed(rate);
        },
        // Paused, nothing advances; sentences and audio still arriving queue up and play after resume.
        pause(on: boolean) {
            paused = on;
            clock.pause(on);
            voice?.pause(on);
            if (!on) next();
        },
        // A timer in board time, for effects that outlast an op's draw, such as an erase fade.
        wait: (run: () => void, ms: number) => clock.setTimeout(run, ms),
        // Drops what has not started; the sentence on show keeps its caption, drawn items stay
        // and an item still entering finishes within 150 ms.
        stop() {
            const now = clock.now();
            drawing?.entries.forEach(
                (e, i) => e.end > now + 150 && draw(drawing!.ops[i], now - e.start + 150),
            );
            drawing = undefined;
            paused = false;
            clock.pause(false);
            timers.forEach(clock.clearTimeout);
            clock.clearTimeout(ending);
            voice?.stop();
            queue = [];
            current = undefined;
            playing = undefined;
            pending.clear();
        },
    };
}
