export const bubbleTints = [
  { id: 'accent', label: 'Accent', color: 'var(--color-accent-muted)' },
  { id: 'blue', label: 'Blue', color: 'var(--color-background-blue)' },
  { id: 'green', label: 'Green', color: 'var(--color-background-green)' },
  { id: 'purple', label: 'Purple', color: 'var(--color-background-purple)' },
  { id: 'amber', label: 'Amber', color: 'var(--color-background-yellow)' },
  { id: 'neutral', label: 'Neutral', color: 'var(--color-neutral)' },
] as const;

export type BubbleTint = typeof bubbleTints[number]['id'];
