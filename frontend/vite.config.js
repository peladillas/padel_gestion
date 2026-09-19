import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Dev-only proxy so `npm run dev` can hit the local Laravel backend
    // directly (mirrors what Nginx's /api and /uploads location blocks
    // do in production — see nginx/default.conf). Does not affect the
    // production build (`vite build` never reads `server.proxy`).
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist' }
})
