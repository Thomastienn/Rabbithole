import type { Drawn } from './useBoard';
import { componentParts } from './layout';

// What the board shows: erased items and passed pointers fading (gone when replayed), one 1600×900 space a page.
export function sceneOf(items: Drawn[]) {
    const erased = new Map(
        items.flatMap(({ op, ms, passed }) => [
            ...(op.ids ?? []).map((id) => [id, ms] as const),
            ...(passed ? [[op.id, 300] as const] : []),
        ]),
    );
    const shown = items.filter(({ op, ms }) => {
        if (op.kind === 'erase' || op.top !== undefined) return false;
        return erased.get(op.id) !== 0 && (op.kind !== 'pointer' || ms > 0);
    });
    const areas = 1 + Math.max(0, ...items.map(({ op }) => (op.top ?? 0) / 900));
    const ops = shown.map(({ op }) => op);
    return { shown, erased, areas, parts: componentParts(ops, erased) };
}
