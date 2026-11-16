// Ember: Paperback's type, corners and 8px module in terracotta and gold. Every colour is a [light, dark] tuple.
// Astryx theme entries may only import modules inside their own directory, so the shared Paperback
// settings and icons are copied here; keep them in step with ../paperback/paperbackTheme.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { emberIcons } from './icons';

const mist = '#f2e3d4',
  pine = '#35241c';
const hairline = 'inset 0 0 0 1px light-dark(#35241c26, #f2e3d41f)';

// Series inks in the same hue slots as Paperback: yellow = gold, green = umber, pink = clay, blue = ash.
type Pair = [light: string, dark: string];
const gold: Pair = ['#795814', '#e3ba65'],
  umber: Pair = ['#65533c', '#c3b396'],
  clay: Pair = ['#96402b', '#e5a183'],
  ash: Pair = ['#605451', '#bfb1aa'];
const soft = ([l, d]: Pair): Pair => [`${l}24`, `${d}2e`];
const secondary: Pair = ['#665044', '#c4a995'];

export const emberTheme = defineTheme({
  name: 'ember',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    heading: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    code: { family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace' },
  },
  radius: { base: 8, multiplier: 1 },
  icons: emberIcons,
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
    '--rabbithole-font-reading': 'Literata, Georgia, "Times New Roman", serif',
    '--rabbithole-module': '8px',
    '--rabbithole-band-ink': ['#f6e9dc', '#f2e3d4'],
    '--rabbithole-band-muted': ['#c7ab94', '#c7ab94'],
    '--rabbithole-map-node-width': '16rem',
    '--rabbithole-sidebar-width': '14.5rem',
    '--rabbithole-branch-width': '2px',
    '--rabbithole-branch-focus-width': '2.5px',
    '--rabbithole-branch-draw-duration': '350ms',
    '--rabbithole-selection': ['#edd0b8', '#efad8659'],
    '--rabbithole-band': '#40281e',
    '--rabbithole-paper': [pine, mist],
    '--rabbithole-paper-ink': ['#fbf5ee', '#1f1511'],
    '--rabbithole-ink-1': gold,
    '--rabbithole-ink-2': umber,
    '--rabbithole-ink-3': clay,
    '--rabbithole-ink-4': ash,
    '--rabbithole-ink-on': ['#ffffff', '#1f1511'],
    '--rabbithole-branch-color': ['#35241cbf', '#f2e3d4bf'],
  },
  tokens: {
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-inner': '6px',
    '--radius-page': '16px',
    '--radius-chat': '16px',

    '--focus-outline-color': [pine, mist],

    '--color-background-body': ['#f1e5da', '#1f1511'],
    '--color-background-surface': ['#fbf5ee', '#2b1e18'],
    '--color-background-card': ['#fbf5ee', '#2b1e18'],
    '--color-background-popover': ['#ffffff', '#36261e'],
    '--color-background-muted': ['#e5d5c6', '#160e0b'],
    '--color-background-gray': ['#35241c1a', '#f2e3d41f'],
    '--color-border-gray': ['#35241c26', '#f2e3d41f'],
    '--color-icon-gray': secondary,
    '--color-neutral': ['#35241c1a', '#f2e3d41f'],
    '--color-overlay': ['#35241c66', '#0d0806b8'],
    '--color-overlay-hover': ['#35241c0f', '#f2e3d414'],
    '--color-overlay-pressed': ['#35241c1f', '#f2e3d424'],
    '--color-tint-hover': ['#35241c0f', '#f2e3d414'],
    '--color-skeleton': ['#35241c1a', '#f2e3d41a'],
    '--color-shadow': ['#35241c1f', '#00000066'],

    '--color-text-primary': [pine, mist],
    '--color-text-secondary': secondary,
    '--color-text-disabled': ['#8d7669', '#8d7565'],
    '--color-icon-primary': [pine, mist],
    '--color-icon-secondary': secondary,
    '--color-icon-disabled': ['#8d7669', '#8d7565'],
    '--color-on-light': pine,
    '--color-on-dark': mist,

    '--color-border': ['#35241c26', '#f2e3d41f'],
    '--color-border-emphasized': ['#35241c59', '#f2e3d44d'],

    // Terracotta: the one action colour.
    '--color-accent': ['#9b4328', '#e49b75'],
    '--color-accent-muted': ['#9b43281f', '#e49b7526'],
    '--color-text-accent': ['#8a381f', '#efad86'],
    '--color-icon-accent': ['#8a381f', '#efad86'],
    '--color-on-accent': ['#ffffff', '#2b130b'],

    // Rose red: failures only.
    '--color-error': ['#b3263a', '#f07f8a'],
    '--color-error-muted': ['#b3263a1a', '#f07f8a26'],
    '--color-on-error': ['#ffffff', '#240a0e'],
    '--color-on-error-muted': ['#8c1c2c', '#f7b5bb'],
    '--color-text-error': ['#b3263a', '#f07f8a'],
    '--color-icon-error': ['#b3263a', '#f07f8a'],
    '--color-border-error': ['#b3263a', '#f07f8a'],

    '--color-text-yellow': gold,
    '--color-icon-yellow': gold,
    '--color-border-yellow': gold,
    '--color-background-yellow': soft(gold),
    '--color-text-green': umber,
    '--color-icon-green': umber,
    '--color-border-green': umber,
    '--color-background-green': soft(umber),
    '--color-text-pink': clay,
    '--color-icon-pink': clay,
    '--color-border-pink': clay,
    '--color-background-pink': soft(clay),
    '--color-background-purple': soft(clay),
    '--color-text-blue': ash,
    '--color-icon-blue': ash,
    '--color-border-blue': ash,
    '--color-background-blue': soft(ash),

    '--shadow-low': hairline,
    '--shadow-med': hairline,
    '--shadow-high': hairline,
  },
});
