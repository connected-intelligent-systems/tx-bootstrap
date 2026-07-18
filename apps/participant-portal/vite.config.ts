import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appDependency = (dependencyPath: string) => path.resolve(__dirname, '../../node_modules', dependencyPath)

const reactAliases = [
  { find: /^react$/, replacement: appDependency('react/index.js') },
  { find: /^react\/jsx-runtime$/, replacement: appDependency('react/jsx-runtime.js') },
  { find: /^react\/jsx-dev-runtime$/, replacement: appDependency('react/jsx-dev-runtime.js') },
  { find: /^react-dom$/, replacement: appDependency('react-dom/index.js') },
  { find: /^react-dom\/client$/, replacement: appDependency('react-dom/client.js') },
]

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: reactAliases,
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      // Keep development on the same scoped participant API boundary as production.
      '/api': {
        target: process.env.VITE_PORTAL_BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  base: './',
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    exclude: ['to-buffer'],
  },
})
