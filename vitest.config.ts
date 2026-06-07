import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['packages/define-query/**/*.test.ts', 'packages/define-query/**/*.test.tsx'],
    environmentMatchGlobs: [['packages/define-query/**/*.test.tsx', 'jsdom']],
  },
});
