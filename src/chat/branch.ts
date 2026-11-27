import type { Source } from '../map/TreeOverview.tsx';
import type { Point } from '../map/canvas.ts';
import type { Message } from './turn.ts';
import type { PartPicker } from '../media/VisualFrame.tsx';
import { request } from '../serverAccess.ts';

// at.y is the passage's top in its reply; below is its bottom, where the prompt flips to when above would hit the header.
// at.x is the box's left edge, or right its right edge's distance from the reply's right. A sketch item's start..end is its sketch.
export type Anchor = Source & {
    at?: Point & { below?: number; right?: number };
    suggestion?: boolean;
    sketch?: { title: string; label: string };
};
// The open ask box; pending: the question was sent while its reply streams and waits for the reply to complete.
export type BranchState = {
    parent: string;
    anchor: Anchor;
    question: string;
    picker?: PartPicker;
    pending?: boolean;
};
export type Branch = {
    parent: string;
    messageId: string;
    text: string;
    question: string;
    snapshot: string;
    start?: number | null;
    end?: number | null;
    artifactId?: string;
    line?: number;
    speaker?: string;
    discussion?: string;
    label?: string;
    explanation?: string;
    trail?: string[];
    step?: number | null;
};

export function passageAnchor(message: Pick<Message, 'id' | 'text'>, start: number, end: number) {
    return end > start
        ? { messageId: message.id, start, end, text: message.text.slice(start, end) }
        : undefined;
}

export function branchRequest({ at: _at, ...anchor }: Anchor, question?: string) {
    return { ...anchor, ...(question !== undefined && { question }) };
}

export function prepareBranch(parent: string, anchor: ReturnType<typeof branchRequest>) {
    request(`/api/trees/${parent}/prepare`, anchor).catch(() => {}); // submit reports any failure
    return () => {
        request(`/api/trees/${parent}/unprepare`, anchor).catch(() => {});
    };
}
