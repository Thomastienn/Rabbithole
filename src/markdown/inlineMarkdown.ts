import { createElement as h, Fragment, type ReactNode } from 'react';
import { Code } from '@astryxdesign/core/Code';
import { parse, type MarkdownNode } from './markdownText.ts';
import { mathMarkup } from './mathParts.ts';

const blocks = [
    'root',
    'list',
    'listItem',
    'blockquote',
    'table',
    'tableRow',
    'containerDirective',
];

// Brief explanations: only bold, italics, code and math render; blocks run on as one paragraph and links stay text.
export function renderInline(raw: string): ReactNode {
    const node = (n: MarkdownNode, key: number): ReactNode => {
        const kids = (n.children ?? []).map(node);
        switch (n.type) {
            case 'text':
            case 'html':
                return n.value;
            case 'emphasis':
                return h('em', { key }, kids);
            case 'strong':
                return h('strong', { key }, kids);
            case 'inlineCode':
            case 'code':
                return h(Code, { key, children: n.value });
            case 'inlineMath':
            case 'math': {
                const mathml = mathMarkup(n.value!, -1, false);
                return mathml
                    ? h('math', {
                          key,
                          display: 'inline',
                          dangerouslySetInnerHTML: { __html: mathml },
                      })
                    : n.value;
            }
            case 'break':
                return ' ';
            case 'image':
            case 'imageReference':
                return n.alt;
            case 'definition':
                return null;
            default:
                return blocks.includes(n.type)
                    ? kids.flatMap((k, i) => (i ? [' ', k] : [k]))
                    : kids;
        }
    };
    return h(Fragment, null, node(parse(raw), 0));
}
