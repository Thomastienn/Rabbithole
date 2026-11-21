// Maps DOM selections to raw message offsets and back, via the renderer's [data-o, data-e) markers.
import { widen } from './mathParts.ts';

type Span = { start: number; end: number };

// KaTeX's hidden TeX annotation and its spaces (\, \quad) are no symbols, so they never extend a selection or highlight.
const markerOf = (text: globalThis.Node) =>
    text.parentElement?.closest('annotation') ||
    (!text.textContent!.trim() && text.parentElement?.closest('math'))
        ? null
        : text.parentElement?.closest<HTMLElement>('[data-o]');

// Text-node intersections avoid accidentally including adjacent markers at a selection boundary.
export function rawOffsets(root: Element, range: Range): Span | undefined {
    if (
        range.collapsed ||
        !root.contains(range.startContainer) ||
        !root.contains(range.endContainer)
    )
        return;
    let start = Infinity,
        end = -Infinity;
    const walker = root.ownerDocument.createTreeWalker(root, 4);
    let text: globalThis.Node | null;
    while ((text = walker.nextNode())) {
        if (!range.intersectsNode(text)) continue;
        const marker = markerOf(text);
        if (!marker) continue;
        const a = text === range.startContainer ? range.startOffset : 0,
            b = text === range.endContainer ? range.endOffset : text.textContent!.length;
        if (b <= a) continue;
        const o = +marker.getAttribute('data-o')!,
            e = +marker.getAttribute('data-e')!;
        start = Math.min(start, marker.hasAttribute('data-x') ? o : o + a);
        end = Math.max(end, marker.hasAttribute('data-x') ? e : o + b);
    }
    return end > start ? widen(root, { start, end }) : undefined;
}

// Inverse of rawOffsets: the DOM range covering raw [start, end); atomic leaves are covered whole.
export function rawRange(root: Element, start: number, end: number): Range | undefined {
    const range = root.ownerDocument.createRange(),
        walker = root.ownerDocument.createTreeWalker(root, 4);
    let text: globalThis.Text | null,
        found = false;
    while ((text = walker.nextNode() as globalThis.Text | null)) {
        const marker = markerOf(text);
        if (!marker) continue;
        const o = +marker.getAttribute('data-o')!,
            e = +marker.getAttribute('data-e')!,
            atomic = marker.hasAttribute('data-x'),
            n = text.length;
        if (e <= start || o >= end) continue;
        if (!found) {
            range.setStart(text, atomic ? 0 : Math.min(n, Math.max(0, start - o)));
            found = true;
        }
        range.setEnd(text, atomic ? n : Math.min(n, end - o));
    }
    return found ? range : undefined;
}
