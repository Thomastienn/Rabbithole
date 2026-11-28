import { DEFAULT_SPEED, type Voice } from './voice';

// The board player: shows the tutor's sentences one at a time, each for as long as it takes to say,
// and draws each sentence's ops in order early in it.
// A voiced sentence starts on its first audio chunk and lasts as long as its audio plays.
// Times are board time, at the default 1.5×: the learner's speed scales it and pause stops it.
export type Phase = 'start' | 'end';
export type Look = 'focus' | 'muted' | 'good' | 'wrong' | 'new';
export type Ink = 'blue' | 'green' | 'pink' | 'yellow' | 'ink' | 'muted';
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
        | 'pointer'
        | 'erase'
        | 'clear'
        | 'page'
        | 'open'
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
        | 'cycle'
        | 'stage'
        | 'stack'
        | 'layer'
        | 'timeline'
        | 'event'
        | 'parts'
        | 'part'
        | 'bars'
        | 'bar'
        | 'pie'
        | 'slice'
        | 'spectrum'
        | 'place'
        | 'quadrant'
        | 'spot'
        | 'compare'
        | 'aspect'
        | 'sequence'
        | 'send'
        | 'equation'
        | 'symbol'
        | 'code'
        | 'stroke'
        | 'drawing'
        | 'path'
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
    // Sketch fields (docs/board-sketches-spec.md): a parts sketch's whole, a layer's or part's note, an event's date.
    whole?: string;
    note?: string;
    when?: string;
    // A bar's or slice's value and a bar's unit, a spot's X,Y from 0 to 10, a spectrum's two ends or a quadrant's
    // x ends then y ends.
    value?: number;
    unit?: string;
    xy?: [number, number];
    ends?: string[];
    // A compare's sides and an aspect's value per side; a sequence's actors and a send's actors, as indices into
    // them (no `to` for a note); a symbol's meaning and its token in the equation (src/board/sketchRows.ts).
    vs?: string[];
    values?: string[];
    actors?: string[];
    by?: number;
    to?: number;
    means?: string;
    token?: number;
    // A drawing path's colour roles and where its 0-100 square sits: left, top and scale in board pixels.
    ink?: Ink;
    fill?: Ink;
    fit?: [number, number, number];
    // A code block's language, for its lines' highlighting.
    lang?: string;
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
    // The items a pointer names, or a connector's two ends (server/board/ops.mjs).
    names?: string[];
    // A page, open or clear op: the top edge of the page it opens (ADR 0029), its title, parent page and the item
    // it explains; an open names its page.
    top?: number;
    title?: string;
    parent?: string;
    origin?: string;
    page?: string;
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
// key: a `!> ` sentence; rate: its prosody rate in percent, slower below 0; pause: the tutor's pause after it, in ms.
export type Sentence = {
    id: string;
    text: string;
    ops?: Op[];
    voiced?: boolean;
    key?: boolean;
    rate?: number;
    pause?: number;
};
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

// The board's component kinds; test/board/player.test.mjs keeps it equal to COMPONENTS in server/board/components.mjs.
export const COMPONENT_KINDS = new Set([
    ...['axes', 'numberline', 'flow', 'tree', 'table', 'venn', 'code'],
    ...['cycle', 'stack', 'timeline', 'parts'],
    ...['bars', 'pie', 'spectrum', 'quadrant'],
    ...['compare', 'sequence', 'equation'],
    'drawing',
]);

// How long an op takes to draw at 1×, in ms, by size (prototype/board-pacing); the learner's speed divides it.
function drawMs(op: Op) {
    if (op.top !== undefined) return 400; // page or open: the slide to its page
    if (op.kind === 'drawing') return 0; // it only sets the box its paths draw in
    if (op.kind === 'path') return 450; // about a box's length
    if (COMPONENT_KINDS.has(op.kind) && !op.on) return 900;
    if (op.on) return 400; // a component's child
    if (op.kind === 'text' || op.kind === 'dot' || op.kind === 'point') return 250;
    if (op.kind === 'pointer' || op.kind === 'erase') return 300;
    if (op.kind === 'math') return 500;
    return 450; // box, circle, line, arrow, plot
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
        // When the last sentence ended, and the timer holding the next one for the tutor's pause after it.
        ended: number | undefined,
        last: Sentence | undefined,
        gap: unknown,
        playing: string | undefined,
        // The sentence on show: its ops and when each entered and ends, so a stop can finish the one mid-entry.
        drawing: { ops: Op[]; entries: { start: number; end: number }[] } | undefined,
        // The clip playing: its first sentence's id, when it started in board time and its length once known.
        clip: { id: string; start: number; length?: number; over?: boolean } | undefined,
        // The sentence on show in that clip, which follows its timing and its end.
        follow:
            | { retime: () => boolean; ended: () => void; failed: () => void; clip: typeof clip }
            | undefined;
    // A joined clip's sentences (docs/board-polish-spec.md, Joined speech), by each of their ids: their offsets in
    // the clip in ms of audio, or the share of the clip before each when word boundaries were missing.
    type Joined = { id: string; ids: string[]; at?: number[]; share?: number[] };
    const joins = new Map<string, Joined>();
    const pending = new Map<string, 'waiting' | 'chunked' | 'silent' | 'joined'>();
    const next = () => {
        const sentence = queue[0];
        if (current || !sentence || paused) return;
        const audio = pending.get(sentence.id);
        if (audio === 'waiting' || gap) return;
        const due = ended === undefined ? 0 : ended + (last?.pause ?? 0) - clock.now();
        if (due > 0) {
            gap = clock.setTimeout(() => {
                gap = undefined;
                next();
            }, due);
            return;
        }
        queue.shift();
        pending.delete(sentence.id);
        current = sentence;
        const started = clock.now();
        const ops = sentence.ops ?? [];
        const entries: { start: number; end: number }[] = [];
        drawing = { ops, entries };
        // Draw first (docs/board-polish-spec.md): ops run one after another from the sentence start at their own
        // lengths, squeezed (never stretched) to end within the first third of the sentence's `ms`. A later length
        // re-squeezes the ops not yet finished; the one entering keeps its start.
        const own = ops.map((op) => drawMs(op) / DEFAULT_SPEED);
        const space = (ms: number, audioElapsed?: number) => {
            timers.forEach(clock.clearTimeout);
            timers = [];
            const now = clock.now();
            const deadline = (audioElapsed === undefined ? started : now - audioElapsed) + ms / 3;
            const first = ops.findIndex((_, i) => !entries[i] || entries[i].end > now);
            if (first < 0) return;
            // What is left to draw, at own lengths: the entering op's unfinished share, then the rest.
            const entering = entries[first];
            const left = own.slice(first);
            if (entering) left[0] *= (entering.end - now) / (entering.end - entering.start);
            const fit = Math.max(
                0,
                Math.min(1, (deadline - now) / (left.reduce((a, b) => a + b) || 1)),
            );
            let at = now;
            for (let index = first; index < ops.length; index++) {
                const op = ops[index];
                const entry = entries[index];
                const start = entry?.start ?? at;
                const end = at + left[index - first] * fit;
                at = end;
                if (entry) {
                    if (entry.end === end) continue;
                    entry.end = end;
                    draw(op, end - start);
                    continue;
                }
                const enter = () => {
                    entries[index] = { start: clock.now(), end };
                    draw(op, Math.max(0, end - clock.now()));
                    // shortcut: the pen keeps its first length when a later audio length re-squeezes the op.
                    voice?.pen(op, Math.max(0, end - clock.now()));
                };
                if (start <= now) enter();
                else timers.push(clock.setTimeout(enter, start - now));
            }
        };
        const end = () => {
            if (current !== sentence) return;
            timers.forEach(clock.clearTimeout);
            clock.clearTimeout(ending);
            current = undefined;
            follow = undefined;
            ended = clock.now();
            last = sentence;
            report(sentence, 'end');
            next();
        };
        // A slower rate says the sentence longer, as edge-tts does.
        const estimate =
            (sentence.text.length / CHARS_PER_SECOND / (1 + (sentence.rate ?? 0) / 100)) * 1000;
        const byEstimate = () =>
            (ending = clock.setTimeout(end, Math.max(0, estimate - (clock.now() - started))));
        voice?.room();
        show(sentence);
        report(sentence, 'start');
        // A joined sentence plays on in its group's clip; one whose clip ended or failed plays by its estimate.
        const inClip =
            voice && audio === 'chunked'
                ? (clip = { id: sentence.id, start: started })
                : audio === 'joined' && clip && !clip.over && joins.get(sentence.id)?.id === clip.id
                  ? clip
                  : undefined;
        if (!inClip) {
            space(estimate);
            return byEstimate();
        }
        follow = {
            clip: inClip,
            // It starts at its offset and lasts to the next one's, or to the clip's end.
            retime() {
                const join = joins.get(sentence.id);
                const k = join ? join.ids.indexOf(sentence.id) : 0;
                const count = join?.ids.length ?? 1;
                const offset = (i: number) =>
                    i === 0
                        ? 0
                        : i === count
                          ? inClip.length
                          : join?.at
                            ? join.at[i] / DEFAULT_SPEED
                            : inClip.length !== undefined && join?.share
                              ? join.share[i] * inClip.length
                              : undefined;
                const from = offset(k),
                    to = offset(k + 1);
                if (from === undefined || to === undefined) return false;
                space(to - from, clock.now() - inClip.start - from);
                clock.clearTimeout(ending);
                if (k + 1 < count)
                    ending = clock.setTimeout(end, Math.max(0, inClip.start + to - clock.now()));
                return true;
            },
            ended() {
                space(0, 0);
                end();
            },
            failed() {
                space(estimate);
                byEstimate();
            },
        };
        // Until its offsets and the clip's length are known, the estimate times its ops.
        if (!follow.retime()) space(estimate);
        if (inClip.id !== sentence.id) return;
        playing = sentence.id;
        // Clip events reach whichever of its sentences is on show.
        const over = () => {
            inClip.over = true;
            if (playing === inClip.id) playing = undefined;
            return follow?.clip === inClip ? follow : undefined;
        };
        voice!.play(sentence.id, {
            duration(ms, elapsed) {
                inClip.length = ms;
                inClip.start = clock.now() - elapsed;
                if (follow?.clip === inClip) follow.retime();
            },
            ended: () => over()?.ended(),
            failed: () => over()?.failed(),
        });
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
        // A joined clip's sentences and their offsets; the sentences after its first wait for them.
        offsets(join: Joined) {
            for (const id of join.ids) {
                joins.set(id, join);
                if (id !== join.id && pending.get(id) === 'waiting') pending.set(id, 'joined');
            }
            follow?.retime();
            next();
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
            clock.clearTimeout(gap);
            gap = ended = undefined;
            voice?.stop();
            queue = [];
            current = undefined;
            playing = undefined;
            clip = follow = undefined;
            pending.clear();
            joins.clear();
        },
    };
}
