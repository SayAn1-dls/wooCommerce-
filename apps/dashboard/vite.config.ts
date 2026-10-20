import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// in dev, send API and MCP calls to the gateway running in k3d
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://app.localhost', changeOrigin: true },
      '/mcp': { target: 'http://app.localhost', changeOrigin: true },
    },
  },
})
