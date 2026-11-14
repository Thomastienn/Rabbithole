import { defineConfig } from 'vite';
export default defineConfig({
  // Fonts stay files: the app CSP allows font-src 'self' only, so small subsets must not become data: URLs.
  build: {
    assetsInlineLimit: (file: string) => (/\.woff2?$/.test(file) ? false : undefined),
    rollupOptions: {
      input: { main: 'index.html', sandbox: 'sandbox.html' },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client'))
          return;
        warn(warning);
      },
    },
  },
});
