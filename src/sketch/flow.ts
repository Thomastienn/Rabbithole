// Flow: a small line diagram. Each rank is a column; a second child forks onto the next row down.
import {
    esc,
    isFocus,
    LINE,
    list,
    plain,
    quoted,
    ROW,
    WIDTH,
    wrap,
    type Drawing,
    type Line,
    type Palette,
} from './sketch.ts';

export function flow(lines: Line[], p: Palette): Drawing {
    const names: string[] = [],
        focus = new Set<string>(),
        edges: { a: string; b: string; label: string }[] = [];
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
    const back = new Set<(typeof edges)[number]>(),
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
    const column = WIDTH / (Math.max(...rank.values()) + 1),
        notesAbove = edges.some((e) => e.label && row.get(e.b) === 0),
        top = notesAbove ? 40 : 24,
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
    const rowBottom = new Map<number, number>();
    const text = (tx: number, ty: number, words: string, style: string, note = false) =>
        `<text${note ? ' class="sketch-note"' : ''} x="${tx}" y="${ty}" style="${style}">${esc(words)}</text>`;
    // One group per item, in the items' order; `--i` is its place in the sketch's build.
    const groups = names.map((n, k) => {
        const f = focus.has(n);
        const notes = runs
            .filter((r) => r.e.label && r.e.b === n)
            .map((r) =>
                text((r.from + x(r.e.b)) / 2, y(r.e.b) - 16, r.e.label, `fill:${p.muted}`, true),
            );
        const station = f
            ? `<circle cx="${x(n)}" cy="${y(n)}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
            : `<circle cx="${x(n)}" cy="${y(n)}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`;
        const labels = wrap(n, column - 24).map((l, i) => {
            const baseline = y(n) + (notesAbove ? 28 : 26) + LINE * i;
            bottom = Math.max(bottom, baseline);
            rowBottom.set(row.get(n)!, Math.max(rowBottom.get(row.get(n)!) ?? 0, baseline));
            return text(
                x(n),
                baseline,
                l,
                `fill:${f ? p.focus : p.ink}${f ? ';font-weight:600' : ''}`,
            );
        });
        return `<g style="--i:${k}">${notes.join('')}${station}${labels.join('')}</g>`;
    });
    // Each station's hit area (mockup Rabbithole-skt.6): its column less 8px, from 12px above the
    // station to 8px under its row's last label line; the outline sits inside it, the focus ring 2px outside.
    const hits = names.map((n, i) => {
        const w = column - 8,
            hx = x(n) - w / 2,
            hy = y(n) - 12,
            h = rowBottom.get(row.get(n)!)! + 8 - hy;
        return (
            `<g data-item="${i}"><rect class="sketch-hit" x="${hx}" y="${hy}" width="${w}" height="${h}"/>` +
            `<rect class="sketch-outline" x="${hx + 1}" y="${hy + 1}" width="${w - 2}" height="${h - 2}" rx="3"/>` +
            `<rect class="sketch-ring" x="${hx - 3}" y="${hy - 3}" width="${w + 6}" height="${h + 6}" rx="7"/></g>`
        );
    });
    const markup =
        `<svg class="sketch-flow" viewBox="0 0 ${WIDTH} ${bottom + (notesAbove ? 10 : 8)}">` +
        `<path class="sketch-line" style="stroke:${p.seam}" d="${runs.map((r) => r.d).join('')}"/>` +
        `<path class="sketch-arrow" style="stroke:${p.muted}" d="${[...chevrons].join('')}"/>` +
        groups.join('') +
        hits.join('') +
        '</svg>';
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
    return { items, markup };
}
