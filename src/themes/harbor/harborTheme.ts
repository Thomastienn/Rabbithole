// Harbor: Paperback's type, corners and 8px module in slate blue and teal. Every colour is a [light, dark] tuple.
// Astryx theme entries may only import modules inside their own directory, so the shared Paperback
// settings and icons are copied here; keep them in step with ../paperback/paperbackTheme.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { harborIcons } from './icons';

const mist = '#dde5ee',
  pine = '#1a2433';
const hairline = 'inset 0 0 0 1px light-dark(#1a243326, #dde5ee1f)';

// Series inks in the same hue slots as Paperback: yellow = sand, green = sea green, pink = coral rose, blue = slate blue.
type Pair = [light: string, dark: string];
const sand: Pair = ['#7a5c10', '#d9b25a'],
  sea: Pair = ['#2c6a4c', '#8cc7a5'],
  coral: Pair = ['#9a3f45', '#e8948f'],
  slate: Pair = ['#3a5a8c', '#9ab4e0'];
const soft = ([l, d]: Pair): Pair => [`${l}24`, `${d}2e`];
const secondary: Pair = ['#4a5668', '#a0adbd'];

export const harborTheme = defineTheme({
  name: 'harbor',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    heading: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    code: { family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace' },
  },
  radius: { base: 8, multiplier: 1 },
  icons: harborIcons,
  components: Object.fromEntries(
    [
      ['item', 'selected'],
      ['tree-list-item', 'selected'],
      ['file-input', 'mode:dropzone'],
      ['citation', 'variant:number'],
    ].map(([name, state]) => [
      name,
      { [state]: { '--color-text-secondary': `light-dark(${secondary[0]}, ${secondary[1]})` } },
    ]),
  ),
  localTokens: {
    '--treetutor-font-reading': 'Literata, Georgia, "Times New Roman", serif',
    '--treetutor-module': '8px',
    '--treetutor-band-ink': ['#e6edf5', '#e1e9f2'],
    '--treetutor-band-muted': ['#a7b6c9', '#a1b1c6'],
    '--treetutor-map-node-width': '16rem',
    '--treetutor-sidebar-width': '14.5rem',
    '--treetutor-branch-width': '2px',
    '--treetutor-branch-focus-width': '2.5px',
    '--treetutor-branch-draw-duration': '350ms',
    '--treetutor-selection': ['#c2d4e6', '#7fd0c859'],
    '--treetutor-band': '#1d2a3a',
    '--treetutor-paper': [pine, mist],
    '--treetutor-paper-ink': ['#f3f6f9', '#121821'],
    '--treetutor-ink-1': sand,
    '--treetutor-ink-2': sea,
    '--treetutor-ink-3': coral,
    '--treetutor-ink-4': slate,
    '--treetutor-ink-on': ['#ffffff', '#121821'],
    '--treetutor-branch-color': ['#1a2433bf', '#dde5eebf'],
  },
  tokens: {
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-inner': '6px',
    '--radius-page': '16px',
    '--radius-chat': '16px',

    '--focus-outline-color': [pine, mist],

    '--color-background-body': ['#e6ebf1', '#121821'],
    '--color-background-surface': ['#f3f6f9', '#1a222d'],
    '--color-background-card': ['#f3f6f9', '#1a222d'],
    '--color-background-popover': ['#ffffff', '#222c39'],
    '--color-background-muted': ['#d8dfe8', '#0c1118'],
    '--color-background-gray': ['#1a24331a', '#dde5ee1f'],
    '--color-border-gray': ['#1a243326', '#dde5ee1f'],
    '--color-icon-gray': secondary,
    '--color-neutral': ['#1a24331a', '#dde5ee1f'],
    '--color-overlay': ['#1a243366', '#06090db8'],
    '--color-overlay-hover': ['#1a24330f', '#dde5ee14'],
    '--color-overlay-pressed': ['#1a24331f', '#dde5ee24'],
    '--color-tint-hover': ['#1a24330f', '#dde5ee14'],
    '--color-skeleton': ['#1a24331a', '#dde5ee1a'],
    '--color-shadow': ['#1a24331f', '#00000066'],

    '--color-text-primary': [pine, mist],
    '--color-text-secondary': secondary,
    '--color-text-disabled': ['#707c8c', '#6f7c8d'],
    '--color-icon-primary': [pine, mist],
    '--color-icon-secondary': secondary,
    '--color-icon-disabled': ['#707c8c', '#6f7c8d'],
    '--color-on-light': pine,
    '--color-on-dark': mist,

    '--color-border': ['#1a243326', '#dde5ee1f'],
    '--color-border-emphasized': ['#1a243359', '#dde5ee4d'],

    // Teal: the one action colour.
    '--color-accent': ['#1f6b6b', '#6cc4bd'],
    '--color-accent-muted': ['#1f6b6b1f', '#6cc4bd26'],
    '--color-text-accent': ['#195c5c', '#7fd0c8'],
    '--color-icon-accent': ['#195c5c', '#7fd0c8'],
    '--color-on-accent': ['#ffffff', '#0b1a1a'],

    // Rose red: failures only.
    '--color-error': ['#b3263a', '#f07f8a'],
    '--color-error-muted': ['#b3263a1a', '#f07f8a26'],
    '--color-on-error': ['#ffffff', '#240a0e'],
    '--color-on-error-muted': ['#8c1c2c', '#f7b5bb'],
    '--color-text-error': ['#b3263a', '#f07f8a'],
    '--color-icon-error': ['#b3263a', '#f07f8a'],
    '--color-border-error': ['#b3263a', '#f07f8a'],

    '--color-text-yellow': sand,
    '--color-icon-yellow': sand,
    '--color-border-yellow': sand,
    '--color-background-yellow': soft(sand),
    '--color-text-green': sea,
    '--color-icon-green': sea,
    '--color-border-green': sea,
    '--color-background-green': soft(sea),
    '--color-text-pink': coral,
    '--color-icon-pink': coral,
    '--color-border-pink': coral,
    '--color-background-pink': soft(coral),
    '--color-background-purple': soft(coral),
    '--color-text-blue': slate,
    '--color-icon-blue': slate,
    '--color-border-blue': slate,
    '--color-background-blue': soft(slate),

    '--shadow-low': hairline,
    '--shadow-med': hairline,
    '--shadow-high': hairline,
  },
});
