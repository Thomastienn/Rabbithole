// Sketch kinds for exchanges and formulas: sequence, equation and grid (mockup Rabbithole-skt.4).
import { minus, r1 } from './plot.ts';
import { esc, isFocus, plain, quoted, type Drawing, type Line, type Palette } from './sketch.ts';

const kv = (text: string) => {
    const i = text.indexOf(':');
    return i < 0 ? undefined : [text.slice(0, i).trim(), text.slice(i + 1).trim()];
};
// Starred words in the focus colour, the rest escaped.
const rich = (s: string, p: Palette) =>
    esc(s)
        .replace(/\*([^*]+)\*/g, `<em style="color:${p.focus}">$1</em>`)
        .replace(/\*/g, '');

// Sequence: labels wrap by an estimate of the 14px reading face, a starred phrase marked across the wrap.
type Piece = { t: string; f: boolean };
// shortcut: 8.5px per character of the 14px reading face; measure text if labels wrap badly.
const SEQ_CHAR = 8.5;
function wrapRich(s: string, width: number) {
    const words: Piece[][] = [[]];
    s.split('*').forEach((part, i) =>
        part.split(/(\s+)/).forEach((t, j) => {
            if (j % 2) words.push([]);
            else if (t) words.at(-1)!.push({ t, f: i % 2 === 1 });
        }),
    );
    const out: Piece[][] = [];
    let used = 0;
    for (const w of words.filter((w) => w.length)) {
        const len = w.reduce((n, piece) => n + piece.t.length, 0);
        if (out.length && (used + 1 + len) * SEQ_CHAR <= width) {
            out.at(-1)!.push({ t: ' ', f: false }, ...w);
            used += 1 + len;
        } else {
            out.push([...w]);
            used = len;
        }
    }
    return out;
}

export function sequence(lines: Line[], p: Palette): Drawing {
    const head = /^actors\s*:(.*)$/i.exec(lines[0].text);
    const actors = head ? head[1].split('|').map(plain).filter(Boolean) : [];
    if (actors.length < 2) return { error: `${quoted(lines[0])} is not actors: A | B` };
    const col = 640 / actors.length,
        X = (a: string) => r1(col * (actors.indexOf(a) + 0.5)),
        strong = (pieces: Piece[]) =>
            pieces
                .map((x) =>
                    x.f
                        ? `<tspan style="fill:${p.focus};font-weight:600">${esc(x.t)}</tspan>`
                        : esc(x.t),
                )
                .join('');
    let y = 36,
        body = '',
        gaps = '';
    const items = [
        { label: actors.join(', '), focus: false, text: `Actors: ${actors.join(', ')}` },
    ];
    for (const line of lines.slice(1)) {
        const message = /^(.+?)\s*-+>\s*([^:]+?)\s*(?::(.*))?$/.exec(line.text),
            note = message ? undefined : kv(line.text),
            names = message ? [message[1], message[2]] : note?.[1] ? [note[0]] : [];
        if (!names.length || !names.every(plain))
            return { error: `${quoted(line)} is not A -> B: message or A: note` };
        const stranger = names.map(plain).find((n) => !actors.includes(n));
        if (stranger) return { error: `${quoted(line)} names ${stranger}, who is not in actors` };
        const focus = isFocus(line.text);
        if (message) {
            const [a, b] = [X(plain(message[1])), X(plain(message[2]))];
            if (a === b) return { error: `${quoted(line)} sends to itself` };
            const text = (message[3] ?? '').trim(),
                rows = text ? wrapRich(text, Math.abs(b - a) - 16) : [],
                lineY = y + 30 + 18 * Math.max(rows.length - 1, 0),
                way = b > a ? 1 : -1,
                tip = b - 8 * way,
                mark = focus ? p.focus : p.seam;
            body +=
                rows
                    .map(
                        (r, k) =>
                            `<text x="${r1((a + b) / 2)}" y="${y + 18 + 18 * k}" style="fill:${p.ink}">${strong(r)}</text>`,
                    )
                    .join('') +
                `<path class="sketch-line" style="stroke:${mark}" d="M${a} ${lineY}H${b}"/>` +
                `<path class="sketch-arrow" style="stroke:${focus ? p.focus : p.muted}" d="M${tip - 5 * way} ${lineY - 5}L${tip} ${lineY}L${tip - 5 * way} ${lineY + 5}"/>`;
            for (const c of actors.map(X).filter((c) => (c - a) * (c - b) < 0))
                gaps += `M${c} ${y + 4}V${lineY + 6}`;
            const [from, to] = [plain(message[1]), plain(message[2])];
            items.push({
                label: plain(text) || `${from} to ${to}`,
                focus,
                text: [
                    `${from} to ${to}${text ? `: ${plain(text)}` : ''}`,
                    ...(focus ? ['focus'] : []),
                ].join(', '),
            });
            y = lineY + 14;
        } else {
            const who = plain(note![0]),
                x = X(who),
                last = actors.indexOf(who) === actors.length - 1,
                rows = wrapRich(note![1], col - 28);
            body +=
                (focus
                    ? `<circle cx="${x}" cy="${y + 16}" r="7" style="fill:${p.focus};stroke:${p.focus}"/>`
                    : `<circle cx="${x}" cy="${y + 16}" r="6" style="fill:${p.ground};stroke:${p.muted}"/>`) +
                rows
                    .map(
                        (r, k) =>
                            `<text class="${last ? 'sketch-end' : 'sketch-start'}" x="${r1(x + (last ? -14 : 14))}" y="${y + 21 + 18 * k}" style="fill:${p.ink}">${strong(r)}</text>`,
                    )
                    .join('');
            items.push({
                label: plain(note![1]),
                focus,
                text: [`${who}, note: ${plain(note![1])}`, ...(focus ? ['focus'] : [])].join(', '),
            });
            y += 32 + 18 * Math.max(rows.length - 1, 0);
        }
    }
    const markup =
        `<svg class="sketch-sequence" viewBox="0 0 640 ${y + 8}">` +
        `<path class="sketch-life" style="stroke:${p.seam}" d="${actors.map((a) => `M${X(a)} 26V${y + 4}`).join('')}"/>` +
        (gaps ? `<path class="sketch-gap" style="stroke:${p.ground}" d="${gaps}"/>` : '') +
        actors
            .map((a) => `<text x="${X(a)}" y="14" style="fill:${p.ink}">${esc(a)}</text>`)
            .join('') +
        body +
        '</svg>';
    return { items, markup };
}

// Equation: symbols in the math font, Latin and small Greek letters italic as MathML sets <mi>.
const UPRIGHT = new Set([
    'sin',
    'cos',
    'tan',
    'ln',
    'log',
    'exp',
    'mod',
    'lim',
    'max',
    'min',
    'det',
]);
const italic = (s: string) =>
    UPRIGHT.has(s)
        ? `<span class="up">${esc(s)}</span>`
        : [...s]
              .map((c) =>
                  c === 'h'
                      ? 'ℎ'
                      : /[a-z]/.test(c)
                        ? String.fromCodePoint(0x1d44e + c.charCodeAt(0) - 97)
                        : /[A-Z]/.test(c)
                          ? String.fromCodePoint(0x1d434 + c.charCodeAt(0) - 65)
                          : /[α-ω]/.test(c)
                            ? String.fromCodePoint(0x1d6fc + c.charCodeAt(0) - 0x3b1)
                            : esc(minus(c)),
              )
              .join('');
const spoken = (s: string) => s.replace(/[{}]/g, '');

export function equation(lines: Line[], p: Palette): Drawing {
    const head = /^eq\s*:(.*)$/i.exec(lines[0].text);
    const tokens = (head?.[1] ?? '').split(/\s+/).filter(Boolean).map(plain);
    if (!tokens.length) return { error: `${quoted(lines[0])} is not eq: …` };
    // A token is a symbol with an optional _subscript and ^superscript; the superscript is its own symbol.
    const parts = tokens.map((t) => {
        const m = /^([^_^]+(?:_(?:\{[^}]*\}|[^_^]+))?)(?:\^(\{[^}]*\}|.+))?$/.exec(t);
        return { whole: t, base: m ? m[1] : t, sup: m?.[2] ? spoken(m[2]) : undefined };
    });
    const meanings = new Map<string, { meaning: string; focus: boolean; row: number }>(),
        items = [
            {
                label: tokens.join(' '),
                focus: false,
                text: `Equation: ${parts.map((t) => spoken(t.base).replace('_', ' sub ') + (t.sup ? ` superscript ${t.sup}` : '')).join(' ')}`,
            },
        ];
    for (const line of lines.slice(1)) {
        const pair = kv(line.text);
        if (!pair || !plain(pair[0]) || !pair[1])
            return { error: `${quoted(line)} is not symbol: meaning` };
        const symbol = plain(pair[0]);
        const key = parts.some((t) => t.whole === symbol)
            ? symbol
            : parts.find((t) => t.base === symbol || t.sup === symbol) && symbol;
        if (!key)
            return {
                error: `${quoted(line)} annotates ${symbol}, which is not a symbol of the equation`,
            };
        if (meanings.has(key)) return { error: `${quoted(line)} annotates ${symbol} twice` };
        const focus = isFocus(line.text);
        meanings.set(key, {
            meaning: isFocus(pair[0]) ? `*${plain(pair[1])}*` : pair[1],
            focus,
            row: 0,
        });
        items.push({
            label: symbol,
            focus,
            text: [`${symbol}: ${plain(pair[1])}`, ...(focus ? ['focus'] : [])].join(', '),
        });
    }
    // The rightmost annotated symbol takes the top row, so no leader crosses a meaning.
    const order = parts
        .flatMap((t) => [t.whole, t.base, t.sup])
        .filter((k, i, all) => k && meanings.has(k) && all.indexOf(k) === i);
    order.forEach((k, i) => (meanings.get(k!)!.row = order.length - 1 - i));
    const symbol = (key: string | undefined, html: string) => {
        const m = key === undefined ? undefined : meanings.get(key);
        if (!m) return html;
        const mark = m.focus ? p.focus : p.seam;
        return (
            `<span class="an"${m.focus ? ` style="color:${p.focus}"` : ''}>${html}` +
            `<b class="ld" style="--r:${m.row};border-color:${mark}"><span style="color:${p.ink}">${rich(m.meaning, p)}</span></b></span>`
        );
    };
    const sym = (s: string) => {
        const [base, sub] = s.split(/_(.*)/s);
        return italic(base) + (sub ? `<sub>${italic(spoken(sub))}</sub>` : '');
    };
    const markup =
        `<div class="sketch-eq" style="--rows:${order.length};color:${p.ink}">` +
        parts
            .map(
                (t) =>
                    `<span class="tk">${
                        meanings.has(t.whole)
                            ? symbol(
                                  t.whole,
                                  sym(t.base) + (t.sup ? `<sup>${italic(t.sup)}</sup>` : ''),
                              )
                            : symbol(t.base, sym(t.base)) +
                              (t.sup ? symbol(t.sup, `<sup>${italic(t.sup)}</sup>`) : '')
                    }</span>`,
            )
            .join('') +
        '</div>';
    return { items, markup };
}

// Grid: rows of cells; `name:` captions the grid below it; a line of only ×, =, + or → joins two grids.
const JOINS = new Map([
    ['×', 'times'],
    ['=', 'equals'],
    ['+', 'plus'],
    ['→', 'to'],
]);
const isNumber = (s: string) => /^[-−]?(\d+(\.\d+)?|\.\d+)$/.test(plain(s));

export function grid(lines: Line[], p: Palette): Drawing {
    type Block = { name: string; join: string; rows: string[][]; at: Line };
    const blocks: Block[] = [];
    let join = '',
        name = '';
    for (const line of lines) {
        if (JOINS.has(line.text.replace('->', '→'))) {
            if (!blocks.length || join || name)
                return { error: `${quoted(line)} joins nothing before it` };
            join = line.text.replace('->', '→');
        } else if (line.text.endsWith(':') && !line.text.includes('|')) {
            if (name) return { error: `${quoted(line)} follows a name with no rows` };
            name = plain(line.text.slice(0, -1));
        } else {
            const cells = (
                line.text.includes('|') ? line.text.split('|') : line.text.split(/\s+/)
            ).map((c) => c.trim());
            const open = blocks.at(-1);
            if (!open || join || name) blocks.push({ name, join, rows: [cells], at: line });
            else if (cells.length !== open.rows[0].length)
                return {
                    error: `${quoted(line)} has ${cells.length} cells where its grid has ${open.rows[0].length}`,
                };
            else if (open.rows.length === 8) return { error: `${quoted(line)} is a ninth row` };
            else open.rows.push(cells);
            join = name = '';
        }
    }
    if (join) return { error: `${quoted(lines.at(-1)!)} joins nothing after it` };
    if (name || !blocks.length)
        return { error: `${quoted(lines.at(-1)!)} names a grid with no rows` };
    const empty = blocks.find((b) => b.rows.flat().some((c) => !plain(c)));
    if (empty) return { error: `${quoted(empty.at)} has an empty cell` };
    const joined = blocks.some((b) => b.join);
    const markup =
        `<div class="sketch-grids${joined ? '' : ' stack'}">` +
        blocks
            .map((b) => {
                const table = !b.rows.flat().every(isNumber);
                const cells = b.rows.flatMap((row, r) =>
                    row.map((c) => {
                        const head = table && r === 0 && b.rows.length > 1,
                            f = isFocus(c),
                            style = `background:${p.ground};color:${head ? p.muted : f ? p.focus : p.ink}${head ? `;border-bottom-color:${p.seam}` : ''}${f ? `;outline-color:${p.focus}` : ''}`;
                        return `<i class="${[head && 'h', f && 'f'].filter(Boolean).join(' ')}" style="${style}">${isNumber(c) ? esc(minus(plain(c))) : rich(c, p)}</i>`;
                    }),
                );
                return (
                    (b.join
                        ? `<span class="op" style="color:${p.muted}">${esc(b.join)}</span>`
                        : '') +
                    `<div class="gb">${b.name ? `<span class="gc" style="color:${p.muted}">${esc(b.name)}</span>` : ''}` +
                    `<div class="gd${table ? ' tbl' : ''}" style="--c:${b.rows[0].length};background:${p.seam}">${cells.join('')}</div></div>`
                );
            })
            .join('') +
        '</div>';
    const items = blocks.map((b) => {
        const n = b.rows.length,
            c = b.rows[0].length,
            rows = b.rows.map((row) =>
                row
                    .map((cell) => minus(plain(cell)) + (isFocus(cell) ? ', focus' : ''))
                    .join(n > 1 ? ', ' : '; '),
            );
        return {
            label: b.name || 'table',
            focus: b.rows.flat().some(isFocus),
            text: `${b.join ? `${JOINS.get(b.join)} ` : ''}${b.name ? `${b.name}, ` : ''}table, ${n} row${n > 1 ? 's' : ''}, ${c} column${c > 1 ? 's' : ''}: ${rows.join('; ')}`,
        };
    });
    return { items, markup };
}
