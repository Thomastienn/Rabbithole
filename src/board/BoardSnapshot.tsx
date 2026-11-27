import type { Op } from './player';
import BoardItem from './BoardItem';

// The board as it stood at the end of a reply, drawn still under its text in normal chat (mockup Rabbithole-brd.16).
export default function BoardSnapshot({ items }: { items: Op[] }) {
    const labels = items.flatMap((op) => op.text ?? []);
    // The last area: each clear starts a fresh 900-pixel area below the one before.
    const top = 900 * items.filter((op) => op.kind === 'clear').length;
    return (
        <figure
            className="board-snapshot"
            role="img"
            aria-label={`Board at this reply: ${labels.join(', ')}`}
        >
            <svg viewBox={`0 ${top} 1600 900`} aria-hidden>
                {items.map((op) => (
                    <BoardItem key={op.id} op={op} ms={0} />
                ))}
            </svg>
        </figure>
    );
}
