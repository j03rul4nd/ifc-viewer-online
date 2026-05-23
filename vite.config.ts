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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // ── Single Three.js instance fix ─────────────────────────────────────────
      // @thatopen/* packages are excluded from optimizeDeps (see below), so Vite
      // serves them as raw ESM directly from node_modules.  When they import
      // 'three' the bare-specifier would resolve to the raw ESM file on disk,
      // while our app code imports the pre-bundled version from .vite/deps.
      // Two different module URLs → two Three.js instances → __THREE__ warning.
      //
      // IMPORTANT: regex anchored to ^three$ so ONLY the bare specifier is
      // aliased.  A plain string key is a prefix match in Vite and would also
      // rewrite 'three/addons/...' → 'three.module.js/addons/...' (file, not
      // directory) causing an ENOENT crash on startup.
      { find: /^three$/, replacement: path.resolve(__dirname, 'node_modules/three/build/three.module.js') },
    ],
    dedupe: ['three'],
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    // @thatopen packages are large and use dynamic imports that conflict with
    // Vite's pre-bundler; serve them as raw ESM.  The 'three' alias above
    // ensures they all share the same Three.js instance with the app code.
    exclude: [
      '@thatopen/components',
      '@thatopen/components-front',
      '@thatopen/fragments',
      'web-ifc',
    ],
    // Force Vite to pre-bundle three so its .vite/deps chunk exists before the
    // excluded packages request it.  Without this, on a cold start the
    // excluded packages might race against three's pre-bundling and end up
    // with an unresolved dependency.
    include: ['three'],
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
      onwarn(warning, defaultHandler) {
        // The EN locale files are intentionally both statically imported
        // (bundled eagerly so first render has translations) AND referenced
        // via the lazyLoader.ts dynamic template (which Rollup resolves
        // statically). The runtime guard `language === DEFAULT_LOCALE` means
        // the dynamic path is never actually exercised for EN, but Rollup
        // can't know that. Suppress this known-harmless warning.
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' ||
          (warning.message?.includes('dynamically imported') &&
           warning.message?.includes('/locales/en/'))
        ) return
        defaultHandler(warning)
      },
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
