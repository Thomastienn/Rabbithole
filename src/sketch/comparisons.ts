// The kinds that set things side by side: compare, venn and pie.
import {
    CHAR,
    WIDTH,
    esc,
    isFocus,
    plain,
    quantity,
    quoted,
    wrap,
    type Drawing,
    type Line,
    type Palette,
    type Quantity,
} from './sketch.ts';

// Compare: `vs: A | B`, then one row per aspect, `aspect: A's value | B's value` (or `aspect | a | b`).
export function compare(lines: Line[], p: Palette, [head]: Line[]): Drawing {
    const names = head.text.replace(/^vs\s*:/i, '').split('|');
    if (names.length !== 2 || names.some((n) => !plain(n)))
        return { error: `${quoted(head)} is not vs: A | B` };
    const rows: string[][] = [];
    for (const line of lines) {
        // The tutor sometimes writes `aspect | a | b`: a bar before any colon ends the aspect.
        const bar = line.text.indexOf('|'),
            colon = line.text.indexOf(':'),
            cut = bar >= 0 && (colon < 0 || bar < colon) ? bar : colon,
            cells = [line.text.slice(0, cut), ...line.text.slice(cut + 1).split('|')];
        if (cut < 1 || cells.length !== 3 || cells.some((c) => !plain(c)))
            return { error: `${quoted(line)} is not aspect: A's value | B's value` };
        rows.push(cells);
    }
    // `--i` is the cell's place in the sketch's build: a row's cells come together, the names with the first.
    const cell = (raw: string, role: 'name' | 'aspect' | 'value', k = 0) => {
        const f = isFocus(raw),
            color = f ? p.focus : role === 'aspect' ? p.muted : '';
        return (
            `<span${f ? ' class="focus"' : ''} style="--i:${k}${color ? `;color:${color}` : ''}">${esc(plain(raw))}` +
            (role === 'name' ? `<s style="background:${f ? p.focus : p.seam}"></s>` : '') +
            '</span>'
        );
    };
    const [a, b] = names.map(plain);
    const markup =
        `<div class="sketch-compare" style="color:${p.ink};border-color:${p.hairline}"><span></span>` +
        names.map((n) => cell(n, 'name')).join('') +
        rows
            .map(([k, x, y], i) => cell(k, 'aspect', i) + cell(x, 'value', i) + cell(y, 'value', i))
            .join('') +
        '</div>';
    const items = rows.map((r) => {
        const [aspect, x, y] = r.map(plain),
            focus = r.some(isFocus);
        return {
            label: aspect,
            focus,
            text: `${aspect}: ${a}, ${x}; ${b}, ${y}${focus ? ', focus' : ''}`,
        };
    });
    return { items, markup, about: `comparing ${a} and ${b}` };
}

// Venn: two sets `name: item, item` and the items they share, `both: item, item`.
// Rings 160px wide each way and 160px apart, so the overlap is the middle third; they grow taller to fit.
const RX = 160,
    CLEAR = 8,
    ITEM_LINE = 20,
    ITEM_GAP = 6,
    // shortcut: wraps at 8px per character as the mockup does, fits the rings at flow's 7px; measure text if labels clip.
    VENN_CHAR = 8;

export function venn(lines: Line[], p: Palette): Drawing {
    const sets: { name: string; focus: boolean; items: string[] }[] = [],
        both: string[] = [];
    for (const line of lines) {
        const colon = line.text.indexOf(':'),
            name = plain(line.text.slice(0, Math.max(colon, 0))),
            items = line.text
                .slice(colon + 1)
                .split(',')
                .filter((i) => plain(i));
        if (colon < 1 || !name) return { error: `${quoted(line)} is not set: item, item` };
        if (/^both$/i.test(name)) both.push(...items);
        else sets.push({ name, focus: isFocus(line.text.slice(0, colon)), items });
    }
    if (sets.length !== 2) return { error: `needs two sets, found ${sets.length}` };
    const [left, right] = sets;
    const stacks = [
        { x: 160, at: 112, rings: [240], items: left.items, where: `${left.name} only` },
        { x: 320, at: 128, rings: [240, 400], items: both, where: 'both' },
        { x: 480, at: 112, rings: [400], items: right.items, where: `${right.name} only` },
    ];
    if (stacks.every((s) => !s.items.length)) return { error: 'no items' };
    if (stacks.flatMap((s) => s.items).length > 8) return { error: 'more than eight items' };
    // Each stack is centred on the rings' middle; a line's top is measured from it.
    let ry = 80;
    const laid = stacks.map((s) => {
        const blocks = s.items.map((raw) => wrap(plain(raw), s.at, VENN_CHAR));
        let top =
            -(blocks.flat().length * ITEM_LINE + Math.max(blocks.length - 1, 0) * ITEM_GAP) / 2;
        const tops = blocks.map((block) => {
            const at = block.map((_, i) => top + ITEM_LINE * i);
            top += block.length * ITEM_LINE + ITEM_GAP;
            return at;
        });
        // Every line's box stays 8px inside each ring it sits in.
        blocks.forEach((block, i) =>
            block.forEach((words, j) => {
                for (const cx of s.rings)
                    for (const dy of [tops[i][j], tops[i][j] + ITEM_LINE]) {
                        const dx = Math.abs(s.x - cx) + (words.length * CHAR) / 2,
                            room = Math.sqrt(Math.max(0.05, 1 - (dx / (RX - CLEAR)) ** 2));
                        ry = Math.max(ry, CLEAR + Math.abs(dy) / room);
                    }
            }),
        );
        return { ...s, blocks, tops };
    });
    ry = Math.round(ry);
    const names = [left, right].map((s) => wrap(s.name, 224, VENN_CHAR)),
        cy = 16 + 18 * (Math.max(...names.map((n) => n.length)) - 1) + 22 + ry;
    const text = (x: number, y: number, words: string, focus: boolean, note = false) =>
        `<text${note && !focus ? ' class="sketch-note"' : ''} x="${x}" y="${y}" style="fill:${focus ? p.focus : note ? p.muted : p.ink}${focus ? ';font-weight:600' : ''}">${esc(words)}</text>`;
    const markup =
        `<svg class="sketch-venn" viewBox="0 0 ${WIDTH} ${cy + ry + 4}">` +
        [left, right]
            .map(
                (s, i) =>
                    `<ellipse class="sketch-ring" cx="${240 + 160 * i}" cy="${cy}" rx="${RX}" ry="${ry}" style="stroke:${s.focus ? p.focus : p.seam}"/>`,
            )
            .join('') +
        names
            .flatMap((n, i) =>
                n.map((words, j) =>
                    text(160 + 320 * i, 16 + 18 * j, words, [left, right][i].focus, true),
                ),
            )
            .join('') +
        // One group per item, in the items' order; the rings and names come with the first.
        laid
            .flatMap((s) =>
                s.blocks.map((block, i) =>
                    block
                        .map((words, j) =>
                            text(s.x, cy + s.tops[i][j] + 15, words, isFocus(s.items[i])),
                        )
                        .join(''),
                ),
            )
            .map((g, k) => `<g style="--i:${k}">${g}</g>`)
            .join('') +
        '</svg>';
    const items = stacks.flatMap((s) =>
        s.items.map((raw) => {
            const label = plain(raw),
                focus = isFocus(raw);
            return { label, focus, text: [label, s.where, ...(focus ? ['focus'] : [])].join(', ') };
        }),
    );
    return { items, markup, about: `sets ${left.name} and ${right.name}` };
}

// Pie: `label: number`, shares of one whole, clockwise from 12 o'clock in the order written.
export function pie(lines: Line[], p: Palette): Drawing {
    const rows: Quantity[] = [];
    for (const line of lines) {
        const row = quantity(line);
        if ('error' in row) return row;
        if (row.n < 0) return { error: `${quoted(line)} is negative` };
        rows.push(row);
    }
    const total = rows.reduce((t, r) => t + r.n, 0);
    if (!total) return { error: 'no share above zero' };
    // Values with no unit (or a %) that sum to 100 are already the shares, shown as written.
    const asWritten =
        rows.every((r) => /^\s*%?$/.test(r.value.slice(r.number.length))) &&
        Math.abs(total - 100) < 1e-6;
    const share = (r: Quantity) =>
        asWritten
            ? `${r.number}%`
            : r.n && r.n / total < 0.01
              ? '<1%'
              : `${Math.round((r.n / total) * 100)}%`;
    const at = (turn: number, r: number) =>
        `${+(88 + r * Math.sin(turn * 2 * Math.PI)).toFixed(1)} ${+(88 - r * Math.cos(turn * 2 * Math.PI)).toFixed(1)}`;
    let from = 0;
    const slices = rows.map((r, i) => {
        const part = r.n / total,
            // A whole-pie slice stops short, far enough that its rounded arc ends stay apart.
            to = from + Math.min(part, 0.999),
            big = part > 0.5 ? 1 : 0,
            d = `M${at(from, 80)}A80 80 0 ${big} 1 ${at(to, 80)}L${at(to, 48)}A48 48 0 ${big} 0 ${at(from, 48)}Z`;
        from += part;
        // Slices are told apart by the ground-coloured gap and alternating opacity, never by hue.
        const tone = r.focus ? p.focus : p.seam,
            half = !r.focus && i % 2 ? ';fill-opacity:0.5' : '';
        return r.n
            ? `<path class="sketch-slice" style="--i:${i};fill:${tone};stroke:${p.ground}${half}" d="${d}"/>`
            : '';
    });
    const markup =
        `<div class="sketch-pie"><svg viewBox="0 0 176 176">${slices.join('')}</svg>` +
        `<dl${asWritten ? ' class="as-written"' : ''} style="color:${p.ink}">` +
        rows
            .map((r, i) => {
                const f = r.focus ? ' class="focus"' : '',
                    ink = ` style="--i:${i}${r.focus ? `;color:${p.focus}` : ''}"`;
                return (
                    `<dt${f}${ink}><s style="background:${r.focus ? p.focus : p.seam}${!r.focus && i % 2 ? ';opacity:0.5' : ''}"></s>${esc(r.label)}</dt>` +
                    (asWritten ? '' : `<dd${f}${ink}>${esc(r.value)}</dd>`) +
                    `<dd class="share${r.focus ? ' focus' : ''}" style="--i:${i};color:${p.muted}">${esc(share(r))}</dd>`
                );
            })
            .join('') +
        '</dl></div>';
    const items = rows.map((r) => ({
        label: r.label,
        focus: r.focus,
        text: [
            r.label,
            ...(asWritten ? [] : [r.value]),
            share(r),
            ...(r.focus ? ['focus'] : []),
        ].join(', '),
    }));
    return { items, markup, about: 'shares of a whole' };
}
