import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { math } from 'micromark-extension-math';
import { mathFromMarkdown } from 'mdast-util-math';
import type { Construct, Code, Effects, State, Extension } from 'micromark-util-types';
import type { CompileContext, Extension as MdastExtension, Token } from 'mdast-util-from-markdown';

export type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  url?: string;
  lang?: string | null;
  alt?: string | null;
  identifier?: string;
  align?: ('left' | 'right' | 'center' | null)[];
};
// LaTeX \(…\) and \[…\] as inline/display math at the tokenizer, so node positions stay exact raw offsets.
// Runs before the core backslash escape; an unclosed opener falls back to it. Inside, \x pairs are skipped.
// shortcut: \[…\] is text-level, so it lives inside a paragraph and cannot span a blank line; move to flow if needed.
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    bracketMathText: 'bracketMathText';
    bracketMathDisplay: 'bracketMathDisplay';
    bracketMathData: 'bracketMathData';
  }
}
const bracketMath = (
  type: 'bracketMathText' | 'bracketMathDisplay',
  open: number,
  close: number,
): Construct => ({
  name: type,
  tokenize(effects: Effects, ok: State, nok: State) {
    // Line endings get their own tokens, as micromark's subtokenizer requires.
    const inside = (code: Code): State | undefined => {
      if (code === null) return nok(code);
      if (code < -2) {
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return inside;
      }
      effects.enter('bracketMathData');
      return data(code);
    };
    const data = (code: Code): State | undefined => {
      if (code === null || code < -2) {
        effects.exit('bracketMathData');
        return inside(code);
      }
      effects.consume(code);
      return code === 92 ? escaped : data;
    };
    const escaped = (code: Code): State | undefined => {
      if (code !== close) return data(code);
      effects.consume(code);
      effects.exit('bracketMathData');
      effects.exit(type);
      return ok;
    };
    return (code) => {
      effects.enter(type);
      effects.consume(code);
      return (next: Code) => (next === open ? (effects.consume(next), inside) : nok(next));
    };
  },
});
const bracketMathSyntax: Extension = {
  text: { 92: [bracketMath('bracketMathText', 40, 41), bracketMath('bracketMathDisplay', 91, 93)] },
};
const enterMath = (type: 'inlineMath' | 'math') =>
  function (this: CompileContext, token: Token) {
    this.enter({ type, value: '' } as never, token);
  };
function exitMath(this: CompileContext, token: Token) {
  (this.stack.at(-1) as { value: string }).value = this.sliceSerialize(token).slice(2, -2);
  this.exit(token);
}
const bracketMathFromMarkdown: MdastExtension = {
  enter: { bracketMathText: enterMath('inlineMath'), bracketMathDisplay: enterMath('math') },
  exit: { bracketMathText: exitMath, bracketMathDisplay: exitMath },
};
export const parse = (text: string) =>
  fromMarkdown(text, {
    extensions: [gfmTable(), math(), bracketMathSyntax],
    mdastExtensions: [gfmTableFromMarkdown(), mathFromMarkdown(), bracketMathFromMarkdown],
  }) as MarkdownNode;

// Derived display text only. Never replace the canonical message or its offsets with this.
export function plainText(raw: string): string {
  const walk = (n: MarkdownNode): string =>
    n.type === 'definition'
      ? ''
      : n.type === 'break'
        ? ' '
        : (n.value ??
          (n.type === 'image' || n.type === 'imageReference'
            ? (n.alt ?? '')
            : (n.children ?? [])
                .map(walk)
                .join(
                  ['root', 'list', 'listItem', 'blockquote', 'table', 'tableRow'].includes(n.type)
                    ? ' '
                    : '',
                )));
  return walk(parse(raw)).replace(/\s+/g, ' ').trim();
}

export function previewText(text: string, role: string) {
  const chars = Array.from(role === 'assistant' ? plainText(text) : text);
  return chars.slice(0, 512).join('') + (chars.length > 512 ? '…' : '');
}
