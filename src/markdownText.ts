import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { math } from 'micromark-extension-math';
import { mathFromMarkdown } from 'mdast-util-math';

export type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[]; position?: { start: { offset?: number }; end: { offset?: number } }; depth?: number; ordered?: boolean; start?: number | null; url?: string; lang?: string | null; alt?: string | null; identifier?: string; align?: ('left' | 'right' | 'center' | null)[] };
export const parse = (text: string) => fromMarkdown(text, { extensions: [gfmTable(), math()], mdastExtensions: [gfmTableFromMarkdown(), mathFromMarkdown()] }) as MarkdownNode;

// Derived display text only. Never replace the canonical message or its offsets with this.
export function plainText(raw: string): string {
  const walk = (n: MarkdownNode): string => n.type === 'definition' ? '' : n.type === 'break' ? ' ' : n.value ?? (n.type === 'image' || n.type === 'imageReference' ? n.alt ?? '' : (n.children ?? []).map(walk).join(['root', 'list', 'listItem', 'blockquote', 'table', 'tableRow'].includes(n.type) ? ' ' : ''));
  return walk(parse(raw)).replace(/\s+/g, ' ').trim();
}

export function previewText(text: string, role: string) {
  const chars = Array.from(role === 'assistant' ? plainText(text) : text);
  return chars.slice(0, 512).join('') + (chars.length > 512 ? '…' : '');
}
