import type { Preview } from '../map/TreeOverview';
import type { Artifact } from '../media/artifacts';

// The tree's figures in address order: the open conversation from its artifacts, the rest from map previews.
// The sidebar's Figures list and each card's "Fig N" both count from this list.
export function figureList(
    conversations: { id: string }[],
    previews: Record<string, Preview>,
    current?: { id: string; messages: { id: string }[]; artifacts: Artifact[] },
) {
    return conversations.flatMap((t) =>
        (t.id === current?.id
            ? current.messages.map((m) => ({
                  artifacts: current.artifacts.filter((a) => a.message === m.id),
              }))
            : (previews[t.id] ?? [])
        ).flatMap((m) =>
            (m.artifacts ?? [])
                .filter(
                    (a) =>
                        a.kind !== 'discussion' &&
                        !(a.kind === 'visual' && a.status === 'canceled'),
                )
                .map((a) => ({ ...a, conversation: t.id })),
        ),
    );
}
