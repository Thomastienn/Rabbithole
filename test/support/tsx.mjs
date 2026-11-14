// node --import ./test/support/tsx.mjs: lets node --test import .tsx, extensionless src imports and CSS.
import { createRequire, registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// registerHooks is synchronous, so use the esbuild copy vite ships (transformSync) rather than
// vite's async transformWithEsbuild wrapper.
const require = createRequire(import.meta.url);
let transformSync;

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      // Vite-style extensionless relative imports: try .ts then .tsx.
      if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.{1,2}\//.test(specifier)) throw error;
      for (const ext of ['.ts', '.tsx']) {
        try {
          return next(specifier + ext, context);
        } catch {}
      }
      throw error;
    }
  },
  load(url, context, next) {
    if (/\.css(\?|$)/.test(url)) return { format: 'module', source: '', shortCircuit: true };
    if (!url.startsWith('file:') || !url.endsWith('.tsx')) return next(url, context);
    const path = fileURLToPath(url);
    transformSync ??= createRequire(require.resolve('vite'))('esbuild').transformSync;
    const { code } = transformSync(readFileSync(path, 'utf8'), {
      loader: 'tsx',
      jsx: 'automatic',
      format: 'esm',
      sourcefile: path,
      sourcemap: 'inline',
    });
    return { format: 'module', source: code, shortCircuit: true };
  },
});
