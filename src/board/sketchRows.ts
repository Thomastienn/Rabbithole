import type { Op } from './player';
import type { Part } from './layout.ts';

// Board sketches in rows (docs/board-sketches-spec.md, mockup Rabbithole-bsk.6): compare, sequence and equation,
// laid out from their box and every child drawn so far, in board pixels. Past eight children text shrinks to 26/32
// and stations with it, so the pieces still share the box.
type Box = { left: number; top: number; w: number; h: number };
type Parts = Map<string, Part[]>;

// A character is about 0.52 of its font size wide; a math glyph about 0.546.
const EM = 0.52;
const MATH_EM = 0.546;
const r1 = (v: number) => Math.round(v * 10) / 10;
const scaleOf = (n: number) => (n > 8 ? 26 / 32 : 1);
const line = (
    key: string,
    d: string,
    t: [number, number],
    look: 'edge' | 'rule' | 'seam' | 'gap' | 'leader',
): Part => ({
    key,
    t,
    kind: 'line',
    look,
    d,
});
const text = (
    key: string,
    x: number,
    y: number,
    words: string,
    size: number,
    t: [number, number],
    anchor?: 'start' | 'end',
    look?: 'name' | 'note' | 'math' | 'mathop',
): Part => ({
    key,
    t,
    kind: 'text',
    x: r1(x),
    y: r1(y),
    text: words,
    size: r1(size),
    anchor,
    look,
});

// An equation's tokens, split at spaces: a symbol has a letter, the rest (operators, numbers) stand upright. A
// superscript follows the first ^.
export function equationTokens(formula: string) {
    return formula
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => {
            const [base, ...sup] = token.split('^');
            return { text: token, base, sup: sup.join('^'), symbol: /\p{L}/u.test(base) };
        });
}

export function rowParts(parent: Op, children: Op[], box: Box, parts: Parts) {
    if (parent.kind === 'compare') compare(parent, children, box, parts);
    if (parent.kind === 'sequence') sequence(parent, children, box, parts);
    if (parent.kind === 'equation') equation(parent, children, box, parts);
}

// The aspect column is the widest aspect name plus 48, at least 208; the two sides share the rest. Side names sit
// 44 below the top over a rule each, 70 below it; rows start 80 below the top, at most 96 apart, a seam between them.
function compare(c: Op, aspects: Op[], { left, top, w, h }: Box, parts: Parts) {
    const n = aspects.length;
    const k = scaleOf(n);
    const col1 =
        left +
        Math.max(208, Math.max(0, ...aspects.map((a) => (a.text ?? '').length * EM * 28 * k)) + 48);
    const col2 = col1 + (left + w - col1) / 2;
    const [a, b] = c.vs ?? [];
    parts.set(c.id, [
        text('side0', col1, top + 44, a ?? '', 32, [0, 0.4], 'start', 'name'),
        text('side1', col2, top + 44, b ?? '', 32, [0, 0.4], 'start', 'name'),
        line(
            'rule',
            `M${r1(col1)} ${top + 70}H${r1(col2 - 40)}M${r1(col2)} ${top + 70}H${left + w}`,
            [0.4, 1],
            'rule',
        ),
    ]);
    const gap = Math.min(96, (h - 80) / Math.max(1, n));
    aspects.forEach((aspect, i) => {
        const row = top + 80 + gap * i;
        const mid = row + gap / 2;
        const [x, y] = aspect.values ?? [];
        parts.set(aspect.id, [
            ...(i ? [line('seam', `M${left} ${r1(row)}H${left + w}`, [0, 0.2], 'seam')] : []),
            text(
                'name',
                left,
                mid + 10 * k,
                aspect.text ?? '',
                28 * k,
                [0.2, 0.5],
                'start',
                'note',
            ),
            text('a', col1, mid + 11 * k, x ?? '', 32 * k, [0.5, 0.75], 'start'),
            text('b', col2, mid + 11 * k, y ?? '', 32 * k, [0.75, 1], 'start'),
        ]);
    });
}

// Actors in equal columns, names 32 below the top, lifelines from 60 below the top to 10 past the last message and
// at least 140 below it. Messages run in rows from 90 below the top, at most 100 apart: an arrow 68% down its row
// under its text, breaking the lifelines it crosses, or a note station on its actor's lifeline.
function sequence(s: Op, sends: Op[], { left, top, w, h }: Box, parts: Parts) {
    const actors = s.actors ?? [];
    const n = sends.length;
    const k = scaleOf(n);
    const x = (i: number) => r1(left + (w * (i + 0.5)) / actors.length);
    const gap = Math.min(100, (h - 110) / Math.max(1, n));
    const row = (i: number) => top + 90 + gap * i;
    const end = r1(Math.max(top + 140, row(n) + 10));
    parts.set(s.id, [
        ...actors.map((actor, i) =>
            text(`name${i}`, x(i), top + 32, actor, 32, [0, 0.5], undefined, 'name'),
        ),
        ...actors.map((_, i) => line(`life${i}`, `M${x(i)} ${top + 60}V${end}`, [0.5, 1], 'rule')),
    ]);
    sends.forEach((send, i) => {
        const by = send.by ?? 0;
        if (send.to === undefined) {
            const y = row(i) + gap / 2;
            const last = by === actors.length - 1;
            parts.set(send.id, [
                {
                    key: 'station',
                    t: [0, 0.4],
                    kind: 'circle',
                    look: 'station',
                    x: x(by),
                    y: r1(y),
                    r: r1(12 * k),
                },
                text(
                    'text',
                    x(by) + (last ? -30 : 30),
                    y + 10 * k,
                    send.text ?? '',
                    30 * k,
                    [0.4, 1],
                    last ? 'end' : 'start',
                ),
            ]);
            return;
        }
        const y = r1(row(i) + 0.68 * gap);
        const [a, b] = [x(by), x(send.to)];
        const dir = Math.sign(b - a);
        const tip = b - 6 * dir;
        const crossed = actors
            .map((_, j) => j)
            .filter((j) => j > Math.min(by, send.to!) && j < Math.max(by, send.to!));
        parts.set(send.id, [
            // Drawn first, in the board's ground, so the text and arrow stay on top of the break.
            ...crossed.map((j) =>
                line(`gap${j}`, `M${x(j)} ${r1(y - 54 * k)}V${r1(y + 10)}`, [0.4, 0.5], 'gap'),
            ),
            text('text', (a + b) / 2, y - 20 * k, send.text ?? '', 30 * k, [0, 0.4]),
            line(
                'arrow',
                `M${a} ${y}H${tip}M${tip - 14 * dir} ${r1(y + 14 * dir)}L${tip} ${y}L${tip - 14 * dir} ${r1(y - 14 * dir)}`,
                [0.4, 1],
                'edge',
            ),
        ]);
    });
}

// The formula 110 below the top, centred, 28 between tokens: 72 math italic, operators upright, superscripts 44
// raised 30, all scaled down when it would not fit 40 inside the box. A meaning hangs off a leader from 24 below its
// symbol, 40 right, its text 56 right of the symbol's centre; rows start 80 below the formula, at most 72 apart, the
// rightmost symbol on top so no leader crosses a meaning.
function equation(e: Op, symbols: Op[], { left, top, w, h }: Box, parts: Parts) {
    const tokens = equationTokens(e.text ?? '');
    const width = (f: number) =>
        tokens.map((t) => t.base.length * MATH_EM * 72 * f + t.sup.length * EM * 44 * f);
    const natural = width(1).reduce((sum, v) => sum + v, 0) + 28 * (tokens.length - 1);
    const f = Math.min(1, (w - 80) / natural);
    const widths = width(f);
    const xs: number[] = [];
    widths.reduce((x, v, i) => ((xs[i] = x), x + v + 28 * f), left + w / 2 - (natural * f) / 2);
    const baseline = top + 110;
    parts.set(
        e.id,
        tokens.flatMap((t, i) => {
            const baseW = t.base.length * MATH_EM * 72 * f;
            const look = t.symbol ? 'math' : 'mathop';
            return [
                text(
                    `t${i}`,
                    xs[i],
                    baseline,
                    t.base,
                    72 * f,
                    [i / tokens.length, (i + 1) / tokens.length],
                    'start',
                    look,
                ),
                ...(t.sup
                    ? [
                          text(
                              `s${i}`,
                              xs[i] + baseW,
                              baseline - 30 * f,
                              t.sup,
                              44 * f,
                              [i / tokens.length, (i + 1) / tokens.length],
                              'start',
                              'math' as const,
                          ),
                      ]
                    : []),
            ];
        }),
    );
    const n = symbols.length;
    const k = scaleOf(n);
    const first = baseline + 80;
    const gap = Math.min(72, (top + h - 30 - first) / Math.max(1, n - 1));
    const centre = (s: Op) =>
        xs[s.token ?? 0] + (tokens[s.token ?? 0]?.base.length ?? 0) * MATH_EM * 36 * f;
    // Rightmost first; a tie keeps the order drawn.
    const order = symbols
        .map((s, i) => ({ s, i }))
        .sort((a, b) => centre(b.s) - centre(a.s) || a.i - b.i);
    order.forEach(({ s }, rank) => {
        const cx = r1(centre(s));
        const y = r1(first + gap * rank);
        parts.set(s.id, [
            line('leader', `M${cx} ${baseline + 24}V${y}H${r1(cx + 40)}`, [0, 0.5], 'leader'),
            text('means', cx + 56, y + 10 * k, s.means ?? '', 30 * k, [0.5, 1], 'start'),
        ]);
    });
}
