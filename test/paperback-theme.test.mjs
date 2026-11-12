import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The shipped theme wears the mockup's root tokens (docs/mockups/mock.css), both appearances.
// First declaration wins: the theme root precedes component-state overrides.
const pairs = text => Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*light-dark\(([^)]+)\)/g)].reverse().map(m => [m[1], m[2].replace(/\s+/g, '')]));
const mock = pairs(readFileSync('docs/mockups/mock.css', 'utf8'));
const theme = pairs(readFileSync('src/themes/paperback/paperback.css', 'utf8'));
const css = readFileSync('src/themes/paperback/paperback.css', 'utf8');

const map = {
  '--ground': '--color-background-body', '--surface': '--color-background-surface', '--raised': '--color-background-popover',
  '--deep': '--color-background-muted', '--seam': '--color-border', '--seam-strong': '--color-border-emphasized',
  '--text': '--color-text-primary', '--muted': '--color-text-secondary', '--faint': '--color-text-disabled',
  '--hover': '--color-overlay-hover', '--pressed': '--color-overlay-pressed', '--overlay': '--color-overlay',
  '--accent': '--color-accent', '--accent-ink': '--color-on-accent', '--accent-text': '--color-text-accent', '--accent-soft': '--color-accent-muted',
  '--selection': '--treetutor-selection', '--alert': '--color-error', '--alert-soft': '--color-error-muted', '--alert-ink': '--color-on-error',
  '--paper': '--treetutor-paper', '--paper-ink': '--treetutor-paper-ink', '--band-ink': '--treetutor-band-ink', '--band-muted': '--treetutor-band-muted',
  '--ink-1': '--treetutor-ink-1', '--ink-2': '--treetutor-ink-2', '--ink-3': '--treetutor-ink-3', '--ink-4': '--treetutor-ink-4', '--ink-on': '--treetutor-ink-on',
  // Series inks also fill the hue slots that diagrams and bubble tints read.
  '--ink-1 ': '--color-text-yellow', '--ink-2 ': '--color-text-green', '--ink-3 ': '--color-text-pink', '--ink-4 ': '--color-text-blue',
};

test('every mockup colour token is a theme token with the same light and dark values', () => {
  for (const [from, to] of Object.entries(map)) assert.equal(theme[to], mock[from.trim()], `${from.trim()} -> ${to}`);
  assert.equal(theme['--focus-outline-color'], mock['--paper'], 'focus is paper');
  assert.match(css, /--treetutor-band: #33432a/);
});

test('type faces, 3px corners and the 8px module', () => {
  assert.match(css, /--font-family-body: Archivo,/);
  assert.match(css, /--treetutor-font-reading: Literata,/);
  assert.match(css, /--radius-element: 3px/);
  assert.match(css, /--treetutor-module: 8px/);
});
