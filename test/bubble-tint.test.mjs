import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bubbleTints, savedTint } from '../src/bubbleTint.ts';

// Read [light, dark] tuples straight from the theme source; ink/chalk are its two named constants.
const theme = readFileSync('src/themes/slate/slateTheme.ts', 'utf8');
const consts = { ink: '#1c2724', chalk: '#ebe7dc' };
const token = name => {
  const m = theme.match(new RegExp(`'${name}': \\[([^\\]]+)\\]`));
  assert.ok(m, `theme token ${name}`);
  return m[1].split(',').map(s => { s = s.trim().replace(/'/g, ''); return consts[s] ?? s; });
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

test('saved tints from the old palette map to their chalk hue', () => {
  assert.equal(savedTint(null), 'neutral');
  assert.equal(savedTint('blue'), 'blue');
  assert.equal(savedTint('purple'), 'pink');
  assert.equal(savedTint('accent'), 'yellow');
  assert.equal(savedTint('bogus'), 'neutral');
});
