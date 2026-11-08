import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    // One stylesheet preserves the current visual treatment in the standalone edition.
    cssCodeSplit: false,
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replaceAll('\\', '/');
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(modulePath)) return 'react-vendor';
          if (/\/node_modules\/(recharts|recharts-scale|victory-vendor|d3-[^/]+)\//.test(modulePath)) return 'charts-vendor';
        },
      },
    },
  },
});
