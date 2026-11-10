// Raw message text is canonical. Text leaves carry raw UTF-16 [data-o, data-e) markers.
import { createElement as h, Fragment, type ReactNode } from 'react';
import { decodeString } from 'micromark-util-decode-string';
import katex from 'katex';
import { tokenize } from '@astryxdesign/core/CodeBlock';
import { Code } from '@astryxdesign/core/Code';
import { Text, Heading } from '@astryxdesign/core/Text';
import { parse, plainText, type MarkdownNode } from './markdownText.ts';
export { plainText };

type Span = { start: number; end: number };
type Run = Span & { value: string; atomic?: boolean };
const pos = (n: MarkdownNode) => ({ start: n.position?.start.offset ?? 0, end: n.position?.end.offset ?? 0 });

// Decode only Markdown's escapes/entities. Each transformed token retains its entire source span.
function decoded(raw: string, start: number, prose: boolean): Run[] {
  const out: Run[] = [];
  const pattern = /\\[!-/:-@\[-`{-~]|&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z][\da-zA-Z]{1,31});|\r\n?|\n/g;
  let at = 0;
  for (const match of raw.matchAll(pattern)) {
    if (match.index > at) out.push({ start: start + at, end: start + match.index, value: raw.slice(at, match.index) });
    const value = match[0][0] === '\r' ? '\n' : prose ? decodeString(match[0]) : match[0];
    out.push({ start: start + match.index, end: start + match.index + match[0].length, value, atomic: value !== match[0] });
    at = match.index + match[0].length;
  }
  if (at < raw.length) out.push({ start: start + at, end: start + raw.length, value: raw.slice(at) });
  return out;
}

function cut(runs: Run[], start: number, end: number): Run[] {
  let at = 0;
  return runs.flatMap(run => {
    const a = Math.max(0, start - at), b = Math.min(run.value.length, end - at);
    at += run.value.length;
    return b > a ? [{ ...run, value: run.value.slice(a, b), start: run.atomic ? run.start : run.start + a, end: run.atomic ? run.end : run.start + b }] : [];
  });
}

// Match within each physical source line, never in a fence label or an earlier repeated line.
// The content is the suffix after any blockquote/list prefix and removed code indentation.
function sourceLines(raw: string, n: MarkdownNode, code = false): Run[][] {
  const { start, end } = pos(n), source = raw.slice(start, end);
  const physical = [...source.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)].filter(m => m[0].length);
  const fenced = code && /^ {0,3}(`{3,}|~{3,})/.test(physical[0]?.[1] ?? '');
  const lines = (n.value ?? '').replace(/\r\n?/g, '\n').split('\n');
  return lines.map((line, i) => {
    const part = physical[i + (fenced ? 1 : 0)];
    if (!part) return [];
    const offset = start + part.index, runs = decoded(part[1], offset, !code);
    const value = runs.map(r => r.value).join(''), at = value.lastIndexOf(line);
    const content = at < 0 ? [{ start: offset, end: offset + part[1].length, value: line, atomic: true }] : cut(runs, at, at + line.length);
    if (i < lines.length - 1) content.push({ start: offset + part[1].length, end: offset + part[0].length, value: '\n', atomic: part[2] !== '\n' });
    return content;
  });
}

// Underlines are drawn on text leaves; the first piece of each is its single Tab stop.
// shortcut: a passage covering only hidden syntax or math draws nothing; extend if suggestions target those.
export function renderMarkdown(raw: string, reveal?: Span, underlines: (Span & { child?: string })[] = []): ReactNode {
  let revealed = 0;
  const stops = new Set<number>();
  const hit = (s: number, e: number) => !!reveal && s < reveal.end && e > reveal.start;
  const split = (attrs: object, s: number, e: number, cuts: number[], className?: string) => h(Text, { ...attrs, type: 'inherit', children: [s, ...cuts, e].flatMap((a, i, all) => all[i + 1] > a ? [leaf({ start: a, end: all[i + 1], value: raw.slice(a, all[i + 1]) }, className)] : []) });
  const leaf = (run: Run, className?: string): ReactNode => {
    const { start: s, end: e, value, atomic } = run;
    const attrs = { key: s, 'data-o': String(s), 'data-e': String(e), ...(atomic && { 'data-x': '' }), className };
    if (hit(s, e) && (atomic || reveal!.start <= s && reveal!.end >= e)) { revealed++; return h('mark', { ...attrs, tabIndex: -1, 'aria-label': 'Source passage' }, value); }
    if (hit(s, e)) return split(attrs, s, e, [Math.max(s, reveal!.start), Math.min(e, reveal!.end)], className);
    const u = underlines.find(u => s < u.end && e > u.start);
    if (u && !atomic && (u.start > s || u.end < e)) return split(attrs, s, e, [Math.max(s, u.start), Math.min(e, u.end)], className);
    if (u) {
      const stop = !stops.has(u.start) && stops.add(u.start);
      const name = plainText(raw.slice(u.start, u.end)) || raw.slice(u.start, u.end);
      return h('u', { ...attrs, className: [u.child ? 'suggestion explored' : 'suggestion', className].filter(Boolean).join(' '), ...(stop && { tabIndex: 0, role: 'button', 'aria-label': u.child ? `Explored passage: ${name}. Opens its chat` : `Suggested passage: ${name}` }) }, value);
    }
    return h(Text, { ...attrs, type: 'inherit', children: value });
  };
  const tree = parse(raw), definitions = new Map<string, MarkdownNode>();
  function findDefinitions(n: MarkdownNode) { if (n.type === 'definition') definitions.set(n.identifier!, n); n.children?.forEach(findDefinitions); }
  findDefinitions(tree);
  function node(n: MarkdownNode, inTable = false): ReactNode {
    const before = revealed, result = renderNode(n, inTable), { start, end } = pos(n);
    // Old anchors can contain only now-hidden syntax (a fence, delimiter or link destination).
    // Show that exact source beside its owner rather than silently highlighting different text.
    return hit(start, end) && revealed === before ? h(Fragment, { key: `${n.type}-${start}` }, result, leaf({ start: Math.max(start, reveal!.start), end: Math.min(end, reveal!.end), value: raw.slice(Math.max(start, reveal!.start), Math.min(end, reveal!.end)) }, 'md-source-syntax')) : result;
  }
  function renderNode(n: MarkdownNode, inTable: boolean): ReactNode {
    const { start: s, end: e } = pos(n), kids = () => (n.children ?? []).map(c => node(c, inTable));
    const attrs = { key: `${n.type}-${s}` };
    switch (n.type) {
      case 'root': return kids();
      case 'text': return sourceLines(raw, n).flat().map(r => leaf(r));
      case 'html': return decoded(raw.slice(s, e), s, false).map(r => leaf(r));
      case 'paragraph': return h(Text, { ...attrs, as: 'p', display: 'block', children: kids() });
      case 'heading': return h(Heading, { ...attrs, level: Math.min(6, n.depth! + 2) as 3 | 4 | 5 | 6, children: kids() });
      case 'emphasis': return h('em', attrs, kids());
      case 'strong': return h('strong', attrs, kids());
      case 'blockquote': return h('blockquote', attrs, kids());
      case 'list': return h(n.ordered ? 'ol' : 'ul', { ...attrs, start: n.ordered && n.start !== 1 ? n.start : undefined }, kids());
      case 'listItem': return h('li', attrs, kids());
      case 'table': {
        const [head, ...rows] = n.children!;
        const cells = (row: MarkdownNode, tag: string) => row.children!.map((c, i) => h(tag, { key: i, style: { textAlign: n.align?.[i] ?? undefined } }, (c.children ?? []).map(child => node(child, true))));
        return h('figure', { ...attrs, className: 'md-table' }, h('table', null, h('thead', null, h('tr', null, cells(head, 'th'))), h('tbody', null, rows.map(row => h('tr', { key: pos(row).start }, cells(row, 'td'))))));
      }
      case 'thematicBreak': return h('hr', attrs);
      case 'break': return h('br', attrs);
      case 'inlineCode': {
        const ticks = raw.slice(s, e).match(/^`+/)![0].length;
        const runs = decoded(raw.slice(s + ticks, e - ticks), s + ticks, false).map(r => ({ ...r, value: inTable && r.value === '\\|' ? '|' : r.value.replace(/\n/g, ' '), atomic: r.atomic || r.value.includes('\n') || inTable && r.value === '\\|' }));
        // GFM tables unescape pipes even inside inline code; other code escapes remain literal.
        const value = n.value!.replace(/\r\n?|\n/g, ' '), at = runs.map(r => r.value).join('').indexOf(value);
        return h(Code, { ...attrs, children: at < 0 ? leaf({ start: s, end: e, value, atomic: true }) : cut(runs, at, at + value.length).map(r => leaf(r)) });
      }
      case 'code': {
        const lines = sourceLines(raw, n, true), tokens = tokenize(n.value!.replace(/\r\n?/g, '\n'), n.lang || 'plaintext');
        return h('pre', { ...attrs, 'data-language': n.lang || 'plaintext' }, h(Code, { children: lines.flatMap((runs, i) => {
          let at = 0;
          const length = runs.map(r => r.value).join('').length;
          return [...(tokens[i] ?? []), { start: length, end: length, type: '' }].flatMap(t => {
            const out = [...cut(runs, at, t.start).map(r => leaf(r)), ...cut(runs, t.start, t.end).map(r => leaf(r, `astryx-token-${t.type}`))];
            at = t.end; return out;
          });
        }) }));
      }
      case 'math': case 'inlineMath': {
        const mathml = katex.renderToString(n.value!, { output: 'mathml', throwOnError: false, trust: false, displayMode: n.type === 'math', errorColor: 'currentColor' }).match(/<math[^>]*>([\s\S]*)<\/math>/)?.[1];
        if (mathml && hit(s, e)) revealed++;
        return mathml ? h('math', { ...attrs, 'data-o': s, 'data-e': e, 'data-x': '', display: n.type === 'math' ? 'block' : 'inline', ...(hit(s, e) && { 'data-reveal': '', tabIndex: -1, 'aria-label': 'Source passage' }), dangerouslySetInnerHTML: { __html: mathml } }) : leaf({ start: s, end: e, value: n.value!, atomic: true });
      }
      case 'link': case 'linkReference': {
        const url = n.url ?? definitions.get(n.identifier!)?.url ?? '';
        return /^(https?:\/\/|mailto:)/i.test(url) ? h('a', { ...attrs, href: url, target: '_blank', rel: 'noopener noreferrer' }, kids()) : h(Text, { ...attrs, type: 'inherit', children: kids() });
      }
      case 'image': case 'imageReference': return leaf({ start: s, end: e, value: n.alt || raw.slice(s, e), atomic: true });
      case 'definition': return null;
      default: return n.children ? kids() : null;
    }
  }
  return node(tree);
}

// Text-node intersections avoid accidentally including adjacent markers at a selection boundary.
export function rawOffsets(root: Element, range: Range): Span | undefined {
  if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
  let start = Infinity, end = -Infinity;
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  let text: globalThis.Node | null;
  while ((text = walker.nextNode())) {
    if (!range.intersectsNode(text)) continue;
    const marker = text.parentElement?.closest<HTMLElement>('[data-o]');
    if (!marker) continue;
    const a = text === range.startContainer ? range.startOffset : 0, b = text === range.endContainer ? range.endOffset : text.textContent!.length;
    if (b <= a) continue;
    const o = +marker.getAttribute('data-o')!, e = +marker.getAttribute('data-e')!;
    start = Math.min(start, marker.hasAttribute('data-x') ? o : o + a);
    end = Math.max(end, marker.hasAttribute('data-x') ? e : o + b);
  }
  return end > start ? { start, end } : undefined;
}
