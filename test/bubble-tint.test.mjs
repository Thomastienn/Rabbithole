import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bubbleTints, savedTint } from '../src/bubbleTint.ts';

// Read [light, dark] pairs from the built theme CSS.
const theme = readFileSync('src/themes/paperback/paperback.css', 'utf8');
const token = name => {
  const m = theme.match(new RegExp(`${name}: light-dark\\(([^)]+)\\)`));
  assert.ok(m, `theme token ${name}`);
  return m[1].split(',').map(s => s.trim());
};
const rgba = hex => { const h = hex.slice(1); return [0, 2, 4, 6].map(i => i < 6 ? parseInt(h.slice(i, i + 2), 16) : h.length > 6 ? parseInt(h.slice(6, 8), 16) / 255 : 1); };
const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
const lum = rgb => { const [r, g, b] = rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('every bubble tint gives question text AA contrast on the chat surface in both appearances', () => {
  const surface = token('--color-background-surface'), text = token('--color-text-primary');
  for (const tint of bubbleTints) {
    const fill = token(tint.color.match(/var\((--[\w-]+)\)/)[1]);
    [0, 1].forEach(appearance => {
      const ratio = contrast(rgba(text[appearance]).slice(0, 3), over(rgba(fill[appearance]), rgba(surface[appearance])));
      assert.ok(ratio >= 4.5, `${tint.id} ${appearance ? 'dark' : 'light'}: ${ratio.toFixed(2)}`);
    });
  }
});

test('saved tints from the old palette map to their nearest ink', () => {
  assert.equal(savedTint(null), 'neutral');
  assert.equal(savedTint('blue'), 'blue');
  assert.equal(savedTint('purple'), 'pink');
  assert.equal(savedTint('accent'), 'yellow');
  assert.equal(savedTint('bogus'), 'neutral');
});

test('theme text, actions and inks meet AA on the ground and surface in both appearances', () => {
  const grounds = ['--color-background-body', '--color-background-surface', '--color-background-popover'].map(token);
  const texts = ['--color-text-primary', '--color-text-secondary', '--color-text-accent', '--color-text-error',
    '--color-text-yellow', '--color-text-green', '--color-text-pink', '--color-text-blue'];
  for (const name of texts) for (const ground of grounds) [0, 1].forEach(appearance => {
    const ratio = contrast(rgba(token(name)[appearance]), rgba(ground[appearance]));
    assert.ok(ratio >= 4.5, `${name} ${appearance ? 'dark' : 'light'}: ${ratio.toFixed(2)}`);
  });
  const pairs = [['--color-on-accent', '--color-accent'], ['--color-on-error', '--color-error']];
  for (const [fg, bg] of pairs) [0, 1].forEach(appearance => {
    const ratio = contrast(rgba(token(fg)[appearance]), rgba(token(bg)[appearance]));
    assert.ok(ratio >= 4.5, `${fg} on ${bg} ${appearance ? 'dark' : 'light'}: ${ratio.toFixed(2)}`);
  });
  // Paper focus ring: non-text contrast against every ground.
  for (const ground of grounds) [0, 1].forEach(appearance => {
    assert.ok(contrast(rgba(token('--focus-outline-color')[appearance]), rgba(ground[appearance])) >= 3);
  });
});
