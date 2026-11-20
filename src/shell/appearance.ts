export const appearances = [
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
    { id: 'system', label: 'System' },
] as const;

export type Appearance = (typeof appearances)[number]['id'];

// Stored per browser and app origin; no or unreadable value means Dark.
export function savedAppearance(): Appearance {
    try {
        const saved = localStorage.getItem('rabbithole.appearance');
        return appearances.find((a) => a.id === saved)?.id ?? 'dark';
    } catch {
        return 'dark';
    }
}

// Theme slugs match src/astryx-themes.ts; Appearance still picks each theme's light or dark variant.
// Adding a theme touches more than this list: see "Adding a theme" in DESIGN.md.
export const themeChoices = [
    { id: 'platform', label: 'Platform', blurb: 'Graphite with the Main Line colours.' },
    {
        id: 'main',
        label: 'Main Line',
        blurb: 'Navy and porcelain with cobalt, amber, green and magenta.',
    },
    { id: 'enamel', label: 'Enamel', blurb: 'Bottle green and cream, like a station sign.' },
    { id: 'tunnel', label: 'Tunnel', blurb: 'Neutral charcoal with signal-lamp lines.' },
    { id: 'timetable', label: 'Timetable', blurb: 'Printed paper with press inks.' },
    { id: 'ferry', label: 'Ferry', blurb: 'Deep-water teal with coral and sand.' },
    { id: 'terminus', label: 'Terminus', blurb: 'Carriage maroon with gold and cream.' },
] as const;

export type ThemeChoice = (typeof themeChoices)[number]['id'];

// Stored per browser and app origin; no, unknown (including the retired Paperback-era slugs) or unreadable value means Platform.
export const savedTheme = (saved: string | null): ThemeChoice =>
    themeChoices.find((t) => t.id === saved)?.id ?? 'platform';

export const fontChoices = {
    'reading-font': [
        { id: 'atkinson', label: 'Atkinson Hyperlegible Next' },
        { id: 'system', label: 'System' },
    ],
    'interface-font': [
        { id: 'barlow', label: 'Barlow' },
        { id: 'system', label: 'System' },
    ],
} as const;

export type FontKind = keyof typeof fontChoices;

// Stored per browser and app origin; no, unknown (including the retired literata and archivo) or unreadable value means the first (bundled) font.
export function savedFont(kind: FontKind): string {
    try {
        const saved = localStorage.getItem(`rabbithole.${kind}`);
        return fontChoices[kind].find((f) => f.id === saved)?.id ?? fontChoices[kind][0].id;
    } catch {
        return fontChoices[kind][0].id;
    }
}

// On <html>, so shell.css's font overrides also reach portals.
export const applyFont = (kind: FontKind, id: string) =>
    document.documentElement.setAttribute(`data-${kind}`, id);
