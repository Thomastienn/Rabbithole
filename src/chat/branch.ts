import type { Source } from '../map/TreeOverview.tsx';
import type { Point } from '../map/canvas.ts';
import type { Message, Suggestions } from './turn.ts';

// at.y is the passage's top in its reply; below is its bottom, where the prompt flips to when above would hit the header.
export type Anchor = Source & { at?: Point & { below?: number }; suggestion?: boolean };
export type Branch = {
  parent: string;
  messageId: string;
  text: string;
  question: string;
  snapshot: string;
  start?: number | null;
  end?: number | null;
  artifactId?: string;
  label?: string;
  explanation?: string;
};

export function passageAnchor(message: Pick<Message, 'id' | 'text'>, start: number, end: number) {
  return end > start
    ? { messageId: message.id, start, end, text: message.text.slice(start, end) }
    : undefined;
}

export function branchRequest({ at: _at, ...anchor }: Anchor, question?: string) {
  return { ...anchor, ...(question !== undefined && { question }) };
}

export function branchConcept(anchor: Anchor, suggestions?: Suggestions[]) {
  return anchor.suggestion
    ? suggestions
        ?.find((s) => s.message === anchor.messageId)
        ?.passages.find((p) => p.start === anchor.start && p.end === anchor.end)?.concept
    : undefined;
}

export function prepareBranch(
  parent: string,
  anchor: ReturnType<typeof branchRequest>,
  api: (path: string, body?: unknown) => Promise<unknown>,
) {
  api(`/api/trees/${parent}/prepare`, anchor).catch(() => {}); // submit reports any failure
  return () => {
    api(`/api/trees/${parent}/unprepare`, anchor).catch(() => {});
  };
}
