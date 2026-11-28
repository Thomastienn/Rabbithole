import type { Op } from './player';

// The spotlight (docs/board-sketches-spec.md, mockup Rabbithole-bsk.3): while the tutor speaks, what its latest
// sentence with ops drew or named stays lit and the rest of its page dims; a page the learner opened shows in full.
// It only changes what is shown.

// What a sentence's ops draw or name: a child names its component (a code line only itself), a pointer or
// connector its items too; an erase or a page names none.
export const litBy = (ops: Op[] = []) =>
    ops.flatMap((op) =>
        op.kind === 'erase' || op.top !== undefined
            ? []
            : op.on && op.kind !== 'line'
              ? [op.on]
              : [op.id, ...(op.names ?? [])],
    );

// Whether an item dims: the lit set misses it, a child going with its component.
// Pointers, the learner's strokes, muted items and code panels never dim; a code line dims unless it or its block is lit.
export const dimmed = (op: Op, lit?: Set<string>) =>
    !!lit &&
    op.kind !== 'pointer' &&
    op.kind !== 'code' &&
    op.kind !== 'stroke' &&
    op.look !== 'muted' &&
    !lit.has(op.on ?? op.id) &&
    // A code line or a drawing's path is lit alone when the tutor points at it (mockup Rabbithole-bpl.9).
    !((op.kind === 'line' || op.kind === 'path') && lit.has(op.id));
