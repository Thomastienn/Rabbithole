import { withTurn, type Turn } from '../chat/turn.ts';
import { previewText } from '../markdown/markdownText.ts';
import type { Preview } from './TreeOverview';

// The in-flight question and streaming reply become the last rows of the node, cut like saved rows.
export const withLiveTurn = (preview: Preview = [], turn?: Turn): Preview =>
  withTurn(
    { messages: preview },
    turn && {
      replaced: turn.replaced,
      user: turn.user && { ...turn.user, text: previewText(turn.user.text, 'user') },
      reply: turn.reply && {
        ...turn.reply,
        text: previewText(turn.reply.text, 'assistant'),
        ...(turn.artifacts && {
          artifacts: turn.artifacts
            .filter((a) => a.message === turn.reply!.id)
            .map(({ id, kind, title, status }) => ({ id, kind, title, status })),
        }),
      },
    },
  ).messages;

export function previewRequests(ids: string[]) {
  const requests: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const params = new URLSearchParams();
    ids.slice(i, i + 500).forEach((id) => params.append('id', id));
    requests.push(`/api/previews?${params}`);
  }
  return requests;
}

export const replyingPreviews = (visible: string[], active: string) =>
  visible.filter((id) => active.split(',').includes(id));
