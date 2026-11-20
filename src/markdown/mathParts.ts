// KaTeX MathML whose symbols carry the raw [data-o, data-e) of their LaTeX, so a selection inside a formula is a LaTeX span.
// KaTeX's parse tree and MathML tree are internal: package.json pins katex and test/chat/display-math.test.mjs covers the mapping.
import katex from 'katex';

type Span = { start: number; end: number };
type Parsed = { type: string; loc?: Span & { lexer: { input: string } } } & Record<string, any>;
type Built = {
    type?: string;
    children?: Built[];
    classes?: string[];
    attributes?: Record<string, string>;
    setAttribute?: (name: string, value: string) => void;
    toMarkup(): string;
    toText?(): string;
};
// An underline over part of a formula: its React props become MathML attributes, the Tab stop's on the first piece only.
export type MathMark = Span & {
    props: { className: string; style?: object } & Record<string, unknown>;
};
const internal = katex as unknown as {
    __parse(tex: string, options: object): Parsed[];
    __renderToDomTree(tex: string, options: object): Built;
};
const union = (spans: (Span | undefined)[]) => {
    const all = spans.filter((s): s is Span => !!s);
    return all.length
        ? { start: Math.min(...all.map((s) => s.start)), end: Math.max(...all.map((s) => s.end)) }
        : undefined;
};
const nodes = (value: unknown): Parsed[] =>
    Array.isArray(value)
        ? value.flatMap(nodes)
        : value && typeof (value as Parsed).type === 'string'
          ? [value as Parsed]
          : [];
const fields = ['body', 'base', 'sup', 'sub', 'numer', 'denom', 'index'];
const parts = (n: Parsed) => fields.flatMap((k) => nodes(n[k])).filter((p) => !filler(p));
// What KaTeX adds with no LaTeX of its own (the {} before an aligned =, primes, empty cells, kerns) neither widens nor hides a group.
const filler = (n: Parsed): boolean =>
    !n.loc &&
    (n.text === '\\prime' ||
        n.type === 'kern' ||
        ((n.type === 'ordgroup' || n.type === 'styling') && !parts(n).length));
const find = (m: Built | undefined, type: string): Built | undefined =>
    m?.type === type ? m : m?.children?.map((c) => find(c, type)).find(Boolean);
// The source around a group whose parse node has no location: \left…\right, environments, else a command and its brace.
const delimiter = String.raw`\s*(?:\\[a-zA-Z]+|\\.|\S)`;
const wraps: Record<string, [string, string]> = {
    leftright: [String.raw`\\left${delimiter}`, String.raw`\\right${delimiter}`],
    array: [String.raw`\\begin\{[^}]*\}(?:\s*\{[^}]*\})?`, String.raw`\\end\{[^}]*\}`],
};
const command: [RegExp, RegExp] = [/\\[a-zA-Z]+\*?\s*(\{\s*)?$/, /^\s*\}/];

export function mathMarkup(tex: string, at: number, display: boolean, marks: MathMark[] = []) {
    const options = {
        output: 'mathml',
        throwOnError: false,
        trust: false,
        displayMode: display,
        errorColor: 'currentColor',
    };
    const out = internal.__renderToDomTree(tex, options),
        top = find(out, 'semantics')?.children?.[0];
    let tree: Parsed[] | undefined;
    try {
        tree = internal.__parse(tex, options);
    } catch {}
    const spans = new Map<Parsed, Span | undefined>();
    // Operators such as \sum keep no location; they are found in source order after what precedes them.
    let cursor = 0;
    const locate = (n: Parsed) => {
        if (n.loc?.lexer.input === tex) cursor = Math.max(cursor, n.loc.end);
        else if (n.type === 'op' && n.name) {
            const name = new RegExp(
                `${n.name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}(?![a-zA-Z])`,
                'g',
            );
            name.lastIndex = cursor;
            const hit = name.exec(tex);
            if (hit) spans.set(n, { start: hit.index, end: (cursor = hit.index + n.name.length) });
        }
        Object.values(n).forEach((v) => nodes(v).forEach(locate));
    };
    // A group with a part of unknown source has no span, so its symbols fall back to a wider group, never a narrower one.
    function spanOf(n: Parsed | undefined): Span | undefined {
        if (!n) return;
        if (n.loc?.lexer.input === tex) return n.loc;
        if (spans.has(n)) return spans.get(n);
        const known = parts(n).map(spanOf);
        let s = known.length && known.every(Boolean) ? union(known) : undefined;
        if (s && n.type === 'supsub' && n.sup && filler(n.sup))
            s.end += /^\s*'+/.exec(tex.slice(s.end))?.[0].length ?? 0;
        if (s && n.type !== 'ordgroup' && n.type !== 'supsub') {
            const wrap = wraps[n.type],
                [open, close] = wrap
                    ? [new RegExp(`${wrap[0]}\\s*$`), new RegExp(`^\\s*${wrap[1]}`)]
                    : command,
                a = open.exec(tex.slice(0, s.start)),
                b = a && (wrap || a[1]) ? close.exec(tex.slice(s.end)) : null;
            s = { start: s.start - (a?.[0].length ?? 0), end: s.end + (b?.[0].length ?? 0) };
        }
        // Only a known span is kept: a gap filled later can still make this one known.
        if (s) spans.set(n, s);
        return s;
    }
    // Macro expansions (\dots, \R, \implies) keep no location of their own; each takes the source between its known
    // neighbours, inside the bounds its parent leaves (braces, \left…\right, \begin…\end; cells and rows are neighbours).
    function fill(list: Parsed[], lo?: number, hi?: number) {
        const bounds = (i: number) => [
            [lo, ...list.slice(0, i).map((n) => spanOf(n)?.end)]
                .filter((x) => x !== undefined)
                .pop(),
            [...list.slice(i + 1).map((n) => spanOf(n)?.start), hi].find((x) => x !== undefined),
        ];
        list.forEach((n, i) => {
            let [a, b] = bounds(i);
            const wrap = wraps[n.type],
                inner = a !== undefined && b !== undefined && wrap && tex.slice(a, b),
                open = inner && new RegExp(`^\\s*${wrap[0]}`).exec(inner),
                close = inner && new RegExp(`${wrap[1]}\\s*$`).exec(inner);
            if (open && close) [a, b] = [a! + open[0].length, b! - close[0].length];
            if (n.loc?.lexer.input === tex && tex[n.loc.start] === '{')
                [a, b] = [n.loc.start + 1, n.loc.end - 1];
            for (const k of fields) fill(nodes(n[k]), ...(Array.isArray(n[k]) ? [a, b] : []));
        });
        // A gap loses its cell and row separators.
        list.forEach((n, i) => {
            const [a, b] = bounds(i),
                gap = a === undefined || b === undefined ? '' : tex.slice(a, b),
                lead = /^(?:\s|&|\\\\)*/.exec(gap)![0].length,
                body = gap.slice(lead).replace(/(?:\s|&|\\\\)*$/, '');
            if (!spanOf(n) && !filler(n) && body)
                spans.set(n, { start: a! + lead, end: a! + lead + body.length });
        });
    }
    function mark(m: Built | undefined, s: Span | undefined) {
        if (!m || !s) return;
        if (!m.setAttribute) return m.children?.forEach((c) => mark(c, s));
        m.setAttribute('data-o', String(at + s.start));
        m.setAttribute('data-e', String(at + s.end));
        m.setAttribute('data-x', '');
    }
    // data-g lists the groups an element draws, each as its span then its slots; one element can draw several.
    function group(m: Built | undefined, s: Span | undefined, slots: (Span | undefined)[]) {
        if (!m?.setAttribute || !s) return;
        const g = [s, ...slots.filter((x): x is Span => !!x)].map(
            (x) => `${at + x.start} ${at + x.end}`,
        );
        m.setAttribute('data-g', [m.attributes?.['data-g'], g.join(' ')].filter(Boolean).join(';'));
    }
    // Pairs a list of parse nodes with the MathML KaTeX built for them; adjacent digits share one <mn>, texts one <mtext>.
    function list(body: Parsed[], kids: Built[]) {
        const pairs: [Parsed[], Built][] = [];
        let i = 0;
        for (const kid of kids) {
            if (i >= body.length) return;
            const run = [body[i++]];
            while (
                i < body.length &&
                ((kid.type === 'mn' &&
                    body[i].type === 'textord' &&
                    /^[\d.]$/.test(body[i].text)) ||
                    (kid.type === 'mtext' && body[i].type === 'text'))
            )
                run.push(body[i++]);
            // A number or letter that is not its MathML's text means KaTeX merged nodes another way: leave the list to its group.
            const text = run.map((n) => n.text ?? '').join('');
            if ((kid.type === 'mn' || /^[a-zA-Z0-9]$/.test(text)) && kid.toText?.() !== text)
                return;
            pairs.push([run, kid]);
        }
        if (i < body.length) return;
        for (const [run, kid] of pairs)
            run.length === 1 ? walk(run[0], kid) : mark(kid, union(run.map(spanOf)));
    }
    function walk(n: Parsed, m: Built | undefined) {
        if (!m) return;
        let slots: (Span | undefined)[] | undefined;
        switch (n.type) {
            case 'ordgroup':
                list(n.body, n.body.length > 1 && m.type === 'mrow' ? m.children! : [m]);
                // Braces are a group too, so a selection never keeps one brace without the other.
                if (n.loc?.lexer.input === tex && tex[n.loc.start] === '{')
                    group(m, n.loc, [{ start: n.loc.start + 1, end: n.loc.end - 1 }]);
                if (n.body.length === 1 && spanOf(n.body[0])) return;
                break;
            case 'styling':
            case 'sizing':
            case 'color':
                list(n.body, m.children ?? []);
                break;
            case 'font':
                walk(n.body, m);
                break;
            case 'supsub': {
                const parts = [n.base, n.sub, n.sup].filter((p, i) => !i || p);
                if (m.children?.length === parts.length)
                    parts.forEach((p, i) => p && walk(p, m.children![i]));
                slots = parts.map(spanOf);
                break;
            }
            case 'genfrac': {
                const f = find(m, 'mfrac');
                walk(n.numer, f?.children?.[0]);
                walk(n.denom, f?.children?.[1]);
                slots = [spanOf(n.numer), spanOf(n.denom)];
                break;
            }
            case 'sqrt':
                walk(n.body, m.children?.[0]);
                if (n.index) walk(n.index, m.children?.[1]);
                slots = [spanOf(n.index), spanOf(n.body)];
                break;
            case 'leftright':
                list(n.body, m.children?.slice(1, -1) ?? []);
                slots = [union(n.body.map(spanOf))];
                break;
            case 'array': {
                const rows = find(m, 'mtable')?.children ?? [];
                n.body.forEach((cells: Parsed[], r: number) => {
                    const tds = rows[r]?.children?.filter((c) => !c.classes?.length) ?? [];
                    if (tds.length !== cells.length) return;
                    cells.forEach((c, i) => walk(c, tds[i].children?.[0]));
                    // An environment row is a group of its cells, so a selection across cells takes the whole row.
                    const known = cells.filter((c) => !filler(c)).map(spanOf);
                    if (known.every(Boolean)) {
                        mark(rows[r], union(known));
                        group(rows[r], union(known), known);
                    }
                });
                break;
            }
        }
        mark(m, spanOf(n));
        if (slots) group(m, spanOf(n), slots);
    }
    // The top-most built nodes inside a mark take it, so it draws once over a whole term.
    function paint(m: Built) {
        const o = +(m.attributes?.['data-o'] ?? NaN),
            e = +(m.attributes?.['data-e'] ?? NaN),
            mk = marks.find((k) => k.start <= o && k.end >= e);
        if (!mk || !m.setAttribute) return m.children?.forEach(paint);
        const { className, style, ...stop } = mk.props;
        m.classes?.push(...className.split(' '));
        if (style)
            m.setAttribute(
                'style',
                Object.entries(style)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('; '),
            );
        for (const [k, v] of Object.entries(stop)) m.setAttribute(k.toLowerCase(), String(v));
        mk.props = { className, style };
    }
    if (tree && top && at >= 0) {
        tree.forEach(locate);
        fill(tree, 0, tex.length);
        list(
            tree,
            tree.length === 1 && !(top.type === 'mrow' && top.children?.length === 1)
                ? [top]
                : (top.children ?? []),
        );
        if (marks.length) paint(top);
    }
    return out.toMarkup().match(/<math[^>]*>([\s\S]*)<\/math>/)?.[1];
}

const spanAt = (el: Element) => ({
    start: +el.getAttribute('data-o')!,
    end: +el.getAttribute('data-e')!,
});

// A span that cuts through a fraction, root, script, braces, \left…\right or row grows to the whole group, until none is cut.
// A span covering every symbol of a formula takes the whole formula with its delimiters.
export function widen(root: Element, span: Span): Span {
    let { start, end } = span,
        moved = true;
    const groups = [...root.querySelectorAll('math [data-g]')].flatMap((el) =>
        el
            .getAttribute('data-g')!
            .split(';')
            .map((g) => {
                const [span, ...slots] = g
                    .split(' ')
                    .flatMap((v, i, all) => (i % 2 ? [] : [{ start: +v, end: +all[i + 1] }]));
                return { ...span, slots };
            }),
    );
    while (moved) {
        moved = false;
        for (const g of groups) {
            if (start >= g.end || end <= g.start || (start <= g.start && end >= g.end)) continue;
            if (
                start >= g.start &&
                end <= g.end &&
                g.slots.some((s) => start >= s.start && end <= s.end)
            )
                continue;
            [start, end, moved] = [Math.min(start, g.start), Math.max(end, g.end), true];
        }
    }
    for (const math of root.querySelectorAll('math[data-o]')) {
        const parts = [...math.querySelectorAll('[data-o]')].map(spanAt);
        if (parts.length && parts.every((p) => p.start >= start && p.end <= end))
            [start, end] = [Math.min(start, spanAt(math).start), Math.max(end, spanAt(math).end)];
    }
    return { start, end };
}
