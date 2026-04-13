import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Alchemy-Survivors/',
  server: { port: 3001 },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    assetsInlineLimit: 4096,
    sourcemap: false,
  },
});
