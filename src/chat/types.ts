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
  compaction?: { status: 'compacting' | 'failed'; error?: string };
};
export type ModelSelection = Pick<Tree, 'provider' | 'model' | 'effort'>;
export type Providers = Record<string, { label: string; connected: boolean }>;
export type State = {
  csrf: string;
  auth: { connected: boolean; email: string | null };
  trees: Summary[];
  active: string[];
  videos: string[];
  suggesting?: string[];
  titling?: string[];
  conceptNameTokens?: number;
};
