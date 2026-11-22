// Line Diagram, Terminus: Carriage maroon with gold and cream.
// Palette from docs/mockups/line-diagram/ld.css; the shared roles are in ../lineDiagram.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { lineDiagramBase, lineDiagramRoles } from '../lineDiagram';

const { components, localTokens, tokens } = lineDiagramRoles({
    ground: ['#f8f1ee', '#2a0f18'],
    deep: ['#eee3de', '#1e0910'],
    raised: ['#ffffff', '#3a1722'],
    hover: ['#e2d3cd', '#4e2130'],
    porcelain: ['#3a0f1c', '#fff2dc'],
    onPorcelain: ['#ffffff', '#2a0f18'],
    ink: ['#33131c', '#f3e6e2'],
    muted: ['#6b4b52', '#c9a7ae'],
    seam: ['#3a0f1c24', '#fff2dc22'],
    seam2: ['#3a0f1c80', '#fff2dc66'],
    failure: ['#b8142a', '#ff8f8f'],
    // Dark selection is lighter than the mockup's 66 alpha so selected text keeps 4.5:1 on raised panels.
    selection: ['#87600033', '#f2c14e62'],
    line1: ['#876000', '#f2c14e'],
    line2: ['#1565a8', '#7cc4ff'],
    line3: ['#12754a', '#7fd8a8'],
    line4: ['#b0471a', '#ffab7a'],
});

export const terminusTheme = defineTheme({
    ...lineDiagramBase,
    name: 'terminus',
    components,
    localTokens,
    tokens,
});
