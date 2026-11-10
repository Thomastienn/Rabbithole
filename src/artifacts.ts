import { safeDiagramSource } from './diagramSource.ts';

// Ready videos with a missing file carry available: false. Running video jobs also carry their phase and, when the renderer reports it, progress from 0 to 1.
export type ArtifactSummary = { id: string; kind?: 'mermaid' | 'video'; title: string; status: 'pending' | 'ready' | 'failed' | 'canceled' | 'interrupted'; phase?: 'preparing' | 'rendering'; progress?: number | null; available?: false };
export type Artifact = ArtifactSummary & { conversation: string; message: string; kind: 'mermaid' | 'video'; description: string; source: string | null; error: string | null; created: number };
export type DiagramState = { status: 'pending' } | { status: 'ready'; url: string } | { status: 'failed' };

export function artifactsAt(artifacts: Artifact[], conversation: string, message: string) {
  return artifacts.filter(a => (a.kind === 'mermaid' || a.kind === 'video') && a.conversation === conversation && a.message === message);
}

export function mergeArtifact(artifacts: Artifact[], incoming: Artifact, conversation: string, messages: { id: string; role: string }[]) {
  if ((incoming.kind !== 'mermaid' && incoming.kind !== 'video') || incoming.conversation !== conversation || !messages.some(m => m.id === incoming.message && m.role === 'assistant')) return artifacts;
  const index = artifacts.findIndex(a => a.id === incoming.id);
  return index < 0 ? [...artifacts, incoming] : artifacts.map((a, i) => i === index ? incoming : a);
}

export async function renderArtifact(artifact: Artifact, render: (source: string) => Promise<string>): Promise<DiagramState> {
  if (artifact.status === 'pending') return { status: 'pending' };
  if (artifact.status === 'failed') return { status: 'failed' };
  try {
    const source = safeDiagramSource(artifact.source ?? '');
    return { status: 'ready', url: await render(source) };
  } catch { return { status: 'failed' }; }
}
