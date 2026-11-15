// Reply layouts from `:::name` container directives. Undefined means plain flow.
import { createElement as h, type ReactNode } from 'react';
import type { MarkdownNode } from './markdownText.ts';
import './layouts.css';

const pos = (n: MarkdownNode) => ({
  start: n.position?.start.offset ?? 0,
  end: n.position?.end.offset ?? 0,
});
const isImage = (n: MarkdownNode): boolean =>
  n.type === 'image' ||
  n.type === 'imageReference' ||
  ((n.type === 'link' || n.type === 'linkReference') &&
    n.children?.length === 1 &&
    isImage(n.children[0]));
// A paragraph holding only images (and the whitespace between them) yields those images.
const images = (n: MarkdownNode) =>
  n.type === 'paragraph' &&
  n.children!.some(isImage) &&
  n.children!.every((c) => isImage(c) || (c.type === 'text' && !c.value!.trim()))
    ? n.children!.filter(isImage)
    : undefined;

// `pending` is the renderer's sorted slot queue; a figure or gallery removes the visuals it places.
export function layout(
  n: MarkdownNode,
  node: (c: MarkdownNode) => ReactNode,
  pending: { at: number; node: ReactNode }[],
  flow: boolean,
): ReactNode | undefined {
  const { start: s, end: e } = pos(n);
  // Sections start at headings of the first heading's depth; a bad shape or narrow width stays plain flow.
  const children = n.children ?? [],
    first = children.findIndex((c) => c.type === 'heading'),
    depth = children[first]?.depth,
    sections: MarkdownNode[][] = [];
  for (const c of first < 0 ? [] : children.slice(first))
    if (c.type === 'heading' && c.depth === depth) sections.push([c]);
    else sections.at(-1)!.push(c);
  if (!flow && (n.name === 'figure' || n.name === 'gallery')) {
    // Media are image-only paragraphs and the visuals placed inside the directive.
    const media = children.map(images),
      inside = pending.filter((slot) => slot.at > s && slot.at < e),
      count = media.flat().filter(Boolean).length + inside.length,
      text = children.filter((_, i) => !media[i]);
    if (n.name === 'figure' ? count >= 1 && text.length >= 1 : count >= 2) {
      pending.splice(pending.indexOf(inside[0]), inside.length);
      const items = [
        ...children.flatMap((c, i) =>
          (media[i] ?? []).map((m) =>
            h('div', { key: pos(m).start, className: 'layout-item' }, node(m)),
          ),
        ),
        ...inside.map((slot, i) =>
          h('div', { key: `slot-${i}`, className: 'layout-item' }, slot.node),
        ),
      ];
      return h(
        'div',
        { key: `${n.type}-${s}`, className: `reply-layout layout-${n.name}` },
        n.name === 'gallery' && text.map(node),
        h('div', { className: 'layout-media' }, items),
        n.name === 'figure' && h('div', { className: 'layout-text' }, text.map(node)),
      );
    }
  }
  const name =
    !flow &&
    ((n.name === 'comparison' && sections.length >= 2 && sections.length <= 3) ||
      (n.name === 'steps' && sections.length >= 2)) &&
    n.name;
  if (!name) return;
  const intro = children.slice(0, first).map(node),
    cards = sections.map((section) =>
      h(
        name === 'steps' ? 'li' : 'section',
        { key: pos(section[0]).start, className: 'layout-card' },
        section.map(node),
      ),
    );
  return h(
    'div',
    { key: `${n.type}-${s}`, className: `reply-layout layout-${name}` },
    intro,
    h(name === 'steps' ? 'ol' : 'div', { className: 'layout-cards' }, cards),
  );
}
