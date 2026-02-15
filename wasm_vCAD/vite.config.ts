import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['vcad-engine']
  },
  build: {
    target: 'esnext'
  },
  server: {
    port: 5175,
    fs: {
      allow: ['..']
    }
  }
})
