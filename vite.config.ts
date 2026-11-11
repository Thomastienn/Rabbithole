import { defineConfig } from 'vite';
export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', sandbox: 'sandbox.html' }, onwarn(warning, warn) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('use client')) return;
    warn(warning);
  } } },
});
