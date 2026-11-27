// Source runs: reply text as pieces that each keep the raw offsets they came from, so a click maps back to the reply.
import { decodeString } from 'micromark-util-decode-string';
import type { MarkdownNode } from './markdownText.ts';

export type Span = { start: number; end: number };
export type Run = Span & { value: string; atomic?: boolean };
export const pos = (n: MarkdownNode) => ({
    start: n.position?.start.offset ?? 0,
    end: n.position?.end.offset ?? 0,
});
// Decode only Markdown's escapes/entities. Each transformed token retains its entire source span.
export function decoded(raw: string, start: number, prose: boolean): Run[] {
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

export function cut(runs: Run[], start: number, end: number): Run[] {
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
export function sourceLines(raw: string, n: MarkdownNode, code = false): Run[][] {
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
