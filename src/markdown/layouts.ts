// Reply layouts from `:::name` container directives. Undefined means plain flow.
import { createElement as h, type ReactNode } from 'react';
import { Section } from '@astryxdesign/core/Section';
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

// `pending` is the renderer's sorted slot queue; media layouts remove the visuals they place.
export function layout(
  n: MarkdownNode,
  node: (c: MarkdownNode) => ReactNode,
  pending: { at: number; node: ReactNode; kind?: string }[],
  flow: boolean,
): ReactNode | undefined {
  const { start: s, end: e } = pos(n);
  if (flow) return;
  // Sections start at headings of the first heading's depth; a bad shape or narrow width stays plain flow.
  const children = n.children ?? [],
    first = children.findIndex((c) => c.type === 'heading'),
    depth = children[first]?.depth,
    sections: MarkdownNode[][] = [];
  for (const c of first < 0 ? [] : children.slice(first))
    if (c.type === 'heading' && c.depth === depth) sections.push([c]);
    else sections.at(-1)!.push(c);
  if (n.name === 'callout' && children.some((c) => c.type !== 'definition'))
    return h(
      Section,
      {
        key: `${n.type}-${s}`,
        className: 'reply-layout layout-callout',
        role: 'region',
        'aria-label': 'Callout',
        variant: 'muted',
        padding: 4,
      },
      children.map(node),
    );
  if (n.name === 'figure' || n.name === 'gallery' || n.name === 'wide') {
    // Media are image-only paragraphs and the visuals placed inside the directive.
    const media = children.map(images),
      inside = pending.filter((slot) => slot.at > s && slot.at < e),
      count = media.flat().filter(Boolean).length + inside.length,
      text = children.filter((_, i) => !media[i]);
    const valid =
      n.name === 'wide'
        ? count === 1 &&
          text.every((c) => c.type === 'definition') &&
          inside.every((slot) => slot.kind === 'visual')
        : n.name === 'figure'
          ? count >= 1 && text.length >= 1
          : count >= 2;
    if (valid) {
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
      const right = n.name === 'figure' && n.attributes?.side === 'right',
        explanation = n.name === 'figure' && h('div', { className: 'layout-text' }, text.map(node));
      return h(
        'div',
        {
          key: `${n.type}-${s}`,
          className: `reply-layout layout-${n.name}`,
          'data-side': right ? 'right' : undefined,
          'data-ratio': n.name === 'figure' && n.attributes?.ratio === 'wide' ? 'wide' : undefined,
        },
        n.name === 'gallery' && text.map(node),
        right && explanation,
        h('div', { className: 'layout-media' }, items),
        !right && explanation,
      );
    }
  }
  const name =
    ((n.name === 'comparison' && sections.length >= 2 && sections.length <= 3) ||
      (n.name === 'steps' && sections.length >= 2) ||
      (n.name === 'timeline' &&
        sections.length >= 2 &&
        children.filter((c) => c.type === 'heading').length === sections.length)) &&
    n.name;
  if (!name) return;
  const ordered = name === 'steps' || name === 'timeline',
    intro = children.slice(0, first).map(node),
    cards = sections.map((section) =>
      h(
        ordered ? 'li' : 'section',
        {
          key: pos(section[0]).start,
          className: name === 'timeline' ? 'timeline-entry' : 'layout-card',
        },
        section.map(node),
      ),
    );
  return h(
    'div',
    { key: `${n.type}-${s}`, className: `reply-layout layout-${name}` },
    intro,
    h(
      ordered ? 'ol' : 'div',
      { className: name === 'timeline' ? 'timeline-entries' : 'layout-cards' },
      cards,
    ),
  );
}
