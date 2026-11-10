import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Colors and type come from the theme only (docs/visual-identity-spec.md). Theme = generated
// src/astryx-themes.ts plus anything under src/theme/.
const isTheme = path => path === 'src/astryx-themes.ts' || path.startsWith('src/theme/');
// shortcut: named color keywords (red, white) are not detected; add a keyword list if one slips in.
const color = /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const generic = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'serif', 'sans-serif', 'monospace', 'cursive',
  'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong']);
const named = list => list.split(',').map(s => s.trim()).filter(s => s && !generic.has(s.toLowerCase()) && !/^(var\(|\$\{)/.test(s));
const families = text => [
  ...[...text.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)].flatMap(m => named(m[1])),
  ...[...text.matchAll(/fontFamily\s*:\s*(['"`])(.*?)\1/g)].flatMap(m => named(m[2]))
];

export function lint(path, text) {
  if (isTheme(path)) return [];
  return [...[...text.matchAll(color)].map(m => `${path}: raw color ${m[0]}`), ...families(text).map(f => `${path}: font family ${f}`)];
}

const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);

test('application source outside the theme has no raw colors or font family names', () => {
  const found = files('src').filter(f => /\.(tsx?|css)$/.test(f)).flatMap(f => lint(f, readFileSync(f, 'utf8')));
  assert.deepEqual(found, []);
});

test('token lint catches planted literals and allows theme-driven values', () => {
  assert.equal(lint('src/x.ts', 'a { color: #1a2b3c; }').length, 1);
  assert.equal(lint('src/x.ts', 'a { background: rgb(0 0 0 / 50%); }').length, 1);
  assert.equal(lint('src/x.ts', 'a { font-family: "Inter", sans-serif; }').length, 1);
  assert.equal(lint('src/x.ts', "const s = { fontFamily: 'Figtree' };").length, 1);
  assert.deepEqual(lint('src/x.ts', 'a { font-family: inherit; color: var(--color-text); } b { font-family: monospace; }'), []);
  assert.deepEqual(lint('src/x.ts', 'const o = { fontFamily: style.fontFamily }; const h = "&#123;"; const id = "#root";'), []);
  assert.deepEqual(lint('src/theme/world.css', 'a { color: #fff; font-family: Inter; }'), []);
});
