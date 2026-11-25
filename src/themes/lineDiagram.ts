// Line Diagram: the roles every theme shares. Each theme source passes only its name and palette.
// Every colour is a [light, dark] tuple; dark is the default.
import type { DefineThemeInput } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { lineDiagramIcons } from './icons';

export type Pair = [light: string, dark: string];
export type Palette = {
    ground: Pair;
    deep: Pair;
    raised: Pair;
    hover: Pair;
    // Porcelain: trunk, rings, focus and the primary action; onPorcelain is text on it and on a line.
    porcelain: Pair;
    onPorcelain: Pair;
    ink: Pair;
    muted: Pair;
    seam: Pair;
    seam2: Pair;
    failure: Pair;
    selection: Pair;
    // The four branch family lines, in the Astryx hue slots too so diagrams and tints follow:
    // yellow = line 1, green = line 2, pink = line 3, blue = line 4.
    line1: Pair;
    line2: Pair;
    line3: Pair;
    line4: Pair;
};

// Spread into each theme's defineTheme call: `astryx theme build` reads the icon registry only through
// a plain spread or an `extends`, never through a function's return value.
export const lineDiagramBase = {
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
    icons: lineDiagramIcons,
};

const alpha = ([l, d]: Pair, a: string, b = a): Pair => [`${l}${a}`, `${d}${b}`];
const soft = (p: Pair) => alpha(p, '24', '2e');

export const lineDiagramRoles = (
    p: Palette,
): Pick<DefineThemeInput, 'components' | 'localTokens' | 'tokens'> => {
    const {
        ground,
        deep,
        raised,
        hover,
        porcelain,
        onPorcelain,
        ink,
        muted,
        seam,
        seam2,
        failure,
        selection,
    } = p;
    const { line1, line2, line3, line4 } = p;
    // Flat: hairline seams, never drop shadows.
    const hairline = `inset 0 0 0 1px light-dark(${seam[0]}, ${seam[1]})`;
    return {
        // Neutral bumps secondary text to its own greys in these states; keep the theme's muted ink instead.
        components: {
            ...Object.fromEntries(
                [
                    ['item', 'selected'],
                    ['tree-list-item', 'selected'],
                    ['file-input', 'mode:dropzone'],
                    ['citation', 'variant:number'],
                ].map(([name, state]) => [
                    name,
                    {
                        [state]: {
                            '--color-text-secondary': `light-dark(${muted[0]}, ${muted[1]})`,
                        },
                    },
                ]),
            ),
            // Default button (mockup .btn): outlined at 40% ink, 36px (30px small), semibold; primary keeps its fill.
            button: {
                'variant:secondary': {
                    backgroundColor: 'transparent',
                    boxShadow: `inset 0 0 0 1px light-dark(${ink[0]}66, ${ink[1]}66)`,
                    fontWeight: '600',
                    ':hover': { backgroundColor: 'var(--color-background-gray)' },
                },
                'variant:secondary+size:md': { height: '36px' },
                'variant:secondary+size:sm': { height: '30px', fontSize: '13px' },
            },
            // Progress (mockup .bar): a hairline-seam track under the porcelain fill.
            'progress-bar': {
                base: { '--color-background-muted': `light-dark(${seam[0]}, ${seam[1]})` },
            },
            // Select button (mockup .selb): 36px like the default button.
            selector: { 'size:md': { height: '36px' } },
            // Segmented choice (mockup .seg): raised track, the chosen segment in porcelain.
            'segmented-control': {
                base: { backgroundColor: `light-dark(${raised[0]}, ${raised[1]})` },
                'size:md': { height: '36px', padding: '3px' },
            },
            'segmented-control-item': {
                'size:md': { height: '30px' },
                selected: {
                    backgroundColor: `light-dark(${porcelain[0]}, ${porcelain[1]})`,
                    color: `light-dark(${onPorcelain[0]}, ${onPorcelain[1]})`,
                    fontWeight: '600',
                },
            },
        },
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

            // Hints and option descriptions (mockup .hint, .opt p): 13px at the body's leading.
            '--text-supporting-size': '13px',
            '--text-supporting-leading': '1.45',

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
    };
};
