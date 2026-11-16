// Paperback Series, Seasonal Inks: Rabbithole's world (docs/mockups/mock.css root tokens,
// .impeccable/surfaces/docs-mockups-index-html.md). Every colour is a [light, dark] tuple; dark is the default.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';
import { paperbackIcons } from './icons';

const paper = '#efe6d6',
  bark = '#1f1a15';
// Hairline seams, never drop shadows.
const hairline = 'inset 0 0 0 1px light-dark(#1f1a1526, #efe6d61f)';

// Series inks: amber, leaf, rust, lichen. Astryx hue slots carry them so diagrams and tints follow:
// yellow = amber, green = leaf, pink = rust, blue = lichen.
type Pair = [light: string, dark: string];
const amber: Pair = ['#85600c', '#dfae4e'],
  leaf: Pair = ['#46642a', '#9dba6e'],
  rust: Pair = ['#9a4a22', '#d68560'],
  lichen: Pair = ['#27685f', '#86b8ae'];
const soft = ([l, d]: Pair): Pair => [`${l}24`, `${d}2e`];

export const paperbackTheme = defineTheme({
  name: 'paperback',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    heading: { family: 'Archivo', fallbacks: '"Segoe UI", Helvetica, Arial, sans-serif' },
    code: { family: 'ui-monospace', fallbacks: '"SF Mono", Menlo, Consolas, monospace' },
  },
  // Soft corners: 8px elements.
  radius: { base: 8, multiplier: 1 },
  icons: paperbackIcons,
  // Neutral bumps secondary text to its own greys in these states; keep the paper palette instead.
  components: Object.fromEntries(
    [
      ['item', 'selected'],
      ['tree-list-item', 'selected'],
      ['file-input', 'mode:dropzone'],
      ['citation', 'variant:number'],
    ].map(([name, state]) => [
      name,
      { [state]: { '--color-text-secondary': 'light-dark(#5f5547, #ab9e8b)' } },
    ]),
  ),
  localTokens: {
    // Reply and question reading face.
    '--rabbithole-font-reading': 'Literata, Georgia, "Times New Roman", serif',
    '--rabbithole-selection': ['#c9dba8', '#9dba6e59'],
    // The 8px cover-grid module: every gap, band and column is a multiple.
    '--rabbithole-module': '8px',
    // Moss shell band and its text.
    '--rabbithole-band': '#33432a',
    '--rabbithole-band-ink': ['#eef3e0', '#e9efd9'],
    '--rabbithole-band-muted': ['#b9c7a4', '#b3c19d'],
    // Paper: the trunk ink and focus. Series inks cycle per first-level branch family.
    '--rabbithole-paper': [bark, paper],
    '--rabbithole-paper-ink': ['#faf7f0', '#1a1613'],
    '--rabbithole-ink-1': amber,
    '--rabbithole-ink-2': leaf,
    '--rabbithole-ink-3': rust,
    '--rabbithole-ink-4': lichen,
    '--rabbithole-ink-on': ['#ffffff', '#1a1613'],
    '--rabbithole-map-node-width': '16rem',
    '--rabbithole-sidebar-width': '14.5rem',
    '--rabbithole-branch-color': ['#1f1a15bf', '#efe6d6bf'],
    '--rabbithole-branch-width': '2px',
    '--rabbithole-branch-focus-width': '2.5px',
    '--rabbithole-branch-draw-duration': '350ms',
  },
  tokens: {
    '--radius-element': '8px',
    '--radius-container': '12px',
    '--radius-inner': '6px',
    '--radius-page': '16px',
    '--radius-chat': '16px',

    // Paper focus ring.
    '--focus-outline-color': [bark, paper],

    // Ground, surface, raised, deep panel.
    '--color-background-body': ['#f2eee5', '#1a1613'],
    '--color-background-surface': ['#faf7f0', '#241f1a'],
    '--color-background-card': ['#faf7f0', '#241f1a'],
    '--color-background-popover': ['#ffffff', '#2d2620'],
    '--color-background-muted': ['#e6e0d3', '#14110e'],
    '--color-background-gray': ['#1f1a151a', '#efe6d61f'],
    '--color-border-gray': ['#1f1a1526', '#efe6d61f'],
    '--color-icon-gray': ['#5f5547', '#ab9e8b'],
    '--color-neutral': ['#1f1a151a', '#efe6d61f'],
    '--color-overlay': ['#1f1a1566', '#0a0806b8'],
    '--color-overlay-hover': ['#1f1a150f', '#efe6d614'],
    '--color-overlay-pressed': ['#1f1a151f', '#efe6d624'],
    '--color-tint-hover': ['#1f1a150f', '#efe6d614'],
    '--color-skeleton': ['#1f1a151a', '#efe6d61a'],
    '--color-shadow': ['#1f1a151f', '#00000066'],

    // Paper text.
    '--color-text-primary': [bark, paper],
    '--color-text-secondary': ['#5f5547', '#ab9e8b'],
    '--color-text-disabled': ['#857a6b', '#84786a'],
    '--color-icon-primary': [bark, paper],
    '--color-icon-secondary': ['#5f5547', '#ab9e8b'],
    '--color-icon-disabled': ['#857a6b', '#84786a'],
    '--color-on-light': bark,
    '--color-on-dark': paper,

    // Hairline seams.
    '--color-border': ['#1f1a1526', '#efe6d61f'],
    '--color-border-emphasized': ['#1f1a1559', '#efe6d64d'],

    // Leaf green: the one action colour.
    '--color-accent': ['#46642a', '#9dba6e'],
    '--color-accent-muted': ['#46642a1f', '#9dba6e26'],
    '--color-text-accent': ['#3d5a22', '#a9c67a'],
    '--color-icon-accent': ['#3d5a22', '#a9c67a'],
    '--color-on-accent': ['#ffffff', '#171c0f'],

    // Rose red: failures only.
    '--color-error': ['#b3263a', '#f07f8a'],
    '--color-error-muted': ['#b3263a1a', '#f07f8a26'],
    '--color-on-error': ['#ffffff', '#240a0e'],
    '--color-on-error-muted': ['#8c1c2c', '#f7b5bb'],
    '--color-text-error': ['#b3263a', '#f07f8a'],
    '--color-icon-error': ['#b3263a', '#f07f8a'],
    '--color-border-error': ['#b3263a', '#f07f8a'],

    // Series inks in the Astryx hue slots: tint and series colours only.
    '--color-text-yellow': amber,
    '--color-icon-yellow': amber,
    '--color-border-yellow': amber,
    '--color-background-yellow': soft(amber),
    '--color-text-green': leaf,
    '--color-icon-green': leaf,
    '--color-border-green': leaf,
    '--color-background-green': soft(leaf),
    '--color-text-pink': rust,
    '--color-icon-pink': rust,
    '--color-border-pink': rust,
    '--color-background-pink': soft(rust),
    '--color-background-purple': soft(rust),
    '--color-text-blue': lichen,
    '--color-icon-blue': lichen,
    '--color-border-blue': lichen,
    '--color-background-blue': soft(lichen),

    '--shadow-low': hairline,
    '--shadow-med': hairline,
    '--shadow-high': hairline,
  },
});
