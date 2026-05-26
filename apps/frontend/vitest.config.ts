import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'lib/**/*.test.ts',
      'components/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/governance/**/*.ts', 'lib/validators.ts'],
      thresholds: { lines: 85, functions: 85, branches: 80 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
});
