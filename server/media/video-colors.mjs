import { paletteFor } from './theme-palette.mjs';

// The kit palette and the plan's true colours (ADR 0009).
export const inks = ['amber', 'leaf', 'rust', 'lichen'];
export const neutrals = ['ground', 'raised', 'seam', 'line', 'paper', 'muted'];
// The house look is the app theme a video starts in: its ground, text and four branch inks (ADR 0026).
export function videoPalette(theme) {
    const token = paletteFor(theme).tokens;
    const paper = token['--color-text-primary'];
    return {
        ground: token['--color-background-body'],
        raised: token['--color-background-surface'],
        seam: paper + '1f',
        line: paper + '47',
        paper,
        muted: token['--color-text-secondary'],
        // The inks take the theme's hue slots in the order diagrams use (src/media/diagramTheme.ts).
        amber: token['--color-text-yellow'],
        leaf: token['--color-text-green'],
        rust: token['--color-text-pink'],
        lichen: token['--color-text-blue'],
    };
}
// A brief saved before videos took the theme falls back to the default theme.
export const briefPalette = (brief) => brief.palette ?? videoPalette();
// A palette role maps to an ink or to a name in the brief's trueColors map ({name: hex}, ADR 0009).
export const roleColor = (brief, role) =>
    briefPalette(brief)[brief.paletteRoles[role]] ?? brief.trueColors?.[brief.paletteRoles[role]];
// Any six-digit hex, near-white included, except pure white.
const trueHex = (v) => /^#[\da-f]{6}$/i.test(v) && v.toLowerCase() !== '#ffffff';
// An optional {name: hex} map whose names never shadow a palette key.
export const trueColorsOk = (map) =>
    map === undefined ||
    (!!map &&
        typeof map === 'object' &&
        !Array.isArray(map) &&
        Object.entries(map).every(
            ([name, hex]) =>
                /^[A-Za-z]\w*$/.test(name) &&
                ![...inks, ...neutrals].includes(name) &&
                trueHex(hex),
        ));
