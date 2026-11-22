// Line Diagram, Tunnel: Neutral charcoal with signal-lamp lines.
// Palette from docs/mockups/line-diagram/ld.css; the shared roles are in ../lineDiagram.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { lineDiagramBase, lineDiagramRoles } from '../lineDiagram';

const { components, localTokens, tokens } = lineDiagramRoles({
    ground: ['#f3f3f1', '#151617'],
    deep: ['#e7e7e3', '#0c0d0e'],
    raised: ['#ffffff', '#202224'],
    hover: ['#d9d9d4', '#2d3033'],
    porcelain: ['#151617', '#ffffff'],
    onPorcelain: ['#ffffff', '#151617'],
    ink: ['#1a1b1c', '#ececec'],
    muted: ['#54585c', '#a3a7ab'],
    seam: ['#15161724', '#ffffff22'],
    seam2: ['#15161780', '#ffffff66'],
    failure: ['#c0152a', '#ff6b6b'],
    selection: ['#b04e0033', '#ff943366'],
    line1: ['#b04e00', '#ff9433'],
    line2: ['#0a6a9e', '#3cc8ff'],
    line3: ['#48720a', '#a6e22e'],
    line4: ['#6a3fc4', '#b48cff'],
});

export const tunnelTheme = defineTheme({
    ...lineDiagramBase,
    name: 'tunnel',
    components,
    localTokens,
    tokens,
});
