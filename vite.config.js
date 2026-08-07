import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [vue()],
  server: {
    // The API lives in Vercel functions (api/). Run `vercel dev` (port 3000)
    // next to `npm run dev` to get a working backend locally.
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  optimizeDeps: {
    // Dynamically imported deps: pre-bundle them at server start so the first
    // use in dev doesn't trigger an optimize-and-reload cycle.
    include: ['exceljs', 'cubing/puzzles'],
    // cubing's search worker uses top-level await (see build.target below).
    esbuildOptions: { target: 'es2022' }
  },
  build: {
    // The cubing.js search worker (used by the cycle break trainer to turn a
    // generated position into a scramble) ships top-level await.
    target: 'es2022',
    rollupOptions: {
      output: {
        // Split stable vendor code into long-cacheable chunks. cubing and
        // exceljs are dynamic-imported and split automatically.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](@vue|vue|vue-router|pinia)[\\/]/.test(id)) {
            return 'vue-vendor'
          }
          if (/[\\/]node_modules[\\/](bootstrap|@popperjs)[\\/]/.test(id)) {
            return 'bootstrap'
          }
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js']
  }
})
