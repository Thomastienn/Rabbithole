// Dusk: Paperback's type, corners and 8px module in plum and violet. Every colour is a [light, dark] tuple.
// Astryx theme entries may only import modules inside their own directory, so the shared Paperback
// settings and icons are copied here; keep them in step with ../paperback/paperbackTheme.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { duskIcons } from './icons';

const mist = '#ece0ef',
  pine = '#2a1a2e';
const hairline = 'inset 0 0 0 1px light-dark(#2a1a2e26, #ece0ef1f)';

// Series inks in the same hue slots as Paperback: yellow = amber, green = sage, pink = plum, blue = violet.
type Pair = [light: string, dark: string];
const amber: Pair = ['#7d5a12', '#ddb35e'],
  sage: Pair = ['#3f6633', '#a3c58a'],
  plum: Pair = ['#8a3a6e', '#dd8cc4'],
  violet: Pair = ['#5246a0', '#aea8ee'];
const soft = ([l, d]: Pair): Pair => [`${l}24`, `${d}2e`];
const secondary: Pair = ['#5e4c63', '#b5a3ba'];

export const duskTheme = defineTheme({
  name: 'dusk',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    heading: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    code: { family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace' },
  },
  radius: { base: 8, multiplier: 1 },
  icons: duskIcons,
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
    '--rabbithole-band-ink': ['#f3eaf4', '#efe4f0'],
    '--rabbithole-band-muted': ['#c4abc8', '#bea5c3'],
    '--rabbithole-map-node-width': '16rem',
    '--rabbithole-sidebar-width': '14.5rem',
    '--rabbithole-branch-width': '2px',
    '--rabbithole-branch-focus-width': '2.5px',
    '--rabbithole-branch-draw-duration': '350ms',
    '--rabbithole-selection': ['#ddc9ec', '#c3a3ec59'],
    '--rabbithole-band': '#2e1f33',
    '--rabbithole-paper': [pine, mist],
    '--rabbithole-paper-ink': ['#f8f3f8', '#18121b'],
    '--rabbithole-ink-1': amber,
    '--rabbithole-ink-2': sage,
    '--rabbithole-ink-3': plum,
    '--rabbithole-ink-4': violet,
    '--rabbithole-ink-on': ['#ffffff', '#18121b'],
    '--rabbithole-branch-color': ['#2a1a2ebf', '#ece0efbf'],
  },
  tokens: {
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-inner': '6px',
    '--radius-page': '16px',
    '--radius-chat': '16px',

    '--focus-outline-color': [pine, mist],

    '--color-background-body': ['#f0e8f0', '#18121b'],
    '--color-background-surface': ['#f8f3f8', '#211926'],
    '--color-background-card': ['#f8f3f8', '#211926'],
    '--color-background-popover': ['#ffffff', '#2b2231'],
    '--color-background-muted': ['#e4d9e5', '#100b12'],
    '--color-background-gray': ['#2a1a2e1a', '#ece0ef1f'],
    '--color-border-gray': ['#2a1a2e26', '#ece0ef1f'],
    '--color-icon-gray': secondary,
    '--color-neutral': ['#2a1a2e1a', '#ece0ef1f'],
    '--color-overlay': ['#2a1a2e66', '#0a060bb8'],
    '--color-overlay-hover': ['#2a1a2e0f', '#ece0ef14'],
    '--color-overlay-pressed': ['#2a1a2e1f', '#ece0ef24'],
    '--color-tint-hover': ['#2a1a2e0f', '#ece0ef14'],
    '--color-skeleton': ['#2a1a2e1a', '#ece0ef1a'],
    '--color-shadow': ['#2a1a2e1f', '#00000066'],

    '--color-text-primary': [pine, mist],
    '--color-text-secondary': secondary,
    '--color-text-disabled': ['#84718a', '#85738b'],
    '--color-icon-primary': [pine, mist],
    '--color-icon-secondary': secondary,
    '--color-icon-disabled': ['#84718a', '#85738b'],
    '--color-on-light': pine,
    '--color-on-dark': mist,

    '--color-border': ['#2a1a2e26', '#ece0ef1f'],
    '--color-border-emphasized': ['#2a1a2e59', '#ece0ef4d'],

    // Violet: the one action colour.
    '--color-accent': ['#6a3fa0', '#c3a3ec'],
    '--color-accent-muted': ['#6a3fa01f', '#c3a3ec26'],
    '--color-text-accent': ['#5d3590', '#cdb0f2'],
    '--color-icon-accent': ['#5d3590', '#cdb0f2'],
    '--color-on-accent': ['#ffffff', '#1a0f26'],

    // Rose red: failures only.
    '--color-error': ['#b3263a', '#f07f8a'],
    '--color-error-muted': ['#b3263a1a', '#f07f8a26'],
    '--color-on-error': ['#ffffff', '#240a0e'],
    '--color-on-error-muted': ['#8c1c2c', '#f7b5bb'],
    '--color-text-error': ['#b3263a', '#f07f8a'],
    '--color-icon-error': ['#b3263a', '#f07f8a'],
    '--color-border-error': ['#b3263a', '#f07f8a'],

    '--color-text-yellow': amber,
    '--color-icon-yellow': amber,
    '--color-border-yellow': amber,
    '--color-background-yellow': soft(amber),
    '--color-text-green': sage,
    '--color-icon-green': sage,
    '--color-border-green': sage,
    '--color-background-green': soft(sage),
    '--color-text-pink': plum,
    '--color-icon-pink': plum,
    '--color-border-pink': plum,
    '--color-background-pink': soft(plum),
    '--color-background-purple': soft(plum),
    '--color-text-blue': violet,
    '--color-icon-blue': violet,
    '--color-border-blue': violet,
    '--color-background-blue': soft(violet),

    '--shadow-low': hairline,
    '--shadow-med': hairline,
    '--shadow-high': hairline,
  },
});
