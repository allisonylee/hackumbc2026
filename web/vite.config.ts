import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pre-bundle deps that are only imported by one tab, so the first visit to that tab doesn't
  // trigger a mid-session re-optimize + reload (which briefly loads two copies of React in dev).
  optimizeDeps: { include: ['scrollama'] },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
