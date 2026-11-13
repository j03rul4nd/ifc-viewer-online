// Bundles the local runner and the viewer engine it reuses (same approach as
// mcp/build.mjs). Output goes to scripts/local-runner/dist (gitignored).
import { build } from 'esbuild'

const webIfcShim = {
  name: 'web-ifc-node',
  setup(b) {
    b.onResolve({ filter: /^web-ifc$/ }, (a) => (a.namespace === 'shim' ? { path: 'web-ifc', external: true } : { path: 'web-ifc', namespace: 'shim' }))
    b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({
      contents: "import * as m from 'web-ifc'; export * from 'web-ifc'; export class IfcAPI extends m.IfcAPI { SetWasmPath() {} }",
      loader: 'js',
    }))
    // The IDS parser needs a DOMParser; the app already ships jsdom (tests).
    b.onResolve({ filter: /^@xmldom\/xmldom$/ }, () => ({ path: 'xmldom', namespace: 'xmldom' }))
    b.onLoad({ filter: /.*/, namespace: 'xmldom' }, () => ({
      contents: "import { JSDOM } from 'jsdom'; export const DOMParser = new JSDOM('').window.DOMParser;",
      loader: 'js', resolveDir: process.cwd(),
    }))
  },
}

await build({
  entryPoints: ['scripts/local-runner/runner.ts'],
  outfile: 'scripts/local-runner/dist/runner.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  external: ['jsdom'],
  plugins: [webIfcShim],
  define: { 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production', BASE_URL: '/' }) },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
})
