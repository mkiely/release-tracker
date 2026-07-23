import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Asset path prefix. Defaults to '/' for dev/same-origin; set VITE_BASE_PATH
  // (e.g. '/release-tracker/') when deploying the standalone summary viewer to a
  // subpath such as GitHub Pages.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two entry points: the app (index.html) and the standalone, server-free
      // executive-summary viewer (summary.html). The viewer shares the design
      // tokens and presentational components but pulls in no app state.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        summary: fileURLToPath(new URL('./summary.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      // App-owned Sync Contract package; resolved to local source in this repo.
      '@release-tracker/sync-contract': fileURLToPath(
        new URL('./packages/sync-contract/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
