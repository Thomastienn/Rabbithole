import { defineConfig } from 'vite';
export default defineConfig({
  resolve: { alias: { '@astryxdesign/theme-neutral/fonts.css': '@fontsource/figtree/index.css' } },
  build: { rollupOptions: { onwarn(warning, warn) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
    warn(warning);
  } } },
});
