import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'worker') {
    return {
      build: {
        lib: {
          entry: 'src/index.ts',
          name: 'worker',
          formats: ['es'],
          fileName: 'worker',
        },
        outDir: 'dist',
        minify: 'esbuild',
        target: 'esnext',
        rollupOptions: {
          external: ['@candy-friends/shared'],
          output: {
            format: 'esm',
          },
        },
      },
    };
  }
  
  return {};
});