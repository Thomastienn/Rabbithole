// Flow: a small line diagram. Each rank is a column; a second child forks onto the next row down.
// A box too narrow for its columns turns it vertical: ranks run down, rows become lanes.
import {
    CHAR,
    group,
    isFocus,
    LINE,
    list,
    plain,
    quoted,
    ring,
    ROW,
    tone,
    wrap,
    write,
    type Drawing,
    type Line,
    type Palette,
} from './sketch.ts';

// shortcut: 13px arrow labels are estimated at 6.4px per character; measure text if they clip.
const noteWidth = (s: string) => s.length * 6.4;

export function flow(lines: Line[], p: Palette, _heads: Line[], width: number): Drawing {
    const names: string[] = [],
        focus = new Set<string>(),
        edges: Edge[] = [];
    const node = (raw: string) => {
        const name = plain(raw);
        if (isFocus(raw)) focus.add(name);
        if (!names.includes(name)) names.push(name);
        return name;
    };
    for (const line of lines) {
        const steps = line.text.split(/\s*-+>\s*/);
        const last = steps.at(-1)!,
            colon = last.indexOf(':'),
            label = colon < 0 ? '' : plain(last.slice(colon + 1));
        if (colon >= 0) steps[steps.length - 1] = last.slice(0, colon);
        if (steps.length < 2 || steps.some((s) => !plain(s)))
            return { error: `${quoted(line)} is not A -> B` };
        if (edges.length + steps.length - 1 > 8) return { error: 'more than eight steps' };
        for (let i = 0; i + 1 < steps.length; i++)
            edges.push({
                a: node(steps[i]),
                b: node(steps[i + 1]),
                label: i + 2 === steps.length ? label : '',
            });
    }
    // A step's rank is its longest path from a start; edges back into the path (loops) are left out of it.
    const back = new Set<Edge>(),
        state = new Map<string, number>();
    const visit = (n: string) => {
        state.set(n, 1);
        for (const e of edges.filter((e) => e.a === n))
            if (state.get(e.b) === 1) back.add(e);
            else if (!state.get(e.b)) visit(e.b);
        state.set(n, 2);
    };
    names.forEach((n) => state.get(n) || visit(n));
    const forward = edges.filter((e) => !back.has(e)),
        rank = new Map(names.map((n) => [n, 0]));
    for (let k = 0; k < names.length; k++)
        for (const e of forward) rank.set(e.b, Math.max(rank.get(e.b)!, rank.get(e.a)! + 1));
    // Each row is one path: a step stays on the row of a parent whose first child it is.
    const row = new Map<string, number>();
    let rows = 0;
    for (const n of [...names].sort((a, b) => rank.get(a)! - rank.get(b)!)) {
        const parent = forward.find((e) => e.b === n && forward.find((f) => f.a === e.a)?.b === n);
        row.set(n, parent && row.has(parent.a) ? row.get(parent.a)! : rows++);
    }
    const items = names.map((n) => {
        const next = edges
            .filter((e) => e.a === n)
            .map((e) => e.b + (e.label ? `: ${e.label}` : ''));
        return {
            label: n,
            focus: focus.has(n),
            text: [
                n,
                ...(next.length ? [`leads to ${list(next)}`] : []),
                ...(focus.has(n) ? ['focus'] : []),
            ].join(', '),
        };
    });
    const column = width / (Math.max(...rank.values()) + 1);
    if (column < (rows > 1 ? 160 : 120))
        return { items, markup: down({ names, edges, forward, rank, row, rows, focus }, width, p) };
    const noteLines = Math.max(
            0,
            ...edges
                .filter((e) => e.label && row.get(e.b) === 0)
                .map((e) => wrap(e.label, column - 24, noteWidth).length),
        ),
        notesAbove = noteLines > 0,
        top = 24 + 16 * noteLines,
        x = (n: string) => column * (rank.get(n)! + 0.5),
        y = (n: string) => top + ROW * row.get(n)!;
    // Each edge turns only at 45 or 90 degrees, then runs straight along its target's row.
    const runs = edges.map((e) => {
        const [sx, sy, tx, ty] = [x(e.a), y(e.a), x(e.b), y(e.b)],
            drop = Math.abs(ty - sy);
        if (sy === ty) return { e, d: `M${sx} ${sy}H${tx}`, from: sx };
        const start = sy < ty ? tx - 32 - drop : sx + 32;
        if (start >= sx && start + drop <= tx)
            return {
                e,
                d: `M${sx} ${sy}H${start}L${start + drop} ${ty}H${tx}`,
                from: start + drop,
            };
        return { e, d: `M${sx} ${sy}V${ty}H${tx}`, from: sx };
    });
    // Steps into one station share a chevron, on the run after the last merge.
    const chevrons = new Set<string>();
    for (const n of names) {
        const into = runs.filter((r) => r.e.b === n);
        if (!into.length) continue;
        const tx = x(n),
            way = into[0].from <= tx ? 1 : -1,
            from =
                way > 0
                    ? Math.max(...into.map((r) => r.from))
                    : Math.min(...into.map((r) => r.from)),
            // Centre a short fork approach and give a chevron after a rejoin more room past the bend.
            offset = into.length > 1 ? 4 : from === x(into[0].e.a) ? 2 : 0,
            tip = (from + tx) / 2 + offset * way;
        chevrons.add(`M${tip - 5 * way} ${y(n) - 5}L${tip} ${y(n)}L${tip - 5 * way} ${y(n) + 5}`);
    }
    let bottom = 0;
    // One group per item, in the items' order; `--i` is its place in the sketch's build.
    const groups = names.map((n, k) => {
        const notes = runs
            .filter((r) => r.e.label && r.e.b === n)
            .flatMap((r) => {
                const words = wrap(r.e.label, column - 24, noteWidth);
                return words.map((l, i) =>
                    write(
                        (r.from + x(r.e.b)) / 2,
                        y(r.e.b) - 16 * (words.length - i),
                        l,
                        `fill:${p.muted}`,
                        'sketch-note',
                    ),
                );
            });
        const labels = wrap(n, column - 24).map((l, i) => {
            const baseline = y(n) + (notesAbove ? 28 : 26) + LINE * i;
            bottom = Math.max(bottom, baseline);
            return write(x(n), baseline, l, tone(p, focus.has(n)));
        });
        return group(k, notes.join('') + ring(x(n), y(n), focus.has(n), p) + labels.join(''));
    });
    const markup =
        `<svg class="sketch-flow" viewBox="0 0 ${width} ${bottom + (notesAbove ? 10 : 8)}">` +
        paths(runs.map((r) => r.d).join(''), [...chevrons].join(''), p) +
        groups.join('') +
        '</svg>';
    return { items, markup };
}

type Edge = { a: string; b: string; label: string };
type Graph = {
    names: string[];
    edges: Edge[];
    forward: Edge[];
    rank: Map<string, number>;
    row: Map<string, number>;
    rows: number;
    focus: Set<string>;
};
const paths = (lines: string, chevrons: string, p: Palette) =>
    `<path class="sketch-line" style="stroke:${p.seam}" d="${lines}"/>` +
    `<path class="sketch-arrow" style="stroke:${p.muted}" d="${chevrons}"/>`;

// Vertical flow: stations in reading order down a line 8px from the left, each row on a lane 24px further right,
// labels beside them from 20px right of the last lane. Mockup Rabbithole-skt.5.
function down({ names, edges, forward, rank, row, rows, focus }: Graph, width: number, p: Palette) {
    const lane = (n: string) => 8 + 24 * row.get(n)!,
        left = 8 + 24 * (rows - 1) + 20,
        room = width - left,
        order = [...names].sort((a, b) => rank.get(a)! - rank.get(b)! || row.get(a)! - row.get(b)!),
        labels = new Map(names.map((n) => [n, wrap(n, room)])),
        notes = new Map(edges.map((e) => [e, e.label ? wrap(e.label, room, noteWidth) : []])),
        y = new Map<string, number>(),
        // An arrow back up to an earlier step (a loop) has its label under its source's label.
        loops = (n: string) =>
            edges.filter((e) => e.a === n && !forward.includes(e)).flatMap((e) => notes.get(e)!);
    // 44px a step, 72px before a rejoin, plus room for the previous label's extra lines and an arrow label.
    order.forEach((n, k) => {
        const into = forward.filter((e) => e.b === n),
            prev = order[k - 1],
            note = Math.max(0, ...into.map((e) => notes.get(e)!.length));
        y.set(
            n,
            k === 0
                ? 12
                : y.get(prev)! +
                      (into.some((e) => lane(e.a) > lane(n)) ? 72 : 44) +
                      LINE * (labels.get(prev)!.length - 1) +
                      16 * loops(prev).length +
                      (note ? 20 + 16 * (note - 1) : 0),
        );
    });
    const forks = (n: string) => forward.filter((e) => e.a === n).length > 1;
    // A step changing lanes leaves its station 12px down and turns 45 degrees onto the target's lane.
    const runs = edges.map((e) => {
        const [sx, sy, tx, ty] = [lane(e.a), y.get(e.a)!, lane(e.b), y.get(e.b)!];
        if (sx === tx) return { e, d: `M${sx} ${sy}V${ty}`, from: sy + (forks(e.a) ? 12 : 0) };
        const bend = sy + 12 + Math.abs(tx - sx);
        return { e, d: `M${sx} ${sy}V${sy + 12}L${tx} ${bend}V${ty}`, from: bend };
    });
    let bottom = 0,
        right = 0;
    const chevrons: string[] = [],
        groups = names.map((n, k) => {
            const cx = lane(n),
                cy = y.get(n)!,
                // Steps into one station share a chevron, pointing down the run after the last merge.
                into = runs.filter((r) => r.e.b === n && r.from < cy),
                tip = into.length && (Math.max(...into.map((r) => r.from)) + cy) / 2 + 2;
            if (into.length)
                chevrons.push(`M${cx - 5} ${tip - 5}L${cx} ${tip}L${cx + 5} ${tip - 5}`);
            const lines = [
                ...into
                    .flatMap((r) => notes.get(r.e))
                    .map((l, i) =>
                        write(left, tip + 2 + 16 * i, l!, `fill:${p.muted}`, 'sketch-note'),
                    ),
                ...labels.get(n)!.map((l, i) => {
                    bottom = Math.max(bottom, cy + 5 + LINE * i);
                    return write(left, cy + 5 + LINE * i, l, tone(p, focus.has(n)));
                }),
                ...loops(n).map((l, i) => {
                    const at = cy + 5 + LINE * (labels.get(n)!.length - 1) + 16 * (i + 1);
                    bottom = Math.max(bottom, at);
                    return write(left, at, l, `fill:${p.muted}`, 'sketch-note');
                }),
            ];
            right = Math.max(
                right,
                ...[...labels.get(n)!, ...into.flatMap((r) => notes.get(r.e)!), ...loops(n)].map(
                    (l) => l.length * CHAR,
                ),
            );
            return group(k, ring(cx, cy, focus.has(n), p) + lines.join(''));
        });
    // Every station has a label, so the last baseline sets the height.
    const w = Math.min(width, left + right),
        tall = bottom + 7;
    return (
        `<svg class="sketch-flow sketch-down" width="${w}" height="${tall}" viewBox="0 0 ${w} ${tall}">` +
        paths(runs.map((r) => r.d).join(''), chevrons.join(''), p) +
        groups.join('') +
        '</svg>'
    );
}
