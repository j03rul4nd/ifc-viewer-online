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
    rollupOptions: { external: ['three'] },
  },
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: { chunkSizeWarningLimit: 4000 },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
})