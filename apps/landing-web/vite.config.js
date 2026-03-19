import { defineConfig } from 'vite'

export default defineConfig({
  root: 'public',
  build: {
    outDir:        '../dist',
    emptyOutDir:   true,
    rollupOptions: {
      input: {
        main: 'public/index.html',
        demo: 'public/demo.html',
      },
    },
  },
  server: {
    port: 4000,
    open: true,
  },
})
