import { createDashboardViteConfig } from './vite.shared'

export default createDashboardViteConfig((mode) => {
  if (mode === 'standalone') {
    return {
      base: '/',
      outDir: 'dist',
    }
  }

  return {
    base: '/app/',
    outDir: '../../landing/app',
  }
})
