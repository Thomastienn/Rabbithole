import archivo from '@fontsource/archivo/files/archivo-latin-400-normal.woff2?inline';

// A diagram shown as an SVG image cannot reach page fonts, so it carries the UI face itself.
// shortcut: latin 400 only (bold is synthesized); add weights or subsets if diagrams need them.
export const diagramFontFace = `@font-face { font-family: "Archivo"; src: url(${archivo}) format("woff2"); }`;
