import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Colors and type come from the theme only (docs/visual-identity-spec.md). Theme = generated
// src/astryx-themes.ts plus anything under src/themes/.
const isTheme = path => path === 'src/astryx-themes.ts' || path.startsWith('src/themes/');
// shortcut: named color keywords (red, white) are not detected; add a keyword list if one slips in.
const color = /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const generic = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'serif', 'sans-serif', 'monospace', 'cursive',
  'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);
// Corners come from the --radius-* tokens; only circles (50%) and inherit are allowed literally.
const radius = /(?:border(?:-[a-z]+)*-radius|borderRadius)\s*:\s*([^;}\n]+)/gi;
const radii = text => [...text.matchAll(radius)].map(m => m[1].trim()).filter(v => !/var\(--radius-/.test(v) && !/^['"]?(50%|inherit)['"]?$/.test(v));
const named = list => list.split(',').map(s => s.trim()).filter(s => s && !generic.has(s.toLowerCase()) && !/^(var\(|\$\{)/.test(s));
const families = text => [
  ...[...text.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)].flatMap(m => named(m[1])),
  ...[...text.matchAll(/fontFamily\s*:\s*(['"`])(.*?)\1/g)].flatMap(m => named(m[2]))
];

export function lint(path, text) {
  if (isTheme(path)) return [];
  return [...[...text.matchAll(color)].map(m => `${path}: raw color ${m[0]}`), ...families(text).map(f => `${path}: font family ${f}`),
    ...radii(text).map(r => `${path}: raw radius ${r}`)];
}

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);

test('application source outside the theme has no raw colors, font family names or radii', () => {
  const found = files('src').filter(f => /\.(tsx?|css)$/.test(f)).flatMap(f => lint(f, readFileSync(f, 'utf8')));
  assert.deepEqual(found, []);
});

test('token lint catches planted literals and allows theme-driven values', () => {
  assert.equal(lint('src/x.ts', 'a { color: #1a2b3c; }').length, 1);
  assert.equal(lint('src/x.ts', 'a { background: rgb(0 0 0 / 50%); }').length, 1);
  assert.equal(lint('src/x.ts', 'a { font-family: "Inter", sans-serif; }').length, 1);
  assert.equal(lint('src/x.ts', "const s = { fontFamily: 'Figtree' };").length, 1);
  assert.equal(lint('src/x.ts', 'a { border-radius: 2px 2px 0 0; } b { border-top-left-radius: 0; }').length, 2);
  assert.equal(lint('src/x.ts', 'const s = { borderRadius: 4 };').length, 1);
  assert.deepEqual(lint('src/x.ts', 'a { border-radius: var(--radius-element); } b { border-radius: calc(var(--radius-element) - 1px) 0; } c { border-radius: 50%; } d { border-radius: inherit; }'), []);
  assert.deepEqual(lint('src/x.ts', 'a { font-family: inherit; color: var(--color-text); } b { font-family: monospace; }'), []);
  assert.deepEqual(lint('src/x.ts', 'const o = { fontFamily: style.fontFamily }; const h = "&#123;"; const id = "#root";'), []);
  assert.deepEqual(lint('src/themes/paperback/paperback.css', 'a { color: #fff; font-family: Inter; }'), []);
});
