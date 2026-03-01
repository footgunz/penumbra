import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy WebSocket to Go server in dev mode
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        rewriteWsOrigin: true,
      },
      // Proxy API calls to Go server in dev mode
      '/api': {
        target: 'http://localhost:3000',
      },
    },
  },
  build: {
    outDir: '../server/ui/dist',  // output into Go embed path
    emptyOutDir: true,
  },
})
