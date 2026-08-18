import { config } from 'dotenv';
config({ path: '.env.local' });

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/setup/global-setup.ts',
    // Node by default; component tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock, so the DB-backed suites are not
    // dragged through a DOM they never touch.
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.tsx'],
    fileParallelism: false, // integration tests share one test DB
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
