import { safeDiagramSource } from './diagramSource.ts';

// Ready videos are exported once their MP4 exists; one with neither MP4 nor cuts carries available: false.
export type ArtifactSummary = {
    id: string;
    kind?: 'mermaid' | 'video' | 'visual' | 'discussion';
    title: string;
    status: 'pending' | 'ready' | 'failed' | 'canceled' | 'interrupted';
    available?: false;
    exported?: boolean;
    classmates?: number;
};
export type Artifact = ArtifactSummary & {
    conversation: string;
    message: string;
    kind: 'mermaid' | 'video' | 'visual' | 'discussion';
    description: string;
    source?: string | null;
    discussion?: {
        classmates: string[];
        lines: { speaker: string; text: string }[];
        closed?: true;
        turn?: { start: number; status: 'streaming' | 'completed' | 'failed' };
    };
    error: string | null;
    created: number;
    position?: number | null;
    // A visual beside the section after its position; null sits in the flow.
    side?: 'left' | 'right' | null;
    phase?:
        | 'planning'
        | 'pieces'
        | 'creating'
        | 'writing'
        | 'narrating'
        | 'auditing'
        | 'playable'
        | 'saving';
    cut?: number;
    cuts?: number;
    progress?: number;
    characters?: number;
    frames?: number;
    startedAt?: number;
    phaseStartedAt?: number;
    // Pending videos: one row per cut (its state may move back) and the set pieces still being drawn.
    cutRows?: {
        cut: number;
        title: string;
        state: 'writing' | 'narrating' | 'auditing' | 'fixing' | 'repairing' | 'ready';
    }[];
    drawing?: { drawing: string[]; drawn: number; total: number };
};
export type DiscussionReply = (artifact: Artifact, text: string) => Promise<void>;
export type DiagramState =
    { status: 'pending' } | { status: 'ready'; url: string } | { status: 'failed' };

const KINDS = ['mermaid', 'video', 'visual', 'discussion'];

// Visual frames report their height and the visual part under the pointer; branch shapes validate visual
// branch requests (label, explanation). A picked part adds its trail of names, outermost first, and its step.
export type VisualPart = {
    label: string;
    explanation: string;
    trail?: string[];
    step?: number | null;
};
export type PartBox = { name: string; x: number; y: number; width: number; height: number };
export type PartMark = Omit<PartBox, 'name'> & { trail: string[] };
// The visual's parts, nested, that the ask box picks from with the keyboard.
export type PartNode = PartBox & { parts: PartNode[] };
export type VisualMessage =
    | { type: 'height'; height: number }
    | ({ type: 'branch' } & VisualPart)
    | { type: 'part'; parts: PartBox[] }
    | { type: 'pick'; parts: PartBox[]; step: number | null }
    | { type: 'leave' }
    | { type: 'marks'; marks: PartMark[] }
    | { type: 'tree'; parts: PartNode[]; step: number | null };
export function visualPassage(visual: Pick<Artifact, 'title' | 'description'>, part: VisualPart) {
    return part.trail
        ? `Visual: ${visual.title}\n${visual.description}\nPart: ${part.trail.join(' › ')}`
        : `Visual: ${visual.title}\n${visual.description}\nPart: ${part.label}\n${part.explanation}`;
}
const partName = (v: unknown) =>
    typeof v === 'string' &&
    !!v.trim() &&
    v.length <= 60 &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(v);
// A part trail: one to three names, outermost first.
export function partTrail(v: unknown): string[] | undefined {
    if (Array.isArray(v) && v.length >= 1 && v.length <= 3 && v.every(partName))
        return v.map((name: string) => name.trim());
}
const step = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 0);
type Frame = { width: number; height: number };
// Boxes from the sandbox must lie inside the frame; 1px absorbs subpixel rounding.
function inside(b: unknown, keys: string, frame: Frame): b is Record<string, unknown> {
    if (!b || typeof b !== 'object' || Object.keys(b).sort().join() !== keys) return false;
    const { x, y, width: w, height: h } = b as Record<string, unknown>;
    return (
        [x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
        (x as number) + (w as number) <= frame.width + 1 &&
        (y as number) + (h as number) <= frame.height + 1
    );
}
function partBoxes(v: unknown, frame: Frame) {
    if (!Array.isArray(v) || !v.every((b) => inside(b, 'height,name,width,x,y', frame))) return;
    const names = partTrail(v.map((b) => b.name));
    return names && v.map((b, i) => ({ ...b, name: names[i] }) as PartBox);
}
// Branched parts the frame draws; the host asks for at most one per branch, so 50 bounds a visual's branches.
function partMarks(v: unknown, frame: Frame) {
    if (!Array.isArray(v) || v.length > 50) return;
    const marks = v.map((b) =>
        inside(b, 'height,trail,width,x,y', frame) && partTrail(b.trail)
            ? ({ ...b, trail: partTrail(b.trail) } as PartMark)
            : undefined,
    );
    if (marks.every(Boolean)) return marks as PartMark[];
}
// At most three levels and 200 parts, each inside the frame.
function partTree(v: unknown, frame: Frame) {
    let count = 0;
    const level = (v: unknown, depth: number): PartNode[] | undefined => {
        if (!Array.isArray(v) || (depth > 3 && v.length) || (count += v.length) > 200) return;
        const nodes = v.map((b) => {
            const parts =
                inside(b, 'height,name,parts,width,x,y', frame) &&
                partName(b.name) &&
                level(b.parts, depth + 1);
            return parts && ({ ...b, name: (b.name as string).trim(), parts } as PartNode);
        });
        if (nodes.every(Boolean)) return nodes as PartNode[];
    };
    return level(v, 1);
}
export function visualMessage(data: unknown, frame?: Frame): VisualMessage | undefined {
    if (!data || typeof data !== 'object') return;
    const m = data as Record<string, unknown>,
        keys = Object.keys(m).sort().join();
    if (
        m.type === 'height' &&
        keys === 'height,type' &&
        typeof m.height === 'number' &&
        Number.isFinite(m.height)
    )
        return { type: 'height', height: Math.min(Math.max(Math.ceil(m.height), 0), 4000) };
    if (frame && m.type === 'leave' && keys === 'type') return { type: 'leave' };
    const parts = frame && partBoxes(m.parts, frame);
    if (parts && m.type === 'part' && keys === 'parts,type') return { type: 'part', parts };
    if (parts && m.type === 'pick' && keys === 'parts,step,type' && step(m.step))
        return { type: 'pick', parts, step: m.step as number | null };
    const marks = frame && m.type === 'marks' && keys === 'marks,type' && partMarks(m.marks, frame);
    if (marks) return { type: 'marks', marks };
    const tree =
        frame && m.type === 'tree' && keys === 'parts,step,type' && partTree(m.parts, frame);
    if (tree && step(m.step)) return { type: 'tree', parts: tree, step: m.step as number | null };
    const bounded = (v: unknown, max: number) =>
        typeof v === 'string' && !!v.trim() && v.length <= max && !/[\r\n]/.test(v);
    if (
        m.type === 'branch' &&
        keys === 'explanation,label,type' &&
        bounded(m.label, 120) &&
        bounded(m.explanation, 280)
    )
        return {
            type: 'branch',
            label: (m.label as string).trim(),
            explanation: (m.explanation as string).trim(),
        };
}

export function artifactsAt(artifacts: Artifact[], conversation: string, message: string) {
    return artifacts.filter(
        (a) => KINDS.includes(a.kind) && a.conversation === conversation && a.message === message,
    );
}

export function mergeArtifact(
    artifacts: Artifact[],
    incoming: Artifact,
    conversation: string,
    messages: { id: string; role: string }[],
) {
    if (
        !KINDS.includes(incoming.kind) ||
        incoming.conversation !== conversation ||
        !messages.some((m) => m.id === incoming.message && m.role === 'assistant')
    )
        return artifacts;
    const index = artifacts.findIndex((a) => a.id === incoming.id);
    // Separate reply streams can arrive out of order; closing a discussion is permanent.
    if (index >= 0 && artifacts[index].discussion?.closed && !incoming.discussion?.closed)
        return artifacts;
    return index < 0
        ? [...artifacts, incoming]
        : artifacts.map((a, i) => (i === index ? incoming : a));
}

export async function renderArtifact(
    artifact: Artifact,
    render: (source: string) => Promise<string>,
): Promise<DiagramState> {
    if (artifact.status === 'pending') return { status: 'pending' };
    if (artifact.status === 'failed') return { status: 'failed' };
    try {
        const source = safeDiagramSource(artifact.source ?? '');
        return { status: 'ready', url: await render(source) };
    } catch {
        return { status: 'failed' };
    }
}
