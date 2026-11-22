// Line Diagram, Main Line: Navy and porcelain with cobalt, amber, green and magenta.
// Palette from docs/mockups/line-diagram/ld.css; the shared roles are in ../lineDiagram.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { lineDiagramBase, lineDiagramRoles } from '../lineDiagram';

const { components, localTokens, tokens } = lineDiagramRoles({
    ground: ['#f4f6fb', '#0b1230'],
    deep: ['#e8ecf6', '#070d24'],
    raised: ['#ffffff', '#141d42'],
    hover: ['#dde3f1', '#1f2a5a'],
    porcelain: ['#0b1230', '#ffffff'],
    onPorcelain: ['#ffffff', '#0b1230'],
    ink: ['#141b3a', '#e9ecf7'],
    muted: ['#4d587c', '#97a1c4'],
    seam: ['#0b123024', '#ffffff22'],
    seam2: ['#0b123080', '#ffffff66'],
    failure: ['#c0152a', '#ff6b78'],
    selection: ['#1f4fd833', '#4d7dff66'],
    line1: ['#1f4fd8', '#4d7dff'],
    line2: ['#8f6200', '#ffc20e'],
    line3: ['#157a3a', '#22b14c'],
    line4: ['#b8297a', '#f06bb0'],
});

export const mainTheme = defineTheme({
    ...lineDiagramBase,
    name: 'main',
    components,
    localTokens,
    tokens,
});
