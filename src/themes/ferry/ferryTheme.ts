// Line Diagram, Ferry: Deep-water teal with coral and sand.
// Palette from docs/mockups/line-diagram/ld.css; the shared roles are in ../lineDiagram.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { lineDiagramBase, lineDiagramRoles } from '../lineDiagram';

const { components, localTokens, tokens } = lineDiagramRoles({
    ground: ['#eff6f7', '#07282f'],
    deep: ['#e0ecee', '#041d23'],
    raised: ['#ffffff', '#0f3640'],
    hover: ['#cfe0e3', '#184854'],
    porcelain: ['#07282f', '#f1fbff'],
    onPorcelain: ['#ffffff', '#07282f'],
    ink: ['#102d33', '#e2f0f3'],
    muted: ['#47626a', '#94b7c0'],
    seam: ['#07282f24', '#f1fbff22'],
    seam2: ['#07282f80', '#f1fbff66'],
    failure: ['#b8142a', '#ff8088'],
    selection: ['#b8401f33', '#ff8f7066'],
    line1: ['#b8401f', '#ff8f70'],
    line2: ['#846300', '#f2d27a'],
    line3: ['#6046c7', '#b9a2ff'],
    line4: ['#2a7a1c', '#8fe07a'],
});

export const ferryTheme = defineTheme({
    ...lineDiagramBase,
    name: 'ferry',
    components,
    localTokens,
    tokens,
});
