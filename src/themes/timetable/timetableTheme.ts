// Line Diagram, Timetable: Printed paper with press inks.
// Palette from docs/mockups/line-diagram/ld.css; the shared roles are in ../lineDiagram.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { lineDiagramBase, lineDiagramRoles } from '../lineDiagram';

const { components, localTokens, tokens } = lineDiagramRoles({
    ground: ['#f6efdf', '#1e1812'],
    deep: ['#ebe2cc', '#150f0a'],
    raised: ['#fffaf0', '#2b231b'],
    hover: ['#ddd2b8', '#3b3026'],
    porcelain: ['#231a10', '#fbf0d9'],
    onPorcelain: ['#ffffff', '#1e1812'],
    ink: ['#2a2016', '#efe5d3'],
    muted: ['#655844', '#b5a68f'],
    seam: ['#231a1024', '#fbf0d922'],
    seam2: ['#231a1080', '#fbf0d966'],
    failure: ['#b3141f', '#ff7b6e'],
    selection: ['#0b68a033', '#4fb8ea66'],
    line1: ['#0b68a0', '#4fb8ea'],
    line2: ['#b32766', '#f2709f'],
    line3: ['#8a6200', '#e6ad2f'],
    line4: ['#0f755a', '#45c49d'],
});

export const timetableTheme = defineTheme({
    ...lineDiagramBase,
    name: 'timetable',
    components,
    localTokens,
    tokens,
});
