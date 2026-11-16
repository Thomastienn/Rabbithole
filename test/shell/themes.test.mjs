import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appearances,
  savedAppearance,
  savedTheme,
  themeChoices,
} from '../../src/shell/appearance.ts';
import { savePreference, savedLibraryLayout, savedVim } from '../../src/shell/preferences.ts';
import { DIAGRAM_HUES, diagramTheme } from '../../src/media/diagramTheme.ts';
const { themes } = await import('../../src/shell/astryx-themes.ts');

test('browser preferences restore valid choices independently, fall back safely and tolerate denied storage', (t) => {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() =>
    original
      ? Object.defineProperty(globalThis, 'localStorage', original)
      : delete globalThis.localStorage,
  );
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
  });
  assert.equal(savedAppearance(), 'dark');
  assert.equal(savedTheme(null), 'paperback');
  assert.equal(savedVim(), false);
  assert.equal(savedLibraryLayout(), 'shelf', 'Shelf is the default');
  savePreference('library-layout', 'list');
  assert.equal(savedLibraryLayout(), 'list');
  savePreference('library-layout', 'garbage');
  assert.equal(savedLibraryLayout(), 'shelf');
  for (const { id } of appearances) {
    savePreference('appearance', id);
    assert.equal(savedAppearance(), id);
  }
  for (const { id } of themeChoices) {
    savePreference('theme', id);
    assert.equal(savedTheme(values.get('rabbithole.theme')), id);
    assert.equal(savedAppearance(), 'system');
  }
  for (const [value, on] of [
    ['on', true],
    ['off', false],
    ['garbage', false],
  ]) {
    savePreference('vim', value);
    assert.equal(savedVim(), on);
    assert.equal(savedAppearance(), 'system');
    assert.equal(savedTheme(values.get('rabbithole.theme')), 'graphite');
  }
  savePreference('appearance', 'sepia');
  assert.equal(savedAppearance(), 'dark');
  assert.equal(savedTheme('ocean'), 'paperback');
  assert.equal(values.has('rabbithole.bubble-tint'), false);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Denied');
    },
  });
  assert.equal(savedAppearance(), 'dark');
  assert.equal(savedVim(), false);
  assert.equal(savedLibraryLayout(), 'shelf');
  assert.doesNotThrow(() => savePreference('theme', 'forest'));
});

const pair = (value) =>
  /^light-dark\(([^,]+),\s*([^)]+)\)$/.exec(value)?.slice(1) ?? [value, value];
const rgb = (hex) => [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16));
const contrast = (fg, bg) => {
  const lum = (c) =>
    c
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [a, b] = [lum(fg), lum(bg)].sort((a, b) => b - a);
  return (a + 0.05) / (b + 0.05);
};

test('all six authored and shipped theme modules agree on surfaces, neutral bubbles, focus and ordered series inks', async () => {
  const surfaces = [
    ['#faf7f0', '#241f1a'],
    ['#f5f8f0', '#1a241c'],
    ['#f3f6f9', '#1a222d'],
    ['#f8f3f8', '#211926'],
    ['#fbf5ee', '#2b1e18'],
    ['#f7f7f7', '#202020'],
  ];
  const tiles = [];
  for (const [{ id }, expected] of themeChoices.map((t, i) => [t, surfaces[i]])) {
    const authored = (await import(`../../src/themes/${id}/${id}Theme.ts`))[`${id}Theme`];
    const theme = themes[id];
    assert.equal(theme.name, id);
    assert.deepEqual(theme.tokens, authored.tokens);
    assert.deepEqual(theme.localTokens, authored.localTokens);
    assert.deepEqual(pair(theme.tokens['--color-background-surface']), expected);
    assert.equal(theme.tokens['--focus-outline-color'], theme.localTokens['--rabbithole-paper']);
    for (const [n, hue] of ['yellow', 'green', 'pink', 'blue'].entries())
      assert.equal(
        theme.tokens[`--color-text-${hue}`],
        theme.localTokens[`--rabbithole-ink-${n + 1}`],
      );
    tiles.push(
      JSON.stringify(
        ['--color-background-body', '--color-neutral', '--color-accent'].map(
          (k) => theme.tokens[k],
        ),
      ),
    );
  }
  assert.equal(new Set(tiles).size, 6);
});

test('Paperback token text, selection, action, focus and neutral question bubbles meet contrast minima', () => {
  const theme = themes.paperback,
    tokens = { ...theme.tokens, ...theme.localTokens };
  for (const mode of [0, 1]) {
    const color = (k) => pair(tokens[k])[mode];
    for (const ground of [
      '--color-background-body',
      '--color-background-surface',
      '--color-background-muted',
      '--color-background-popover',
    ]) {
      const bg = rgb(color(ground));
      for (const key of [
        '--color-text-primary',
        '--color-text-secondary',
        '--color-text-accent',
        '--color-text-error',
        '--color-accent',
        '--focus-outline-color',
      ]) {
        const minimum = key === '--color-accent' || key === '--focus-outline-color' ? 3 : 4.5;
        assert.ok(contrast(rgb(color(key)), bg) >= minimum, `${mode}: ${key} on ${ground}`);
      }
      const sel = color('--rabbithole-selection'),
        alpha = sel.length === 9 ? parseInt(sel.slice(7), 16) / 255 : 1;
      assert.ok(
        contrast(
          rgb(color('--color-text-primary')),
          rgb(sel).map((v, i) => v * alpha + bg[i] * (1 - alpha)),
        ) >= 4.5,
      );
    }
    const neutral = color('--color-neutral'),
      alpha = parseInt(neutral.slice(7), 16) / 255;
    const bubble = rgb(neutral).map(
      (v, i) => v * alpha + rgb(color('--color-background-surface'))[i] * (1 - alpha),
    );
    assert.ok(contrast(rgb(color('--color-text-primary')), bubble) >= 4.5);
  }
});

test('Mermaid palette uses current app ink and surface, with amber/lichen/rust/leaf series in both modes', () => {
  assert.deepEqual(DIAGRAM_HUES, ['yellow', 'blue', 'pink', 'green']);
  for (const theme of Object.values(themes))
    for (const mode of [0, 1]) {
      const series = DIAGRAM_HUES.map((h) => pair(theme.tokens[`--color-text-${h}`])[mode]);
      const style = {
        color: pair(theme.tokens['--color-text-primary'])[mode],
        backgroundColor: pair(theme.tokens['--color-background-surface'])[mode],
        borderColor: 'seam',
        fontSize: '14px',
        fontFamily: 'Archivo',
      };
      const vars = diagramTheme(style, series, mode === 1);
      assert.equal(vars.darkMode, mode === 1);
      assert.equal(vars.textColor, style.color);
      assert.equal(vars.lineColor, style.color);
      assert.equal(vars.primaryColor, style.backgroundColor);
      assert.equal(vars.fontFamily, 'Archivo');
      assert.equal(vars.xyChart.plotColorPalette, series.join(','));
      for (const [i, ink] of series.entries()) {
        assert.equal(vars[`pie${i + 1}`], ink);
        assert.equal(vars[`cScale${i}`], ink);
        assert.equal(vars[`git${i}`], ink);
        assert.equal(vars[`cScaleLabel${i}`], style.backgroundColor);
      }
    }
});
