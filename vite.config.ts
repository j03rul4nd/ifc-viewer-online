import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

// ─── WASM copy plugin ─────────────────────────────────────────────────────────
// Ensures web-ifc WASM files land in dist/ so IfcImporter (worker) can load
// them at a stable same-origin path in production builds.
// In dev mode Vite's dev server already serves node_modules directly.
function copyWebIfcWasm() {
  return {
    name: 'copy-web-ifc-wasm',
    writeBundle() {
      const wasmFiles = ['web-ifc.wasm', 'web-ifc-mt.wasm']
      const src = path.resolve(__dirname, 'node_modules/web-ifc')
      const dst = path.resolve(__dirname, 'dist')
      mkdirSync(dst, { recursive: true })
      for (const file of wasmFiles) {
        const srcPath = path.join(src, file)
        if (existsSync(srcPath)) {
          copyFileSync(srcPath, path.join(dst, file))
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyWebIfcWasm()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Ensure all packages resolve to the same Three.js copy regardless of
    // whether they are pre-bundled or served raw (optimizeDeps.exclude).
    dedupe: ['three'],
  },

  // web-ifc WASM must be served with correct Content-Type.
  // Vite automatically serves .wasm files from the public/ dir with the right
  // MIME type; for node_modules we rely on the plugin above + assetsInclude.
  assetsInclude: ['**/*.wasm'],

  optimizeDeps: {
    exclude: [
      '@thatopen/components',
      '@thatopen/components-front',
      '@thatopen/fragments',
      'web-ifc',
    ],
  },

  // ── Worker config ─────────────────────────────────────────────────────
  worker: {
    format: 'es',
    plugins: () => [],
    rollupOptions: {
      external: ['three'],
    },
  },

  server: {
    port: 3000,
    headers: {
      // Required for SharedArrayBuffer + performance.measureUserAgentSpecificMemory()
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  build: {
    // Increase the warning threshold for large @thatopen chunks
    chunkSizeWarningLimit: 4000,
  },

  // ── Vitest ────────────────────────────────────────────────────────────
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})
