import type { Summary } from '../map/TreeOverview';
import type { Artifact } from '../media/artifacts';
import type { Branch } from './branch';
import type { Message, Suggestions } from './turn';

// A page, image or file the tutor drew on, numbered within its learning tree.
export type Resource = {
    number: number;
    url: string;
    title: string;
    site: string;
    kind: 'page' | 'image' | 'file';
    firstSeen: number;
    conversations: string[];
};
// A saved brief explanation of a reply passage.
export type Brief = { message: string; start: number; end: number; explanation: string };
export type Tree = {
    id: string;
    title: string;
    provider: string;
    model: string | null;
    effort: string | null;
    messages: Message[];
    branch: Branch | null;
    artifacts: Artifact[];
    resources?: Resource[];
    suggestions?: Suggestions[];
    briefs?: Brief[];
    // Keyed by child: the branch's question and the start of the child's first reply.
    branchPreviews?: Record<string, { question: string; preview?: string }>;
    compaction?: { status: 'compacting' | 'failed'; error?: string };
};
export type ModelSelection = Pick<Tree, 'provider' | 'model' | 'effort'>;
export type Providers = Record<
    string,
    { label: string; connected: boolean; installed?: boolean; command?: string }
>;
export type State = {
    csrf: string;
    version?: string;
    auth: { connected: boolean; email: string | null };
    firstRun?: boolean;
    trees: Summary[];
    active: string[];
    discussing?: string[];
    videos: string[];
    suggesting?: string[];
    titling?: string[];
};
