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
export type VisualMessage =
    | { type: 'height'; height: number }
    | ({ type: 'branch' } & VisualPart)
    | { type: 'part'; parts: PartBox[] }
    | { type: 'pick'; parts: PartBox[]; step: number | null }
    | { type: 'leave' };
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
// Boxes from the sandbox must lie inside the frame; 1px absorbs subpixel rounding.
function partBoxes(v: unknown, frame: { width: number; height: number }) {
    const inside = (b: Record<string, unknown>) => {
        const [x, y, w, h] = [b.x, b.y, b.width, b.height];
        return (
            [x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
            (x as number) + (w as number) <= frame.width + 1 &&
            (y as number) + (h as number) <= frame.height + 1
        );
    };
    if (
        !Array.isArray(v) ||
        !v.every(
            (b) =>
                b &&
                typeof b === 'object' &&
                Object.keys(b).sort().join() === 'height,name,width,x,y' &&
                inside(b),
        )
    )
        return;
    const names = partTrail(v.map((b) => b.name));
    return names && v.map((b, i) => ({ ...b, name: names[i] }) as PartBox);
}
export function visualMessage(
    data: unknown,
    frame?: { width: number; height: number },
): VisualMessage | undefined {
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
