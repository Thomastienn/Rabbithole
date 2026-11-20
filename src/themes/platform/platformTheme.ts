// Line Diagram, Platform: Graphite with the Main Line colours, the default for long reading.
// Main Line's four hues on a low-chroma ground (OKLCH C 0.012), lines evened to L 0.72-0.80; every theme shares every role and differs only here.
// Every colour is a [light, dark] tuple; dark is the default. Keep the rest in step with the other themes.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { platformIcons } from './icons';

type Pair = [light: string, dark: string];
const ground: Pair = ['#f6f8fa', '#14171d'],
    deep: Pair = ['#edeff3', '#0d1014'],
    raised: Pair = ['#ffffff', '#1d2128'],
    hover: Pair = ['#e1e4ea', '#292d36'],
    // Porcelain: trunk, rings, focus and the primary action; onPorcelain is text on it and on a line.
    porcelain: Pair = ['#191e27', '#f3f5f9'],
    onPorcelain: Pair = ['#ffffff', '#14171d'],
    ink: Pair = ['#1d2229', '#e3e6ec'],
    muted: Pair = ['#5a616c', '#9ea3ad'],
    seam: Pair = ['#191e2724', '#ffffff22'],
    seam2: Pair = ['#191e2780', '#ffffff66'],
    failure: Pair = ['#be222a', '#f17070'],
    selection: Pair = ['#225ebf33', '#6da5f866'];
// The four branch family lines, in the Astryx hue slots too so diagrams and tints follow:
// yellow = line 1, green = line 2, pink = line 3, blue = line 4.
const line1: Pair = ['#225ebf', '#6da5f8'],
    line2: Pair = ['#976213', '#edb24d'],
    line3: Pair = ['#287c42', '#5dc47e'],
    line4: Pair = ['#a93772', '#e37fb0'];
const alpha = ([l, d]: Pair, a: string, b = a): Pair => [`${l}${a}`, `${d}${b}`];
const soft = (p: Pair) => alpha(p, '24', '2e');
// Flat: hairline seams, never drop shadows.
const hairline = `inset 0 0 0 1px light-dark(${seam[0]}, ${seam[1]})`;

export const platformTheme = defineTheme({
    name: 'platform',
    extends: neutralTheme,
    typography: {
        scale: { base: 14, ratio: 1.2 },
        body: { family: 'Barlow', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
        heading: {
            family: 'Barlow Semi Condensed',
            fallbacks: 'Barlow, "Segoe UI", Helvetica, Arial, sans-serif',
        },
        code: { family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace' },
    },
    // 8px corners on controls and containers, 4px on chips.
    radius: { base: 8, multiplier: 1 },
    icons: platformIcons,
    // Neutral bumps secondary text to its own greys in these states; keep the theme's muted ink instead.
    components: Object.fromEntries(
        [
            ['item', 'selected'],
            ['tree-list-item', 'selected'],
            ['file-input', 'mode:dropzone'],
            ['citation', 'variant:number'],
        ].map(([name, state]) => [
            name,
            { [state]: { '--color-text-secondary': `light-dark(${muted[0]}, ${muted[1]})` } },
        ]),
    ),
    localTokens: {
        // Reply and question reading face.
        '--rabbithole-font-reading':
            '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", Verdana, sans-serif',
        '--rabbithole-selection': selection,
        // The 8px module: every gap, band and column is a multiple.
        '--rabbithole-module': '8px',
        // Shell band: the deep field and its text.
        '--rabbithole-band': deep,
        '--rabbithole-band-ink': ink,
        '--rabbithole-band-muted': muted,
        // Porcelain: the trunk line, rings and focus. The four lines cycle per first-level branch family.
        '--rabbithole-paper': porcelain,
        '--rabbithole-paper-ink': onPorcelain,
        '--rabbithole-ink-1': line1,
        '--rabbithole-ink-2': line2,
        '--rabbithole-ink-3': line3,
        '--rabbithole-ink-4': line4,
        '--rabbithole-ink-on': onPorcelain,
        '--rabbithole-map-node-width': '10rem',
        '--rabbithole-sidebar-width': '14.5rem',
        '--rabbithole-branch-color': porcelain,
        '--rabbithole-branch-width': '7px',
        '--rabbithole-branch-focus-width': '9px',
        '--rabbithole-branch-draw-duration': '350ms',
    },
    tokens: {
        '--radius-element': '8px',
        '--radius-container': '8px',
        '--radius-inner': '4px',
        '--radius-page': '8px',
        '--radius-chat': '8px',

        '--focus-outline-color': porcelain,

        // Ground, raised, deep field and hover.
        '--color-background-body': ground,
        '--color-background-surface': raised,
        '--color-background-card': raised,
        '--color-background-popover': raised,
        '--color-background-muted': deep,
        '--color-background-gray': hover,
        '--color-border-gray': seam,
        '--color-icon-gray': muted,
        '--color-neutral': hover,
        '--color-overlay': [`${porcelain[0]}66`, '#000000b8'],
        '--color-overlay-hover': alpha(porcelain, '0f', '14'),
        '--color-overlay-pressed': alpha(porcelain, '1f', '24'),
        '--color-tint-hover': alpha(porcelain, '0f', '14'),
        '--color-skeleton': hover,
        '--color-shadow': [`${porcelain[0]}1f`, '#00000066'],

        '--color-text-primary': ink,
        '--color-text-secondary': muted,
        '--color-text-disabled': alpha(muted, 'a6'),
        '--color-icon-primary': ink,
        '--color-icon-secondary': muted,
        '--color-icon-disabled': alpha(muted, 'a6'),
        '--color-on-light': ink[0],
        '--color-on-dark': ink[1],

        '--color-border': seam,
        '--color-border-emphasized': seam2,

        // Porcelain is the one action colour.
        '--color-accent': porcelain,
        '--color-accent-muted': alpha(porcelain, '1f', '26'),
        '--color-text-accent': porcelain,
        '--color-icon-accent': porcelain,
        '--color-on-accent': onPorcelain,

        // Scarlet: failures only.
        '--color-error': failure,
        '--color-error-muted': alpha(failure, '1a', '26'),
        '--color-on-error': onPorcelain,
        '--color-on-error-muted': failure,
        '--color-text-error': failure,
        '--color-icon-error': failure,
        '--color-border-error': failure,

        // Family lines in the Astryx hue slots: tint and series colours only.
        '--color-text-yellow': line1,
        '--color-icon-yellow': line1,
        '--color-border-yellow': line1,
        '--color-background-yellow': soft(line1),
        '--color-text-green': line2,
        '--color-icon-green': line2,
        '--color-border-green': line2,
        '--color-background-green': soft(line2),
        '--color-text-pink': line3,
        '--color-icon-pink': line3,
        '--color-border-pink': line3,
        '--color-background-pink': soft(line3),
        '--color-background-purple': soft(line3),
        '--color-text-blue': line4,
        '--color-icon-blue': line4,
        '--color-border-blue': line4,
        '--color-background-blue': soft(line4),

        '--shadow-low': hairline,
        '--shadow-med': hairline,
        '--shadow-high': hairline,
    },
});
