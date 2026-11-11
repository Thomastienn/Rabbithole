// Lecture-hall Slate: TreeTutor's world (docs/visual-identity-spec.md, Direction contract).
// Every value is a [light, dark] tuple; dark is the default appearance.
import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

const chalk = '#ebe7dc', ink = '#1c2724';
// One elevation step and hairline seams, never drop shadows.
const hairline = 'inset 0 0 0 1px light-dark(#1c27241f, #ebe7dc1f)';

export const slateTheme = defineTheme({
  name: 'slate',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: { family: 'Public Sans', fallbacks: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    heading: { family: 'Public Sans', fallbacks: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    code: { family: 'ui-monospace', fallbacks: '"SF Mono", Monaco, Consolas, "Liberation Mono", monospace' },
  },
  // 4px elements, 6px panels.
  radius: { base: 4, multiplier: 1 },
  localTokens: {
    // Reply and question reading face.
    '--treetutor-font-reading': '"Source Serif 4", Georgia, "Times New Roman", serif',
    // Chalk-yellow text selection; text keeps its colour and passes AA on it in both appearances.
    '--treetutor-selection': ['#e8d27a', '#e8d27a4d'],
    '--treetutor-map-node-width': '16rem',
    '--treetutor-sidebar-width': '14.5rem',
    '--treetutor-branch-color': ['#1c2724bf', '#ebe7dcbf'],
    '--treetutor-branch-width': '2px',
    '--treetutor-branch-focus-width': '2.5px',
    '--treetutor-branch-draw-duration': '350ms',
  },
  tokens: {
    '--radius-element': '4px',
    '--radius-container': '6px',
    '--radius-inner': '2px',
    '--radius-page': '6px',
    '--radius-chat': '6px',

    // Ground, raised surface, deeper rail.
    '--color-background-body': ['#e7ebe6', '#1c2724'],
    '--color-background-surface': ['#f3f5f1', '#24312d'],
    '--color-background-card': ['#f3f5f1', '#24312d'],
    '--color-background-popover': ['#f7f8f5', '#2a3833'],
    '--color-background-muted': ['#dce2dc', '#16201d'],
    '--color-background-gray': ['#1c27241a', '#ebe7dc1f'],
    '--color-neutral': ['#1c27241a', '#ebe7dc1f'],
    '--color-overlay': ['#1c272466', '#0b110fb3'],
    '--color-overlay-hover': ['#1c27240f', '#ebe7dc14'],
    '--color-overlay-pressed': ['#1c27241f', '#ebe7dc24'],
    '--color-tint-hover': ['#1c27240f', '#ebe7dc14'],
    '--color-skeleton': ['#1c27241a', '#ebe7dc1a'],
    '--color-shadow': ['#1c27241f', '#00000066'],

    // Chalk text.
    '--color-text-primary': [ink, chalk],
    '--color-text-secondary': ['#4a5a53', '#9fb0a8'],
    '--color-text-disabled': ['#7d8b85', '#6c7d76'],
    '--color-icon-primary': [ink, chalk],
    '--color-icon-secondary': ['#4a5a53', '#9fb0a8'],
    '--color-icon-disabled': ['#7d8b85', '#6c7d76'],
    '--color-on-light': ink,
    '--color-on-dark': chalk,

    // Hairline seams.
    '--color-border': ['#1c272424', '#ebe7dc1f'],
    '--color-border-emphasized': ['#1c272452', '#ebe7dc47'],

    // Chalk yellow: the one accent (focus, active branch, primary action, branched passage).
    '--color-accent': ['#7a6510', '#e8d27a'],
    '--color-accent-muted': ['#7a65101f', '#e8d27a29'],
    '--color-text-accent': ['#6b5800', '#e8d27a'],
    '--color-icon-accent': ['#6b5800', '#e8d27a'],
    '--color-on-accent': ['#ffffff', ink],

    // The one alert colour: chalk red, for save and generation failures.
    '--color-error': ['#a8382c', '#e88a7a'],
    '--color-error-muted': ['#a8382c1f', '#e88a7a29'],
    '--color-on-error': ['#ffffff', ink],
    '--color-on-error-muted': ['#7d281f', '#f2b3a8'],
    '--color-text-error': ['#a8382c', '#e88a7a'],
    '--color-icon-error': ['#a8382c', '#e88a7a'],
    '--color-border-error': ['#a8382c', '#e88a7a'],

    // Chalk hues: tint and series colours only.
    '--color-text-yellow': ['#6b5800', '#e8d27a'],
    '--color-text-blue': ['#2d5f8a', '#9cc3e6'],
    '--color-text-pink': ['#8f3a64', '#e7a6c6'],
    '--color-text-green': ['#2f6b47', '#9fd3b0'],
    '--color-icon-yellow': ['#6b5800', '#e8d27a'],
    '--color-icon-blue': ['#2d5f8a', '#9cc3e6'],
    '--color-icon-pink': ['#8f3a64', '#e7a6c6'],
    '--color-icon-green': ['#2f6b47', '#9fd3b0'],
    '--color-border-yellow': ['#7a6510', '#e8d27a'],
    '--color-border-blue': ['#2d5f8a', '#9cc3e6'],
    '--color-border-pink': ['#8f3a64', '#e7a6c6'],
    '--color-border-green': ['#2f6b47', '#9fd3b0'],
    '--color-background-yellow': ['#7a651024', '#e8d27a2e'],
    '--color-background-blue': ['#2d5f8a24', '#9cc3e62e'],
    '--color-background-pink': ['#8f3a6424', '#e7a6c62e'],
    '--color-background-purple': ['#8f3a6424', '#e7a6c62e'],
    '--color-background-green': ['#2f6b4724', '#9fd3b02e'],

    '--shadow-low': hairline,
    '--shadow-med': hairline,
    '--shadow-high': hairline,
  },
});
