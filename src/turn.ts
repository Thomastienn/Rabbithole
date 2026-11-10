import { mergeArtifact, type Artifact, type ArtifactSummary } from './artifacts.ts';

export type Usage = { input: number; output: number; cacheRead: number };
export type Message = { id: string; role: string; text: string; status: string; usage?: Usage | null; artifacts?: ArtifactSummary[] };
export const usageLine = (u: Usage) => `${u.input.toLocaleString()} input · ${u.output.toLocaleString()} output · ${u.cacheRead.toLocaleString()} cache-read tokens`;
export type Turn = { user?: Message; reply?: Message; artifacts?: Artifact[] };

// Reconcile saved checkpoints with the latest events for this conversation only.
export function withTurn<T extends { id?: string; messages: Message[]; artifacts?: Artifact[] }>(conversation: T, turn?: Turn): T {
  if (!turn) return conversation;
  const messages = [...conversation.messages];
  for (const message of [turn.user, turn.reply]) {
    if (!message) continue;
    const index = messages.findIndex(m => m.id === message.id);
    if (index < 0) messages.push(message);
    else messages[index] = message;
  }
  let artifacts = conversation.artifacts ?? [];
  if (conversation.id) for (const artifact of turn.artifacts ?? []) artifacts = mergeArtifact(artifacts, artifact, conversation.id, messages);
  return { ...conversation, messages, ...(turn.artifacts && { artifacts }) };
}
