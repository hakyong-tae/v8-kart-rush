import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    port: 3014,
  },
  preview: {
    port: 3014,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 5000,
  },
})
