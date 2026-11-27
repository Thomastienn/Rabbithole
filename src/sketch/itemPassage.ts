// The passage of a sketch item branch: how it is named and found again in its sketch.
import type { Sketch } from './sketch.ts';

// What a sketch item branch carries as its passage: the sketch's title and the item's label.
export const sketchPassage = (title: string, label: string) => `${title || 'Sketch'} › ${label}`;
// The item a sketch item branch's passage names, or -1 when the sketch no longer draws it.
export const sketchItemOf = (sketch: Sketch | undefined, passage?: string) =>
    sketch?.items.findIndex((item) => sketchPassage(sketch.title, item.label) === passage) ?? -1;
