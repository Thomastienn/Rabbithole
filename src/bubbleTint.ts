// Neutral (12% chalk) plus the four chalk hues; each token is a [light, dark] theme tuple.
export const bubbleTints = [
  { id: 'neutral', label: 'Neutral', color: 'var(--color-neutral)' },
  { id: 'yellow', label: 'Yellow', color: 'var(--color-background-yellow)' },
  { id: 'blue', label: 'Blue', color: 'var(--color-background-blue)' },
  { id: 'pink', label: 'Pink', color: 'var(--color-background-pink)' },
  { id: 'green', label: 'Green', color: 'var(--color-background-green)' },
] as const;

export type BubbleTint = typeof bubbleTints[number]['id'];

// Presets saved before the slate palette map to their nearest chalk hue.
const legacy: Record<string, BubbleTint> = { accent: 'yellow', amber: 'yellow', purple: 'pink' };
export const savedTint = (saved: string | null): BubbleTint => bubbleTints.find(t => t.id === saved)?.id ?? legacy[saved ?? ''] ?? 'neutral';
