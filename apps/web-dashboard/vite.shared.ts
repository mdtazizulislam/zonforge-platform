import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

type DashboardViteTarget = {
  base: string
  outDir: string
}

export function createDashboardViteConfig(target: DashboardViteTarget) {
  return defineConfig({
    plugins: [react()],
    base: target.base,
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
      extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: target.outDir,
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            query: ['@tanstack/react-query'],
            charts: ['recharts'],
            zustand: ['zustand'],
          },
        },
      },
    },
  })
}