export type Message = { id: string; role: string; text: string; status: string };
export type Turn = { user?: Message; reply?: Message };

// Reconcile saved checkpoints with the latest events for this conversation only.
export function withTurn<T extends { messages: Message[] }>(conversation: T, turn?: Turn): T {
  if (!turn) return conversation;
  const messages = [...conversation.messages];
  for (const message of [turn.user, turn.reply]) {
    if (!message) continue;
    const index = messages.findIndex(m => m.id === message.id);
    if (index < 0) messages.push(message);
    else messages[index] = message;
  }
  return { ...conversation, messages };
}
