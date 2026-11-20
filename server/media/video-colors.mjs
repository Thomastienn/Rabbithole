// The kit palette and the plan's true colours (ADR 0009).
export const inks = ['amber', 'leaf', 'rust', 'lichen'];
export const neutrals = ['ground', 'raised', 'seam', 'line', 'paper', 'muted'];
export const videoPalette = {
    ground: '#1a1613',
    raised: '#241e19',
    seam: '#efe6d61f',
    line: '#efe6d647',
    paper: '#efe6d6',
    muted: '#ab9e8b',
    amber: '#dfae4e',
    leaf: '#9dba6e',
    rust: '#d68560',
    lichen: '#86b8ae',
};
// A palette role maps to an ink or to a name in the brief's trueColors map ({name: hex}, ADR 0009).
export const roleColor = (brief, role) =>
    videoPalette[brief.paletteRoles[role]] ?? brief.trueColors?.[brief.paletteRoles[role]];
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
                /^[A-Za-z]\w*$/.test(name) && !Object.hasOwn(videoPalette, name) && trueHex(hex),
        ));
