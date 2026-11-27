// Raw message text is canonical. Text leaves carry raw UTF-16 [data-o, data-e) markers.
import { createElement as h, Fragment, type ReactNode } from 'react';
import { decodeString } from 'micromark-util-decode-string';
import { Code } from '@astryxdesign/core/Code';
import { Text, Heading } from '@astryxdesign/core/Text';
import { isSketch, parse, plainText, type MarkdownNode } from './markdownText.ts';
import CopyButton from './CopyButton.ts';
import Sketch from './Sketch.tsx';
import { codeTokens } from './codeTokens.ts';
import ReplyImage, { imageUrl, type ImageSource } from './ReplyImage.tsx';
import { inkStyle } from '../map/treeList.ts';
import { figure, layout } from './layouts.ts';
import { mathMarkup } from './mathParts.ts';
export { plainText };
export { rawOffsets, rawRange } from './rawOffsets.ts';

type Span = { start: number; end: number };
type Run = Span & { value: string; atomic?: boolean };
const pos = (n: MarkdownNode) => ({
    start: n.position?.start.offset ?? 0,
    end: n.position?.end.offset ?? 0,
});
const hasDirective = (n: MarkdownNode): boolean =>
    n.type === 'containerDirective' || !!n.children?.some(hasDirective);

// Decode only Markdown's escapes/entities. Each transformed token retains its entire source span.
function decoded(raw: string, start: number, prose: boolean): Run[] {
    const out: Run[] = [];
    const pattern =
        /\\[!-/:-@\[-`{-~]|&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z][\da-zA-Z]{1,31});|\r\n?|\n/g;
    let at = 0;
    for (const match of raw.matchAll(pattern)) {
        if (match.index > at)
            out.push({
                start: start + at,
                end: start + match.index,
                value: raw.slice(at, match.index),
            });
        const value = match[0][0] === '\r' ? '\n' : prose ? decodeString(match[0]) : match[0];
        out.push({
            start: start + match.index,
            end: start + match.index + match[0].length,
            value,
            atomic: value !== match[0],
        });
        at = match.index + match[0].length;
    }
    if (at < raw.length)
        out.push({ start: start + at, end: start + raw.length, value: raw.slice(at) });
    return out;
}

function cut(runs: Run[], start: number, end: number): Run[] {
    let at = 0;
    return runs.flatMap((run) => {
        const a = Math.max(0, start - at),
            b = Math.min(run.value.length, end - at);
        at += run.value.length;
        return b > a
            ? [
                  {
                      ...run,
                      value: run.value.slice(a, b),
                      start: run.atomic ? run.start : run.start + a,
                      end: run.atomic ? run.end : run.start + b,
                  },
              ]
            : [];
    });
}

// Match within each physical source line, never in a fence label or an earlier repeated line.
// The content is the suffix after any blockquote/list prefix and removed code indentation.
function sourceLines(raw: string, n: MarkdownNode, code = false): Run[][] {
    const { start, end } = pos(n),
        source = raw.slice(start, end);
    const physical = [...source.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)].filter((m) => m[0].length);
    const fenced = code && /^ {0,3}(`{3,}|~{3,})/.test(physical[0]?.[1] ?? '');
    const lines = (n.value ?? '').replace(/\r\n?/g, '\n').split('\n');
    return lines.map((line, i) => {
        const part = physical[i + (fenced ? 1 : 0)];
        if (!part) return [];
        const offset = start + part.index,
            runs = decoded(part[1], offset, !code);
        const value = runs.map((r) => r.value).join(''),
            at = value.lastIndexOf(line);
        const content =
            at < 0
                ? [{ start: offset, end: offset + part[1].length, value: line, atomic: true }]
                : cut(runs, at, at + line.length);
        if (i < lines.length - 1)
            content.push({
                start: offset + part[1].length,
                end: offset + part[0].length,
                value: '\n',
                atomic: part[2] !== '\n',
            });
        return content;
    });
}

// Underlines are drawn on text leaves and formula symbols; the first piece of each is its single Tab stop.
// shortcut: a passage covering only hidden syntax draws nothing; extend if suggestions target those.
// Slots (inline visuals) go before the first top-level block starting at or after their offset, else at the end.
export function renderMarkdown(
    raw: string,
    reveal?: Span,
    underlines: (Span & { child?: string; address?: string; ink?: number })[] = [],
    slots: { at: number; node: ReactNode; kind?: string; side?: string | null }[] = [],
    sources: Record<string, ImageSource> = {},
    flow = false,
    resources: Record<string, string> = {},
    sketches: 'off' | 'streaming' | 'saved' = 'saved',
): ReactNode {
    let revealed = 0;
    let imageLink: string | undefined;
    let inLink = false;
    const stops = new Set<(typeof underlines)[number]>();
    const hit = (s: number, e: number) => !!reveal && s < reveal.end && e > reveal.start;
    const split = (attrs: object, s: number, e: number, cuts: number[], className?: string) =>
        h(Text, {
            ...attrs,
            type: 'inherit',
            children: [s, ...cuts, e].flatMap((a, i, all) =>
                all[i + 1] > a
                    ? [
                          leaf(
                              { start: a, end: all[i + 1], value: raw.slice(a, all[i + 1]) },
                              className,
                          ),
                      ]
                    : [],
            ),
        });
    // An underline piece's class, ink and, on its first piece, the Tab stop; formula pieces take them as MathML attributes.
    const underline = (u: (typeof underlines)[number]) => {
        const stop = !stops.has(u) && stops.add(u);
        const name = plainText(raw.slice(u.start, u.end)) || raw.slice(u.start, u.end);
        const opens = u.address ? `. Opens its chat, ${u.address}` : '. Opens its chat';
        return {
            className: u.child ? 'suggestion explored' : 'suggestion',
            style: u.child && u.ink !== undefined ? inkStyle(u.ink) : undefined,
            // Which underline a piece belongs to; overlapping explored passages nest one element per passage.
            'data-u': String(underlines.indexOf(u)),
            ...(stop && {
                tabIndex: 0,
                role: 'button',
                'aria-label': u.child
                    ? `Explored passage: ${name}${opens}`
                    : `Suggested passage: ${name}`,
            }),
        };
    };
    // The address chip ends the passage; zero-width atomic offsets keep it out of selection and highlight maths.
    const chip = (u: (typeof underlines)[number], style?: object) =>
        h('sup', {
            className: 'passage-address',
            'aria-hidden': true,
            'data-o': String(u.end),
            'data-e': String(u.end),
            'data-x': '',
            style,
            children: u.address,
        });
    const leaf = (run: Run, className?: string): ReactNode => {
        const { start: s, end: e, value, atomic } = run;
        const attrs = {
            key: s,
            'data-o': String(s),
            'data-e': String(e),
            ...(atomic && { 'data-x': '' }),
            className,
        };
        const marked = hit(s, e) && (atomic || (reveal!.start <= s && reveal!.end >= e));
        if (hit(s, e) && !marked)
            return split(
                attrs,
                s,
                e,
                [Math.max(s, reveal!.start), Math.min(e, reveal!.end)],
                className,
            );
        // Wider passages first: they wrap the narrower ones, whose line paints over the wider one's.
        const covering = underlines
                .filter((u) => s < u.end && e > u.start)
                .sort((a, b) => b.end - b.start - (a.end - a.start)),
            cuts = [...new Set(covering.flatMap((u) => [u.start, u.end]))]
                .filter((a) => a > s && a < e)
                .sort((a, b) => a - b);
        if (cuts.length && !atomic) return split(attrs, s, e, cuts, className);
        // A revealed piece keeps its underlines and chips; the mark sits inside them.
        if (marked) revealed++;
        const mark = (props: object) =>
            h('mark', { ...props, tabIndex: -1, 'aria-label': 'Source passage' }, value);
        if (covering.length) {
            const lanes = covering.length,
                piece = covering.reduceRight<ReactNode>(
                    (inner, u, lane) => {
                        const { className: under, style, ...props } = underline(u);
                        return h(
                            'u',
                            {
                                ...(lane === lanes - 1 ? attrs : { key: s }),
                                ...props,
                                className: [under, lane === lanes - 1 && className]
                                    .filter(Boolean)
                                    .join(' '),
                                style,
                            },
                            inner,
                        );
                    },
                    marked ? mark({ key: s }) : value,
                ),
                chips = covering
                    .filter((u) => u.child && u.address && e >= u.end)
                    .reverse()
                    .map((u) => chip(u, underline(u).style));
            return chips.length ? h(Fragment, { key: s }, piece, ...chips) : piece;
        }
        if (marked) return mark(attrs);
        return h(Text, { ...attrs, type: 'inherit', children: value });
    };
    const tree = parse(raw),
        definitions = new Map<string, MarkdownNode>();
    function findDefinitions(n: MarkdownNode) {
        if (n.type === 'definition') definitions.set(n.identifier!, n);
        n.children?.forEach(findDefinitions);
    }
    findDefinitions(tree);
    // Shared so media layouts can claim visuals before the root places the rest.
    const pending = [...slots].sort((a, b) => a.at - b.at);
    function node(n: MarkdownNode, inTable = false): ReactNode {
        const before = revealed,
            result = renderNode(n, inTable),
            { start, end } = pos(n);
        // Old anchors can contain only now-hidden syntax (a fence, delimiter or link destination).
        // Show that exact source beside its owner rather than silently highlighting different text.
        return hit(start, end) && revealed === before
            ? h(
                  Fragment,
                  { key: `${n.type}-${start}` },
                  result,
                  leaf(
                      {
                          start: Math.max(start, reveal!.start),
                          end: Math.min(end, reveal!.end),
                          value: raw.slice(
                              Math.max(start, reveal!.start),
                              Math.min(end, reveal!.end),
                          ),
                      },
                      'md-source-syntax',
                  ),
              )
            : result;
    }
    function renderNode(n: MarkdownNode, inTable: boolean): ReactNode {
        const { start: s, end: e } = pos(n),
            kids = () => (n.children ?? []).map((c) => node(c, inTable));
        const attrs = { key: `${n.type}-${s}` };
        switch (n.type) {
            case 'root': {
                const take = (until: number) =>
                        pending.splice(0, pending.filter((slot) => slot.at <= until).length),
                    children = n.children ?? [],
                    out: ReactNode[] = [];
                // A sided visual sits beside the section after it: up to the next heading, directive, rule or visual.
                const ends = (c: MarkdownNode) =>
                    ['heading', 'containerDirective', 'thematicBreak'].includes(c.type) ||
                    pending[0]?.at <= pos(c).start;
                for (let i = 0; i < children.length; i++) {
                    const c = children[i],
                        taken = take(pos(c).start),
                        sided = taken.filter(
                            (slot) => slot.side === 'left' || slot.side === 'right',
                        );
                    out.push(
                        ...taken.filter((slot) => !sided.includes(slot)).map((slot) => slot.node),
                    );
                    if (!sided.length || flow || c.type === 'containerDirective') {
                        out.push(...sided.map((slot) => slot.node), node(c));
                        continue;
                    }
                    const section = [c];
                    while (i + 1 < children.length && !ends(children[i + 1]))
                        section.push(children[++i]);
                    out.push(
                        figure(
                            `side-${pos(c).start}`,
                            sided[0].side === 'right',
                            false,
                            sided.map((slot, j) =>
                                h('div', { key: j, className: 'layout-item' }, slot.node),
                            ),
                            section.map((s) => node(s)),
                        ),
                    );
                }
                return [...out, ...take(Infinity).map((slot) => slot.node)];
            }
            case 'text':
                return sourceLines(raw, n)
                    .flat()
                    .map((r) => leaf(r));
            case 'html':
                return decoded(raw.slice(s, e), s, false).map((r) => leaf(r));
            case 'paragraph':
                return h(Text, { ...attrs, as: 'p', display: 'block', children: kids() });
            case 'heading':
                return h(Heading, {
                    ...attrs,
                    level: Math.min(6, n.depth! + 2) as 3 | 4 | 5 | 6,
                    children: kids(),
                });
            case 'emphasis':
                return h('em', attrs, kids());
            case 'strong':
                return h('strong', attrs, kids());
            case 'blockquote':
                return h('blockquote', attrs, kids());
            case 'list':
                return h(
                    n.ordered ? 'ol' : 'ul',
                    { ...attrs, start: n.ordered && n.start !== 1 ? n.start : undefined },
                    kids(),
                );
            case 'listItem':
                return h('li', attrs, kids());
            case 'table': {
                const [head, ...rows] = n.children!;
                const cells = (row: MarkdownNode, tag: string) =>
                    row.children!.map((c, i) =>
                        h(
                            tag,
                            { key: i, style: { textAlign: n.align?.[i] ?? undefined } },
                            (c.children ?? []).map((child) => node(child, true)),
                        ),
                    );
                return h(
                    'figure',
                    { ...attrs, className: 'md-table' },
                    h(
                        'table',
                        null,
                        h('thead', null, h('tr', null, cells(head, 'th'))),
                        h(
                            'tbody',
                            null,
                            rows.map((row) => h('tr', { key: pos(row).start }, cells(row, 'td'))),
                        ),
                    ),
                );
            }
            case 'thematicBreak':
                return h('hr', attrs);
            case 'break':
                return h('br', attrs);
            case 'inlineCode': {
                const ticks = raw.slice(s, e).match(/^`+/)![0].length;
                const runs = decoded(raw.slice(s + ticks, e - ticks), s + ticks, false).map(
                    (r) => ({
                        ...r,
                        value: inTable && r.value === '\\|' ? '|' : r.value.replace(/\n/g, ' '),
                        atomic:
                            r.atomic || r.value.includes('\n') || (inTable && r.value === '\\|'),
                    }),
                );
                // GFM tables unescape pipes even inside inline code; other code escapes remain literal.
                const value = n.value!.replace(/\r\n?|\n/g, ' '),
                    at = runs
                        .map((r) => r.value)
                        .join('')
                        .indexOf(value);
                return h(Code, {
                    ...attrs,
                    children:
                        at < 0
                            ? leaf({ start: s, end: e, value, atomic: true })
                            : cut(runs, at, at + value.length).map((r) => leaf(r)),
                });
            }
            case 'code': {
                if (sketches !== 'off' && isSketch(n)) {
                    if (hit(s, e)) revealed++;
                    return h(Sketch, {
                        ...attrs,
                        kind: n.meta ?? '',
                        body: n.value ?? '',
                        start: s,
                        end: e,
                        live: sketches === 'streaming',
                        fence: n.sketchClosed
                            ? 'closed'
                            : sketches === 'streaming'
                              ? 'open'
                              : 'unfinished',
                    });
                }
                const lines = sourceLines(raw, n, true),
                    tokens = codeTokens(n.value!.replace(/\r\n?/g, '\n'), n.lang || 'plaintext');
                return h(
                    'pre',
                    { ...attrs, 'data-language': n.lang || 'plaintext' },
                    h(CopyButton, { text: n.value!, label: 'Copy code', className: 'code-copy' }),
                    h(Code, {
                        children: lines.flatMap((runs, i) => {
                            let at = 0;
                            const length = runs.map((r) => r.value).join('').length;
                            return [
                                ...(tokens[i] ?? []),
                                { start: length, end: length, type: '' },
                            ].flatMap((t) => {
                                const out = [
                                    ...cut(runs, at, t.start).map((r) => leaf(r)),
                                    ...cut(runs, t.start, t.end).map((r) =>
                                        leaf(r, `astryx-token-${t.type}`),
                                    ),
                                ];
                                at = t.end;
                                return out;
                            });
                        }),
                    }),
                );
            }
            case 'math':
            case 'inlineMath': {
                // Symbols get offsets only when the LaTeX sits verbatim in the source (not under a quote or list prefix).
                // A revealed formula keeps its underlines, like revealed text; a whole-formula underline is on <math>.
                // shortcut: overlapping explored passages in one formula draw only the first; nest them like text if learners branch inside formulas.
                const at = raw.indexOf(n.value!, s),
                    marked = underlines.filter((u) => u.start < e && u.end > s),
                    whole = marked.find((u) => u.start <= s && u.end >= e),
                    ends = marked.find((u) => u.child && u.address && u.end <= e);
                const mathml = mathMarkup(
                    n.value!,
                    at < e ? at : -1,
                    n.type === 'math',
                    whole ? [] : marked.map((u) => ({ ...u, props: underline(u) })),
                );
                if (!mathml) return leaf({ start: s, end: e, value: n.value!, atomic: true });
                if (hit(s, e)) revealed++;
                const formula = h('math', {
                    ...attrs,
                    'data-o': s,
                    'data-e': e,
                    'data-x': '',
                    display: n.type === 'math' ? 'block' : 'inline',
                    ...(whole && underline(whole)),
                    ...(hit(s, e) && {
                        'data-reveal': '',
                        tabIndex: -1,
                        'aria-label': 'Source passage',
                    }),
                    dangerouslySetInnerHTML: { __html: mathml },
                });
                return ends
                    ? h(Fragment, attrs, formula, chip(ends, underline(ends).style))
                    : formula;
            }
            case 'link':
            case 'linkReference': {
                const url = n.url ?? definitions.get(n.identifier!)?.url ?? '';
                const cited = /^resource:(\d+)$/.exec(url)?.[1];
                if (cited)
                    return h(
                        'a',
                        {
                            ...attrs,
                            ...(imageUrl(resources[cited] ?? '') && {
                                href: imageUrl(resources[cited]),
                                target: '_blank',
                                rel: 'noopener noreferrer',
                            }),
                            className: 'citation-chip',
                            'aria-label': `Resource ${cited}`,
                        },
                        kids(),
                    );
                const previous = imageLink;
                const wasLinked = inLink;
                imageLink = imageUrl(url);
                inLink = /^(https?:\/\/|mailto:)/i.test(url);
                const children = kids();
                imageLink = previous;
                inLink = wasLinked;
                return /^(https?:\/\/|mailto:)/i.test(url)
                    ? h(
                          'a',
                          { ...attrs, href: url, target: '_blank', rel: 'noopener noreferrer' },
                          children,
                      )
                    : h(Text, { ...attrs, type: 'inherit', children });
            }
            case 'image':
            case 'imageReference': {
                const src = imageUrl(n.url ?? definitions.get(n.identifier!)?.url ?? '');
                const label = n.alt || src;
                // Only find_images addresses load by themselves: any other address could carry private text out.
                return src
                    ? h(
                          'span',
                          { ...attrs, 'data-o': s, 'data-e': e, 'data-x': '' },
                          !sources[src]
                              ? inLink
                                  ? label
                                  : h(
                                        'a',
                                        { href: src, target: '_blank', rel: 'noopener noreferrer' },
                                        label,
                                    )
                              : h(ReplyImage, {
                                    key: src,
                                    src,
                                    alt: n.alt ?? '',
                                    source: imageLink ?? sources[src]?.source ?? src,
                                    resource: sources[src]?.resource,
                                    linked: inLink,
                                }),
                      )
                    : leaf({ start: s, end: e, value: n.alt || raw.slice(s, e), atomic: true });
            }
            case 'containerDirective': {
                // A nested directive tree stays entirely in plain flow.
                const previous = flow;
                flow ||= !!n.children?.some(hasDirective);
                const content = layout(n, (c) => node(c, inTable), pending, flow) ?? kids();
                flow = previous;
                return content;
            }
            case 'definition':
                return null;
            default:
                return n.children ? kids() : null;
        }
    }
    return node(tree);
}
