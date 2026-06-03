/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Single Vite + Vitest config. The app is a static SPA that talks to the FastAPI
// backend over HTTP (configurable via VITE_API_BASE / ?api= / window.POF_API_BASE).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
  test: {
    environment: 'node', // crypto.subtle + TextEncoder are available globally in Node 20+
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
