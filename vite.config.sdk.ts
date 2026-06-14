import { defineConfig } from 'vite'
import path from 'path'

// ── IFC Viewer SDK — standalone library build ─────────────────────────────────
// Bundles src/sdk/ifc-viewer-sdk.ts into a single dependency-free ES module that
// hosts can import from a CDN / our own /sdk/ path. The SDK is just an iframe +
// postMessage bridge, so this build carries NO three.js / web-ifc / WASM weight.
//
//   npm run build:sdk   →   public/sdk/ifc-viewer.es.js
//
// Output lands in public/ so it is served by the dev server and copied into
// dist/ by the main `vite build`. emptyOutDir is OFF so we never wipe public/.
export default defineConfig({
  // Don't copy the app's public/ folder into the SDK output (outDir lives inside
  // public/, so without this Vite would duplicate every asset into public/sdk/).
  publicDir: false,
  build: {
    outDir: 'public/sdk',
    // Keep false: the hand-written demo/docs page (public/sdk/index.html) lives
    // here too and must not be wiped on each SDK rebuild.
    emptyOutDir: false,
    target: 'es2020',
    minify: true,
    sourcemap: false,
    lib: {
      entry: path.resolve(__dirname, 'src/sdk/ifc-viewer-sdk.ts'),
      formats: ['es'],
      fileName: () => 'ifc-viewer.es.js',
    },
    rollupOptions: {
      // The SDK has no external deps — bundle everything.
      external: [],
    },
  },
})
