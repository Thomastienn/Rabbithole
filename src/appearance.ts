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

// Theme slugs match src/astryx-themes.ts; Appearance still picks each theme's light or dark variant.
export const themeChoices = [
  { id: 'paperback', label: 'Paperback' },
  { id: 'forest', label: 'Forest' },
  { id: 'harbor', label: 'Harbor' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'ember', label: 'Ember' },
  { id: 'graphite', label: 'Graphite' },
] as const;

export type ThemeChoice = typeof themeChoices[number]['id'];

// Stored per browser and app origin; no, unknown or unreadable value means Paperback.
export const savedTheme = (saved: string | null): ThemeChoice => themeChoices.find(t => t.id === saved)?.id ?? 'paperback';
