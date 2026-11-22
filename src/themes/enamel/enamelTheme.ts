// Line Diagram, Enamel: Bottle green and cream, like a station sign.
// Palette from docs/mockups/line-diagram/ld.css; the shared roles are in ../lineDiagram.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { lineDiagramBase, lineDiagramRoles } from '../lineDiagram';

const { components, localTokens, tokens } = lineDiagramRoles({
    ground: ['#f3f6ee', '#0b2a22'],
    deep: ['#e6ebdd', '#061f19'],
    raised: ['#ffffff', '#12382e'],
    hover: ['#d8dfcc', '#1c4a3d'],
    porcelain: ['#07271e', '#fff6df'],
    onPorcelain: ['#ffffff', '#0b2a22'],
    ink: ['#15302a', '#e6efe6'],
    muted: ['#4c6157', '#9cb8aa'],
    seam: ['#07271e24', '#fff6df22'],
    seam2: ['#07271e80', '#fff6df66'],
    failure: ['#b3141f', '#ff8a80'],
    // Dark selection is lighter than the mockup's 66 alpha so selected text keeps 4.5:1 on raised panels.
    selection: ['#8a640033', '#ffd23f4b'],
    line1: ['#8a6400', '#ffd23f'],
    line2: ['#0b6aa3', '#6cc7ff'],
    line3: ['#b23a2a', '#ff9a8a'],
    line4: ['#7a3fb3', '#d6a8ff'],
});

export const enamelTheme = defineTheme({
    ...lineDiagramBase,
    name: 'enamel',
    components,
    localTokens,
    tokens,
});
