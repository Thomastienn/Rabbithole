// Line Diagram, Platform: Graphite with the Main Line colours, the default for long reading.
// Main Line's four hues on a low-chroma ground (OKLCH C 0.012), lines evened to L 0.72-0.80; the shared roles are in ../lineDiagram.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { lineDiagramBase, lineDiagramRoles } from '../lineDiagram';

const { components, localTokens, tokens } = lineDiagramRoles({
    ground: ['#f6f8fa', '#14171d'],
    deep: ['#edeff3', '#0d1014'],
    raised: ['#ffffff', '#1d2128'],
    hover: ['#e1e4ea', '#292d36'],
    porcelain: ['#191e27', '#f3f5f9'],
    onPorcelain: ['#ffffff', '#14171d'],
    ink: ['#1d2229', '#e3e6ec'],
    muted: ['#5a616c', '#9ea3ad'],
    seam: ['#191e2724', '#ffffff22'],
    seam2: ['#191e2780', '#ffffff66'],
    failure: ['#be222a', '#f17070'],
    selection: ['#225ebf33', '#6da5f866'],
    line1: ['#225ebf', '#6da5f8'],
    line2: ['#976213', '#edb24d'],
    line3: ['#287c42', '#5dc47e'],
    line4: ['#a93772', '#e37fb0'],
});

export const platformTheme = defineTheme({
    ...lineDiagramBase,
    name: 'platform',
    components,
    localTokens,
    tokens,
});
