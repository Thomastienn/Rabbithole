export const appearances = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
] as const;

export type Appearance = typeof appearances[number]['id'];

// Stored per browser and app origin; no or unreadable value means Dark.
export function savedAppearance(): Appearance {
  try { const saved = localStorage.getItem('treetutor.appearance'); return appearances.find(a => a.id === saved)?.id ?? 'dark'; }
  catch { return 'dark'; }
}
