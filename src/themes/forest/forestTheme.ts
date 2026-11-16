// Forest: Paperback's type, corners and 8px module in moss greens. Every colour is a [light, dark] tuple.
// Astryx theme entries may only import modules inside their own directory, so the shared Paperback
// settings and icons are copied here; keep them in step with ../paperback/paperbackTheme.ts.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { forestIcons } from './icons';

const mist = '#e3ecd9',
  pine = '#17251a';
const hairline = 'inset 0 0 0 1px light-dark(#17251a26, #e3ecd91f)';

// Series inks in the same hue slots as Paperback: yellow = ochre, green = fern, pink = berry, blue = pine teal.
type Pair = [light: string, dark: string];
const ochre: Pair = ['#7a5c10', '#d9b25a'],
  fern: Pair = ['#3b6629', '#9cc47a'],
  berry: Pair = ['#93405a', '#de8aa3'],
  teal: Pair = ['#1f6461', '#7fbfb8'];
const soft = ([l, d]: Pair): Pair => [`${l}24`, `${d}2e`];
const secondary: Pair = ['#4a5c48', '#a3b39c'];

export const forestTheme = defineTheme({
  name: 'forest',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    heading: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    code: { family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace' },
  },
  radius: { base: 8, multiplier: 1 },
  icons: forestIcons,
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
    '--rabbithole-band-ink': ['#eef3e0', '#e9efd9'],
    '--rabbithole-band-muted': ['#b9c7a4', '#b3c19d'],
    '--rabbithole-map-node-width': '16rem',
    '--rabbithole-sidebar-width': '14.5rem',
    '--rabbithole-branch-width': '2px',
    '--rabbithole-branch-focus-width': '2.5px',
    '--rabbithole-branch-draw-duration': '350ms',
    '--rabbithole-selection': ['#c3dcae', '#9cc47a59'],
    '--rabbithole-band': '#1f3324',
    '--rabbithole-paper': [pine, mist],
    '--rabbithole-paper-ink': ['#f5f8f0', '#121a14'],
    '--rabbithole-ink-1': ochre,
    '--rabbithole-ink-2': fern,
    '--rabbithole-ink-3': berry,
    '--rabbithole-ink-4': teal,
    '--rabbithole-ink-on': ['#ffffff', '#121a14'],
    '--rabbithole-branch-color': ['#17251abf', '#e3ecd9bf'],
  },
  tokens: {
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-inner': '6px',
    '--radius-page': '16px',
    '--radius-chat': '16px',

    '--focus-outline-color': [pine, mist],

    '--color-background-body': ['#eaf0e3', '#121a14'],
    '--color-background-surface': ['#f5f8f0', '#1a241c'],
    '--color-background-card': ['#f5f8f0', '#1a241c'],
    '--color-background-popover': ['#ffffff', '#222e24'],
    '--color-background-muted': ['#dce5d2', '#0d130e'],
    '--color-background-gray': ['#17251a1a', '#e3ecd91f'],
    '--color-border-gray': ['#17251a26', '#e3ecd91f'],
    '--color-icon-gray': secondary,
    '--color-neutral': ['#17251a1a', '#e3ecd91f'],
    '--color-overlay': ['#17251a66', '#060a07b8'],
    '--color-overlay-hover': ['#17251a0f', '#e3ecd914'],
    '--color-overlay-pressed': ['#17251a1f', '#e3ecd924'],
    '--color-tint-hover': ['#17251a0f', '#e3ecd914'],
    '--color-skeleton': ['#17251a1a', '#e3ecd91a'],
    '--color-shadow': ['#17251a1f', '#00000066'],

    '--color-text-primary': [pine, mist],
    '--color-text-secondary': secondary,
    '--color-text-disabled': ['#738270', '#76866f'],
    '--color-icon-primary': [pine, mist],
    '--color-icon-secondary': secondary,
    '--color-icon-disabled': ['#738270', '#76866f'],
    '--color-on-light': pine,
    '--color-on-dark': mist,

    '--color-border': ['#17251a26', '#e3ecd91f'],
    '--color-border-emphasized': ['#17251a59', '#e3ecd94d'],

    // Moss: the one action colour.
    '--color-accent': ['#3b6629', '#a6c77a'],
    '--color-accent-muted': ['#3b66291f', '#a6c77a26'],
    '--color-text-accent': ['#335a22', '#b3d388'],
    '--color-icon-accent': ['#335a22', '#b3d388'],
    '--color-on-accent': ['#ffffff', '#121a0c'],

    // Rose red: failures only.
    '--color-error': ['#b3263a', '#f07f8a'],
    '--color-error-muted': ['#b3263a1a', '#f07f8a26'],
    '--color-on-error': ['#ffffff', '#240a0e'],
    '--color-on-error-muted': ['#8c1c2c', '#f7b5bb'],
    '--color-text-error': ['#b3263a', '#f07f8a'],
    '--color-icon-error': ['#b3263a', '#f07f8a'],
    '--color-border-error': ['#b3263a', '#f07f8a'],

    '--color-text-yellow': ochre,
    '--color-icon-yellow': ochre,
    '--color-border-yellow': ochre,
    '--color-background-yellow': soft(ochre),
    '--color-text-green': fern,
    '--color-icon-green': fern,
    '--color-border-green': fern,
    '--color-background-green': soft(fern),
    '--color-text-pink': berry,
    '--color-icon-pink': berry,
    '--color-border-pink': berry,
    '--color-background-pink': soft(berry),
    '--color-background-purple': soft(berry),
    '--color-text-blue': teal,
    '--color-icon-blue': teal,
    '--color-border-blue': teal,
    '--color-background-blue': soft(teal),

    '--shadow-low': hairline,
    '--shadow-med': hairline,
    '--shadow-high': hairline,
  },
});
