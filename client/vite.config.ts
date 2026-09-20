import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: '../worker/dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/room': {
        target: 'http://localhost:8787',
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      '@candy-friends/shared': '../shared/types.ts',
    },
  },
});