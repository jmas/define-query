import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'define-query': path.resolve(__dirname, '../define-query/src/index.ts'),
    },
  },
});
