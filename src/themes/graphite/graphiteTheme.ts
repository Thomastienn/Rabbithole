// Graphite: Paperback's type, corners and 8px module in neutral grays with one cobalt action accent. Every colour is a [light, dark] tuple.
// Astryx theme entries may only import modules inside their own directory, so the shared Paperback
// settings and icons are copied here; keep them in step with ../paperback/paperbackTheme.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { graphiteIcons } from './icons';

const mist = '#e5e5e5', pine = '#242424';
const hairline = 'inset 0 0 0 1px light-dark(#24242426, #e5e5e51f)';

// Series inks in the same hue slots as Paperback: four gray tones; addresses keep families identifiable without hue.
type Pair = [light: string, dark: string];
const graphite: Pair = ['#444444', '#bebebe'], charcoal: Pair = ['#505050', '#cccccc'], steel: Pair = ['#5a5a5a', '#a9a9a9'], silver: Pair = ['#626262', '#dedede'];
const soft = ([l, d]: Pair): Pair => [`${l}24`, `${d}2e`];
const secondary: Pair = ['#535353', '#b2b2b2'];

export const graphiteTheme = defineTheme({
  name: 'graphite',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    heading: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    code: { family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace' },
  },
  radius: { base: 8, multiplier: 1 },
  icons: graphiteIcons,
  components: Object.fromEntries([['item', 'selected'], ['tree-list-item', 'selected'], ['file-input', 'mode:dropzone'], ['citation', 'variant:number']]
    .map(([name, state]) => [name, { [state]: { '--color-text-secondary': `light-dark(${secondary[0]}, ${secondary[1]})` } }])),
  localTokens: {
    '--treetutor-font-reading': 'Literata, Georgia, "Times New Roman", serif',
    '--treetutor-module': '8px',
    '--treetutor-band-ink': ['#eeeeee', '#e5e5e5'],
    '--treetutor-band-muted': ['#b4b4b4', '#b4b4b4'],
    '--treetutor-map-node-width': '16rem',
    '--treetutor-sidebar-width': '14.5rem',
    '--treetutor-branch-width': '2px',
    '--treetutor-branch-focus-width': '2.5px',
    '--treetutor-branch-draw-duration': '350ms',
    '--treetutor-selection': ['#c9d7f8', '#9ab5ff59'],
    '--treetutor-band': '#252525',
    '--treetutor-paper': [pine, mist],
    '--treetutor-paper-ink': ['#f7f7f7', '#161616'],
    '--treetutor-ink-1': graphite,
    '--treetutor-ink-2': charcoal,
    '--treetutor-ink-3': steel,
    '--treetutor-ink-4': silver,
    '--treetutor-ink-on': ['#ffffff', '#161616'],
    '--treetutor-branch-color': ['#242424bf', '#e5e5e5bf'],
  },
  tokens: {
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-inner': '6px',
    '--radius-page': '16px',
    '--radius-chat': '16px',

    '--focus-outline-color': [pine, mist],

    '--color-background-body': ['#e9e9e9', '#161616'],
    '--color-background-surface': ['#f7f7f7', '#202020'],
    '--color-background-card': ['#f7f7f7', '#202020'],
    '--color-background-popover': ['#ffffff', '#2b2b2b'],
    '--color-background-muted': ['#dadada', '#101010'],
    '--color-background-gray': ['#2424241a', '#e5e5e51f'],
    '--color-border-gray': ['#24242426', '#e5e5e51f'],
    '--color-icon-gray': secondary,
    '--color-neutral': ['#2424241a', '#e5e5e51f'],
    '--color-overlay': ['#24242466', '#080808b8'],
    '--color-overlay-hover': ['#2424240f', '#e5e5e514'],
    '--color-overlay-pressed': ['#2424241f', '#e5e5e524'],
    '--color-tint-hover': ['#2424240f', '#e5e5e514'],
    '--color-skeleton': ['#2424241a', '#e5e5e51a'],
    '--color-shadow': ['#2424241f', '#00000066'],

    '--color-text-primary': [pine, mist],
    '--color-text-secondary': secondary,
    '--color-text-disabled': ['#7b7b7b', '#777777'],
    '--color-icon-primary': [pine, mist],
    '--color-icon-secondary': secondary,
    '--color-icon-disabled': ['#7b7b7b', '#777777'],
    '--color-on-light': pine,
    '--color-on-dark': mist,

    '--color-border': ['#24242426', '#e5e5e51f'],
    '--color-border-emphasized': ['#24242459', '#e5e5e54d'],

    // Cobalt: the one action colour.
    '--color-accent': ['#2455bf', '#8cabff'],
    '--color-accent-muted': ['#2455bf1f', '#8cabff26'],
    '--color-text-accent': ['#214ba8', '#9ab5ff'],
    '--color-icon-accent': ['#214ba8', '#9ab5ff'],
    '--color-on-accent': ['#ffffff', '#101c38'],

    // Rose red: failures only.
    '--color-error': ['#b3263a', '#f07f8a'],
    '--color-error-muted': ['#b3263a1a', '#f07f8a26'],
    '--color-on-error': ['#ffffff', '#240a0e'],
    '--color-on-error-muted': ['#8c1c2c', '#f7b5bb'],
    '--color-text-error': ['#b3263a', '#f07f8a'],
    '--color-icon-error': ['#b3263a', '#f07f8a'],
    '--color-border-error': ['#b3263a', '#f07f8a'],

    '--color-text-yellow': graphite, '--color-icon-yellow': graphite, '--color-border-yellow': graphite, '--color-background-yellow': soft(graphite),
    '--color-text-green': charcoal, '--color-icon-green': charcoal, '--color-border-green': charcoal, '--color-background-green': soft(charcoal),
    '--color-text-pink': steel, '--color-icon-pink': steel, '--color-border-pink': steel, '--color-background-pink': soft(steel),
    '--color-background-purple': soft(steel),
    '--color-text-blue': silver, '--color-icon-blue': silver, '--color-border-blue': silver, '--color-background-blue': soft(silver),

    '--shadow-low': hairline,
    '--shadow-med': hairline,
    '--shadow-high': hairline,
  },
});
