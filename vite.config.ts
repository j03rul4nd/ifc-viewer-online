import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

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
        if (existsSync(srcPath)) copyFileSync(srcPath, path.join(dst, file))
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyWebIfcWasm()],
  base: '/ifc-viewer-online/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    dedupe: ['three'],
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: [
      '@thatopen/components',
      '@thatopen/components-front',
      '@thatopen/fragments',
      'web-ifc',
    ],
  },
  worker: {
    format: 'es',
    plugins: () => [],
    // Do NOT externalize 'three' here. Web Workers have no module resolution
    // for bare specifiers — externalizing three leaves an unresolvable
    // `import ... from 'three'` in the built worker bundle, which causes a
    // silent module-load failure in production (GitHub Pages / any static host).
    // three must be bundled inline into the worker chunk.
  },
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    // Workers must bundle three inline (see worker config note above),
    // so their chunks will always be large. Raise the warning threshold
    // to avoid noise for those unavoidable bundles.
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // three.js — large 3D engine, changes infrequently
          if (id.includes('/three/')) return 'vendor-three'
          // IFC engine — @thatopen/* + web-ifc JS side
          if (id.includes('@thatopen/') || id.includes('/web-ifc/')) return 'vendor-ifc'
          // Everything else in node_modules (React, Framer, Radix, Zustand…)
          // Kept as one chunk to avoid circular-dependency warnings from
          // cross-imports between React ecosystem packages.
          return 'vendor-ui'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})