import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/app/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // Prefer TypeScript sources over stray compiled `.js` files co-located in `src/`.
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (p) => p.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir:    '../../landing/app',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom'],
          router:   ['react-router-dom'],
          query:    ['@tanstack/react-query'],
          charts:   ['recharts'],
          zustand:  ['zustand'],
        },
      },
    },
  },
})
