import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    port: 3014,
    host: true, // 0.0.0.0 바인딩 — 같은 WiFi의 폰/태블릿에서 http://<맥IP>:3014 로 접속 가능
  },
  preview: {
    port: 3014,
    host: true,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 5000,
  },
})
