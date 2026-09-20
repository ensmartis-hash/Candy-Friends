import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@candy-friends/shared': resolve(root, '../shared/types.ts'),
      '@candy-friends/shared/abilities': resolve(root, '../shared/abilities.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    deps: {
      inline: ['@candy-friends/shared'],
    },
  },
});
