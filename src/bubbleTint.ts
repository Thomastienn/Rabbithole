// Neutral (paper at low strength) plus the four series inks; each token is a [light, dark] theme tuple.
// Ids keep the theme's hue slots (yellow = amber, green = leaf, pink = rust, blue = lichen) so saved presets still apply.
export const bubbleTints = [
  { id: 'neutral', label: 'Neutral', color: 'var(--color-neutral)' },
  { id: 'yellow', label: 'Amber', color: 'var(--color-background-yellow)' },
  { id: 'blue', label: 'Lichen', color: 'var(--color-background-blue)' },
  { id: 'pink', label: 'Rust', color: 'var(--color-background-pink)' },
  { id: 'green', label: 'Leaf', color: 'var(--color-background-green)' },
] as const;

export type BubbleTint = typeof bubbleTints[number]['id'];

// Presets saved before the slate palette map to their nearest ink.
const legacy: Record<string, BubbleTint> = { accent: 'yellow', amber: 'yellow', purple: 'pink' };
export const savedTint = (saved: string | null): BubbleTint => bubbleTints.find(t => t.id === saved)?.id ?? legacy[saved ?? ''] ?? 'neutral';
