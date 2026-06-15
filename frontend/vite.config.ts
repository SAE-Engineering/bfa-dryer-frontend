import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local `process` typing so we can read VITE_BASE without pulling in
// @types/node (this config file is type-checked by tsconfig.node.json).
declare const process: { env: Record<string, string | undefined> }

// `base` controls the public path the built SPA is served from.  Default "/"
// (real panel / dev — unchanged).  The bosun sim image builds with
// VITE_BASE=/bfa/sim/ so assets resolve under designs.sauer.com.au/bfa/sim/.
// import.meta.env.BASE_URL flows from this into the API/WS path helpers.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
