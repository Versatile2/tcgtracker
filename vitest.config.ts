import { config } from 'dotenv';
config({ path: '.env.local' });

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/setup/global-setup.ts',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    fileParallelism: false, // integration tests share one test DB
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
});
