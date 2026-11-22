import { modelMessage } from '../attachments.mjs';
import { discussionText } from './discussion-context.mjs';

// Compaction sees each pending or ready media request only as one "[Visual: title — description]" line at its place in the reply, never code or JSON.
// Tool calls go in full, without their display-only ids and timings.
export function compactionMessages(tree) {
    const media = (tree.artifacts ?? []).filter(
        (a) => a.conversation === tree.id && (a.status === 'ready' || a.status === 'pending'),
    );
    return tree.messages
        .filter((m) => m.status === 'completed')
        .map(modelMessage)
        .map(({ tools, ...message }) =>
            tools
                ? {
                      ...message,
                      tools: tools.map(({ name, input, output }) => ({ name, input, output })),
                  }
                : message,
        )
        .map((message) => {
            const own = media
                .filter((a) => a.message === message.id)
                .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
            if (!own.length) return message;
            let text = '',
                cursor = 0;
            for (const a of own) {
                const at = Math.min(a.position ?? message.text.length, message.text.length);
                text +=
                    message.text.slice(cursor, at) +
                    (a.kind === 'discussion'
                        ? discussionText(a)
                        : `\n[${a.kind === 'video' ? 'Video' : a.kind === 'visual' ? 'Visual' : 'Diagram'}: ${a.title} — ${a.description}]\n`);
                cursor = at;
            }
            return { ...message, text: text + message.text.slice(cursor) };
        });
}
